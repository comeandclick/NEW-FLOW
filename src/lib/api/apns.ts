import { connect, constants, type ClientHttp2Session } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'

/**
 * Notifications natives de l'app iPhone Flow Workspace (APNs), sans Firebase.
 * L'app range son jeton dans push_subscriptions avec endpoint = `apns:<jeton>` (keys.topic = identifiant de l'app).
 * Variables : APNS_KEY (contenu du fichier .p8, \n accepté), APNS_KEY_ID, APNS_TEAM_ID. Sans elles : rien n'est envoyé.
 */
type Result = 'ok' | 'gone' | 'error'
let jwt: { value: string; at: number } | null = null

export const apnsConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID)

function token(): string {
  // Apple accepte un même jeton pendant 1 h ; on le renouvelle toutes les 50 min.
  if (jwt && Date.now() - jwt.at < 50 * 60e3) return jwt.value
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID }), body = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })
  const key = createPrivateKey((process.env.APNS_KEY ?? '').replace(/\\n/g, '\n'))
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  jwt = { value: `${head}.${body}.${sig}`, at: Date.now() }
  return jwt.value
}

// Connexion HTTP/2 gardée ouverte par serveur Apple (réutilisée entre envois tant que l'instance vit) : évite une
// poignée de main TLS par notification. Et serveur retenu par appareil (production ou bac à sable) : plus d'essai raté.
const clients = new Map<string, ClientHttp2Session>()
const envOf = new Map<string, string>()
function client(host: string): ClientHttp2Session {
  const c = clients.get(host)
  if (c && !c.closed && !c.destroyed) return c
  const n = connect(`https://${host}`)
  n.on('error', () => clients.delete(host))
  n.on('close', () => clients.delete(host))
  n.on('goaway', () => clients.delete(host))
  n.setTimeout(5 * 60e3, () => n.close())
  n.unref()
  clients.set(host, n)
  return n
}

function send(host: string, device: string, topic: string, payload: string, voip = false): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    let session: ClientHttp2Session
    try { session = client(host) } catch { resolve({ status: 0 }); return }
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST', [constants.HTTP2_HEADER_PATH]: `/3/device/${device}`,
      authorization: `bearer ${token()}`, 'apns-topic': topic, 'apns-push-type': voip ? 'voip' : 'alert', 'apns-priority': '10',
      // une sonnerie d'appel périmée ne doit pas arriver plus tard
      ...(voip ? { 'apns-expiration': '0' } : {}),
    })
    let status = 0, data = ''
    req.on('response', (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS]) })
    req.on('data', (c) => { data += c })
    req.on('end', () => { let reason: string | undefined; try { reason = JSON.parse(data).reason } catch { /* vide si 200 */ } resolve({ status, reason }) })
    req.on('error', () => { clients.delete(host); resolve({ status: 0 }) })
    req.setTimeout(8000, () => { req.close(); resolve({ status: 0 }) })
    req.end(payload)
  })
}

/** Appareil iPhone de l'app : `apns:<jeton>` (notifications) ou `voip:<jeton>` (sonnerie d'appel CallKit). */
export const isAppleEndpoint = (e: string) => e.startsWith('apns:') || e.startsWith('voip:')

/**
 * Choisit les appareils Apple à prévenir : un appel sonne par VoIP (CallKit) sur les iPhone qui l'acceptent,
 * sans bannière en double ; une autre notification ne part jamais en VoIP (iOS fermerait l'app).
 */
export function appleTargets<T extends { endpoint: string; user_id?: string }>(subs: T[], type: string): T[] {
  if (type !== 'call') return subs.filter((s) => !s.endpoint.startsWith('voip:'))
  const voipUsers = new Set(subs.filter((s) => s.endpoint.startsWith('voip:')).map((s) => s.user_id))
  return subs.filter((s) => s.endpoint.startsWith('voip:') || !(s.endpoint.startsWith('apns:') && voipUsers.has(s.user_id)))
}

/** Envoie une notification à un iPhone. Essaie la production puis le bac à sable (apps installées depuis Xcode). */
export async function sendApns(endpoint: string, keys: { topic?: string } | null, n: { title: string; body?: string | null; url?: string | null }): Promise<Result> {
  if (!apnsConfigured() || !isAppleEndpoint(endpoint)) return 'error'
  const voip = endpoint.startsWith('voip:')
  const device = endpoint.slice(5), topic = keys?.topic ?? (voip ? 'flow.workspace.voip' : 'flow.workspace')
  // Appel : identifiant de la réunion et type lus dans le lien /app/<espace>/meetings/<id>?audio=0|1
  const m = (n.url ?? '').match(/\/meetings\/([0-9a-f-]{36})(?:\?audio=(\d))?/)
  const payload = voip
    ? JSON.stringify({ id: m?.[1] ?? crypto.randomUUID(), meetingId: m?.[1] ?? null, nameCaller: n.title.slice(0, 80), handle: 'Flow', isVideo: m?.[2] === '0', url: n.url ?? '/app' })
    : JSON.stringify({
      aps: { alert: { title: n.title.slice(0, 120), body: (n.body ?? '').slice(0, 200) }, sound: 'default', 'thread-id': 'flow' },
      url: n.url ?? '/app',
    })
  const PROD = 'api.push.apple.com', SANDBOX = 'api.sandbox.push.apple.com'
  const first = envOf.get(device) ?? PROD, other = first === PROD ? SANDBOX : PROD
  let r = await send(first, device, topic, payload, voip)
  if (r.status === 400 && r.reason === 'BadDeviceToken') { r = await send(other, device, topic, payload, voip); if (r.status === 200) envOf.set(device, other) }
  else if (r.status === 200) envOf.set(device, first)
  if (r.status === 200) return 'ok'
  if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') return 'gone'
  return 'error'
}
