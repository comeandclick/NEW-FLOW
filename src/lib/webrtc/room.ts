'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@/lib/supabase/client'

/** Free public STUN + the Open Relay free TURN servers (helps users behind strict NATs). */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['stun:openrelay.metered.ca:80'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
]

const dbg = (...a: unknown[]) => { if (typeof window !== 'undefined' && (window as unknown as { __rtcDebug?: boolean }).__rtcDebug) console.log('[rtc]', ...a) }

export type Participant = { id: string; name: string; stream: MediaStream | null; audio: boolean; video: boolean; sharing: boolean; hand: boolean; local?: boolean }
export type ChatMsg = { id: string; from: string; name: string; text: string; at: number }

type Signal = { from: string; to: string; kind: 'offer' | 'answer' | 'ice'; data: any }
type PeerState = { pc: RTCPeerConnection; initiator: boolean; makingOffer: boolean; ignoreOffer: boolean; polite: boolean; stream: MediaStream; videoSender?: RTCRtpSender; pendingIce: RTCIceCandidateInit[] }

/**
 * Mesh WebRTC room. Signaling and presence run over Supabase Realtime (broadcast + presence).
 * Uses the "perfect negotiation" pattern so screen sharing / renegotiation never glares.
 */
export class Room {
  private channel: any
  private peers = new Map<string, PeerState>()
  private meta = new Map<string, { name: string; audio: boolean; video: boolean; sharing: boolean; hand: boolean }>()
  private local: MediaStream
  private screen: MediaStream | null = null
  private state = { audio: true, video: true, sharing: false, hand: false }
  private closed = false

  constructor(
    private roomId: string,
    private me: { id: string; name: string },
    localStream: MediaStream,
    private hooks: { onParticipants: (p: Participant[]) => void; onChat: (m: ChatMsg) => void; onStatus?: (s: string) => void },
    initial: { audio: boolean; video: boolean },
  ) {
    this.local = localStream
    this.state.audio = initial.audio
    this.state.video = initial.video
  }

