'use client'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { uid } from '@/lib/utils'
import { MOTION_STEPS, SITE_STEPS, freshSteps } from './steps'
import { dimensions } from './types'
import type { Device, Job, JobStatus, LibraryItem, MotionJob, Notice, Question, RefItem, SiteJob, Step } from './types'

type NewMotion = Omit<MotionJob, 'id' | 'kind' | 'createdAt' | 'status' | 'steps' | 'questions' | 'notices' | 'result'>
type NewSite = Omit<SiteJob, 'id' | 'kind' | 'createdAt' | 'status' | 'steps' | 'questions' | 'notices' | 'liveUrl'>

type State = {
  jobs: Job[]
  devices: Device[]
  library: LibraryItem[]
  /** Job en cours de simulation (jamais persisté). */
  simulating: string | null
  addMotion: (d: NewMotion) => MotionJob
  addSite: (d: NewSite) => SiteJob
  removeJob: (id: string) => void
  pair: (name?: string) => Device
  unpair: (id: string) => void
  answer: (jobId: string, qid: string, answer: string) => void
  /** Avance la simulation d'une étape ; renvoie false quand le job est fini. */
  tick: (jobId: string) => boolean
  setSimulating: (id: string | null) => void
  seedLibrary: () => void
  clearLibrary: () => void
}

const notice = (title: string, level: Notice['level'] = 'info', body?: string): Notice => ({ id: uid(), at: Date.now(), title, body, level })
const libFromRefs = (jobId: string, jobTitle: string, refs: RefItem[]): LibraryItem[] =>
  refs.filter((r) => r.kind !== 'note').map((r) => ({
    id: uid(), kind: 'sent', refKind: r.kind, name: r.name, size: r.size, url: r.url, jobId, jobTitle, at: Date.now(),
  }))

const patch = (jobs: Job[], id: string, f: (j: Job) => Job) => jobs.map((j) => (j.id === id ? f(j) : j))

const setStep = (steps: Step[], index: number, state: Step['state']): Step[] => steps.map((s, i) => (i === index ? { ...s, state } : s))