  async join() {
    const db = getDb()
    this.channel = db.channel(`room:${this.roomId}`, { config: { presence: { key: this.me.id }, broadcast: { self: false } } })
    this.channel
      .on('presence', { event: 'sync' }, () => this.syncPresence())
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: Signal }) => { if (payload.to === this.me.id) void this.onSignal(payload) })
      .on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMsg }) => this.hooks.onChat(payload))
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status))
      })
    })
    await this.track()
    this.emit()
  }

  private track() {
    return this.channel.track({ name: this.me.name, audio: this.state.audio, video: this.state.video, sharing: this.state.sharing, hand: this.state.hand })
  }

  private syncPresence() {
    const st = this.channel.presenceState() as Record<string, any[]>
    const present = new Set(Object.keys(st))
    for (const [id, arr] of Object.entries(st)) {
      const m = arr[arr.length - 1]
      this.meta.set(id, { name: m.name, audio: m.audio, video: m.video, sharing: m.sharing, hand: m.hand })
      if (id !== this.me.id && !this.peers.has(id)) this.createPeer(id)
    }
    for (const id of [...this.peers.keys()]) if (!present.has(id)) this.dropPeer(id)
    this.emit()
  }

  private createPeer(id: string) {
    dbg('createPeer', id.slice(0, 4), 'polite=', this.me.id > id)
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const st: PeerState = { pc, initiator: this.me.id < id, makingOffer: false, ignoreOffer: false, polite: this.me.id > id, stream: new MediaStream(), pendingIce: [] }
    this.peers.set(id, st)

    for (const track of this.local.getAudioTracks()) pc.addTrack(track, this.local)
    const vt = this.local.getVideoTracks()[0]
    // Always reserve a video sender so we can later swap in camera / screen without a new m-line.
    const tr = pc.addTransceiver(vt ?? 'video', { direction: 'sendrecv', streams: [this.local] })
    st.videoSender = tr.sender

    pc.ontrack = ({ track }) => {
      dbg('ontrack', track.kind, id.slice(0, 4))
      st.stream.addTrack(track)
      track.onunmute = () => this.emit()
      this.emit()
    }
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send({ from: this.me.id, to: id, kind: 'ice', data: candidate.toJSON() }) }
    // Deterministic roles: only the "initiator" (lower id) creates the first offer, so the two sides
    // never offer at the same time (glare). The perfect-negotiation handlers below stay as a safety net.
    pc.onnegotiationneeded = async () => {
      if (!st.initiator && !pc.remoteDescription) return
      try {
        st.makingOffer = true
        await pc.setLocalDescription()
        dbg('send offer', id.slice(0, 4))
        this.send({ from: this.me.id, to: id, kind: 'offer', data: pc.localDescription })
        this.watchOffer(id, st)
      } catch (e) { dbg('negotiation error', String(e)) /* retried on next negotiationneeded */ } finally { st.makingOffer = false }
    }
    pc.onconnectionstatechange = () => {
      dbg('conn', id.slice(0, 4), pc.connectionState, pc.iceConnectionState)
      this.hooks.onStatus?.(pc.connectionState)
      if (pc.connectionState === 'failed') pc.restartIce()
    }
    return st
  }

  /** If the answer never comes (signal sent before the other side subscribed), resend the offer a few times. */
  private watchOffer(id: string, st: PeerState, attempt = 0) {
    setTimeout(() => {
      if (this.closed || this.peers.get(id) !== st) return
      if (st.pc.signalingState === 'have-local-offer' && st.pc.localDescription && attempt < 4) {
        dbg('resend offer', id.slice(0, 4), attempt + 1)
        this.send({ from: this.me.id, to: id, kind: 'offer', data: st.pc.localDescription })
        this.watchOffer(id, st, attempt + 1)
      }
    }, 3000)
  }

  private dropPeer(id: string) {
    const p = this.peers.get(id)
    if (!p) return
    p.pc.close()
    this.peers.delete(id)
    this.meta.delete(id)
  }

  private send(s: Signal) { void this.channel.send({ type: 'broadcast', event: 'signal', payload: s }) }

  private async onSignal(s: Signal) {
    dbg('signal', s.kind, 'from', s.from.slice(0, 4))
    const st = this.peers.get(s.from) ?? this.createPeer(s.from)
    const { pc } = st
    try {
      if (s.kind === 'ice') {
        if (pc.remoteDescription) { try { await pc.addIceCandidate(s.data) } catch (e) { if (!st.ignoreOffer) throw e } } else st.pendingIce.push(s.data)
        return
      }
      const collision = s.kind === 'offer' && (st.makingOffer || pc.signalingState !== 'stable')
      st.ignoreOffer = !st.polite && collision
      if (st.ignoreOffer) return
      await pc.setRemoteDescription(s.data)
      for (const c of st.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      if (s.kind === 'offer') {
        await pc.setLocalDescription()
        this.send({ from: this.me.id, to: s.from, kind: 'answer', data: pc.localDescription })
      }
    } catch (e) { dbg('signal error', s.kind, String(e)) }
  }

  private emit() {
    if (this.closed) return
    const list: Participant[] = [{ id: this.me.id, name: this.me.name, stream: this.screen ?? this.local, audio: this.state.audio, video: this.state.video || this.state.sharing, sharing: this.state.sharing, hand: this.state.hand, local: true }]
    for (const [id, m] of this.meta) {
      if (id === this.me.id) continue
      const p = this.peers.get(id)
      list.push({ id, name: m.name, stream: p?.stream ?? null, audio: m.audio, video: m.video || m.sharing, sharing: m.sharing, hand: m.hand })
    }
    this.hooks.onParticipants(list)
  }

  // ── controls ──
  setAudio(on: boolean) { this.state.audio = on; this.local.getAudioTracks().forEach((t) => (t.enabled = on)); void this.track(); this.emit() }

  async setVideo(on: boolean) {
    this.state.video = on
    let vt = this.local.getVideoTracks()[0]
    if (on && !vt) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        vt = s.getVideoTracks()[0]
        this.local.addTrack(vt)
      } catch { this.state.video = false }
    }
    if (vt) vt.enabled = on && this.state.video
    if (!this.state.sharing && vt) await Promise.all([...this.peers.values()].map((p) => p.videoSender?.replaceTrack(vt)))
    void this.track(); this.emit()
  }

  async shareScreen(): Promise<boolean> {
    if (this.state.sharing) { await this.stopShare(); return false }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      this.screen = s
      const t = s.getVideoTracks()[0]
      t.onended = () => void this.stopShare()
      await Promise.all([...this.peers.values()].map((p) => p.videoSender?.replaceTrack(t)))
      this.state.sharing = true
      void this.track(); this.emit()
      return true
    } catch { return false }
  }

  async stopShare() {
    this.screen?.getTracks().forEach((t) => t.stop())
    this.screen = null
    this.state.sharing = false
    const vt = this.local.getVideoTracks()[0] ?? null
    await Promise.all([...this.peers.values()].map((p) => p.videoSender?.replaceTrack(vt)))
    void this.track(); this.emit()
  }

  toggleHand() { this.state.hand = !this.state.hand; void this.track(); this.emit(); return this.state.hand }

  sendChat(text: string) {
    const msg: ChatMsg = { id: Math.random().toString(36).slice(2), from: this.me.id, name: this.me.name, text, at: Date.now() }
    void this.channel.send({ type: 'broadcast', event: 'chat', payload: msg })
    this.hooks.onChat(msg)
  }

  async leave() {
    this.closed = true
    for (const id of [...this.peers.keys()]) this.dropPeer(id)
    this.screen?.getTracks().forEach((t) => t.stop())
    this.local.getTracks().forEach((t) => t.stop())
    try { await this.channel?.untrack() } catch {}
    try { await getDb().removeChannel(this.channel) } catch {}
  }
}