export const useStudio = create<State>()(
  persist(
    (set, get) => ({
      jobs: [],
      devices: [],
      library: [],
      simulating: null,

      addMotion: (d) => {
        const hasDevice = get().devices.length > 0
        const job: MotionJob = {
          ...d, id: uid(), kind: 'motion', createdAt: Date.now(),
          status: hasDevice ? 'queued' : 'waiting_device',
          steps: freshSteps(MOTION_STEPS), questions: [],
          notices: [notice('Demande enregistrée', 'info', hasDevice ? 'Envoyée au Mac connecté.' : 'Elle partira dès qu\'un Mac sera connecté.')],
        }
        set((s) => ({ jobs: [job, ...s.jobs], library: [...libFromRefs(job.id, job.title, job.refs), ...s.library] }))
        return job
      },

      addSite: (d) => {
        const hasDevice = get().devices.length > 0
        const job: SiteJob = {
          ...d, id: uid(), kind: 'site', createdAt: Date.now(),
          status: hasDevice ? 'queued' : 'waiting_device',
          steps: freshSteps(SITE_STEPS).map((s, i) => (i === 0 ? { ...s, state: 'done' as const } : s)),
          questions: [],
          notices: [notice('Projet enregistré', 'info', hasDevice ? 'Envoyé au Mac connecté.' : 'Il partira dès qu\'un Mac sera connecté.')],
        }
        set((s) => ({ jobs: [job, ...s.jobs], library: [...libFromRefs(job.id, job.title, job.refs), ...s.library] }))
        return job
      },

      removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id), simulating: s.simulating === id ? null : s.simulating })),

      pair: (name = 'MacBook Air de Aymen') => {
        const dev: Device = { id: uid(), name, os: 'macOS', pairedAt: Date.now(), lastSeen: Date.now() }
        set((s) => ({
          devices: [dev, ...s.devices],
          jobs: s.jobs.map((j) => (j.status === 'waiting_device' ? { ...j, status: 'queued' as const, notices: [notice('Mac connecté', 'success', 'La demande est maintenant envoyée.'), ...j.notices] } : j)),
        }))
        return dev
      },
      unpair: (id) => set((s) => ({ devices: s.devices.filter((d) => d.id !== id) })),

      answer: (jobId, qid, answer) =>
        set((s) => ({
          jobs: patch(s.jobs, jobId, (j) => {
            const questions = j.questions.map((q) => (q.id === qid ? { ...q, answer, answeredAt: Date.now() } : q))
            const stillOpen = questions.some((q) => !q.answer)
            return { ...j, questions, status: stillOpen ? 'needs_answer' : 'running', notices: [notice('Réponse transmise à Claude', 'info', answer), ...j.notices] }
          }),
        })),

      setSimulating: (id) => set({ simulating: id }),

      tick: (jobId) => {
        const job = get().jobs.find((j) => j.id === jobId)
        if (!job || job.status === 'done') return false
        const idx = job.steps.findIndex((s) => s.state === 'active')
        const nextIdx = idx === -1 ? job.steps.findIndex((s) => s.state === 'todo') : idx + 1
        let steps = job.steps
        if (idx !== -1) steps = setStep(steps, idx, 'done')
        const finished = nextIdx === -1 || nextIdx >= steps.length
        if (!finished) steps = setStep(steps, nextIdx, 'active')
        let questions: Question[] = job.questions
        let status: JobStatus = job.status === 'queued' || job.status === 'waiting_device' || job.status === 'needs_answer' ? 'running' : job.status
        const notices: Notice[] = []
        if (idx !== -1) notices.push(notice(`step:${job.steps[idx].id}`, 'info'))

        if (job.kind === 'site' && !finished && steps[nextIdx]?.id === 'build' && !job.questions.length) {
          const q: Question = { id: uid(), askedAt: Date.now(), text: 'Pour le bouton principal de la page d\'accueil, tu préfères « Commencer » ou « Voir les offres » ?', choices: ['Commencer', 'Voir les offres', 'Tu décides'] }
          questions = [q]
          status = 'needs_answer'
          notices.push(notice('Claude te pose une question', 'question', q.text))
        }
        if (job.kind === 'site' && job.questions.some((q) => !q.answer)) status = 'needs_answer'

        if (finished) {
          status = 'done'
          if (job.kind === 'motion') {
            const d = dimensions(job.ratio, job.quality)
            const result = { name: `${(job.title || 'motion').replace(/\s+/g, '-').toLowerCase()}-${job.quality}.mp4`, size: Math.round(job.durationSec * 3_400_000), w: d.w, h: d.h }
            notices.push(notice('Ton motion design est prêt', 'success', `${result.name} · ${d.w} × ${d.h} · vérifié image par image`))
            set((s) => ({
              jobs: patch(s.jobs, jobId, (j) => ({ ...(j as MotionJob), steps, status: 'done', result, notices: [...notices, ...j.notices] })),
              library: [{ id: uid(), kind: 'render', refKind: 'render-video', name: result.name, size: result.size, jobId, jobTitle: job.title, at: Date.now() }, ...s.library],
            }))
          } else {
            const slug = (job.title || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            const liveUrl = `https://${slug || 'site'}.vercel.app`
            notices.push(notice('Ton site est en ligne', 'success', liveUrl))
            set((s) => ({
              jobs: patch(s.jobs, jobId, (j) => ({ ...(j as SiteJob), steps, status: 'done', liveUrl, notices: [...notices, ...j.notices] })),
              library: [{ id: uid(), kind: 'site', refKind: 'site', name: job.title, url: liveUrl, jobId, jobTitle: job.title, at: Date.now() }, ...s.library],
            }))
          }
          return false
        }

        set((s) => ({ jobs: patch(s.jobs, jobId, (j) => ({ ...j, steps, status, questions, notices: [...notices, ...j.notices] })) }))
        return true
      },

      seedLibrary: () =>
        set((s) => {
          const now = Date.now()
          const mk = (p: Partial<LibraryItem> & Pick<LibraryItem, 'kind' | 'refKind' | 'name'>, ago: number): LibraryItem => ({ id: uid(), at: now - ago * 3_600_000, ...p })
          return {
            library: [
              mk({ kind: 'render', refKind: 'render-video', name: 'kalimat-4k.mp4', size: 8_475_115, jobTitle: 'Pub Kalimat – version 1' }, 2),
              mk({ kind: 'sent', refKind: 'video', name: 'Exemple Apple Music – Chante avec tes artistes.mp4', size: 3_284_305, jobTitle: 'Pub Kalimat – version 1' }, 5),
              mk({ kind: 'sent', refKind: 'image', name: 'icone-kalimat.png', size: 154_330, jobTitle: 'Pub Kalimat – version 1' }, 5),
              mk({ kind: 'sent', refKind: 'file', name: 'bruitages.zip', size: 1_904_220, jobTitle: 'Pub Kalimat – version 1' }, 5),
              mk({ kind: 'site', refKind: 'site', name: 'Bougies Maison', url: 'https://bougies-maison.vercel.app', jobTitle: 'Bougies Maison' }, 30),
              mk({ kind: 'sent', refKind: 'link', name: 'https://www.apple.com/fr/apple-music/', url: 'https://www.apple.com/fr/apple-music/', jobTitle: 'Bougies Maison' }, 31),
              ...s.library,
            ],
          }
        }),
      clearLibrary: () => set({ library: [] }),
    }),
    {
      name: 'flow_studio_v1',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ jobs: s.jobs, devices: s.devices, library: s.library }),
    },
  ),
)

/** Réhydrate le store après le premier rendu (évite l'écart serveur / navigateur). */
export function useStudioReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void Promise.resolve(useStudio.persist.rehydrate()).finally(() => setReady(true))
  }, [])
  return ready
}
