'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Building2, Bell, Download, Globe, Shield, Trash2, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ workspace: string }>
}

// ── Notification preferences component ────────────────────────────────────────

const NOTIF_PREFS = [
  { key: 'task_assigned', label: 'Tâche assignée', desc: 'Quand on vous assigne une tâche' },
  { key: 'task_due', label: 'Échéance proche', desc: '24h avant la date limite' },
  { key: 'message_mention', label: 'Mention dans un message', desc: 'Quand quelqu\'un vous mentionne' },
  { key: 'comment_added', label: 'Commentaire sur une tâche', desc: 'Sur vos tâches assignées' },
  { key: 'meeting_starting', label: 'Réunion imminente', desc: '15 min avant le début' },
]

function NotificationPreferences({ workspaceId, userId }: { workspaceId?: string; userId?: string }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId || !userId) return
    async function load() {
      try {
        const { data } = await getSupabaseClient().from('profiles').select('preferences').eq('id', userId!).single()
        const p = (data?.preferences as Record<string, unknown>) ?? {}
        const notifPrefs = (p.notifications as Record<string, boolean>) ?? {}
        const defaults: Record<string, boolean> = {}
        NOTIF_PREFS.forEach(n => { defaults[n.key] = notifPrefs[n.key] ?? true })
        setPrefs(defaults)
      } catch { /* ignore */ }
    }
    load()
  }, [workspaceId, userId])

  async function toggle(key: string) {
    if (!userId) return
    const newVal = !prefs[key]
    setPrefs(p => ({ ...p, [key]: newVal }))
    setSaving(key)
    try {
      // Load current preferences first
      const { data } = await getSupabaseClient().from('profiles').select('preferences').eq('id', userId).single()
      const current = (data?.preferences as Record<string, unknown>) ?? {}
      const notifPrefs = (current.notifications as Record<string, boolean>) ?? {}
      const updated = { ...current, notifications: { ...notifPrefs, [key]: newVal } }
      await getSupabaseClient().from('profiles').update({ preferences: updated }).eq('id', userId)
    } catch { setPrefs(p => ({ ...p, [key]: !newVal })) } finally { setSaving(null) }
  }

  return (
    <div className="space-y-3">
      {NOTIF_PREFS.map(n => (
        <div key={n.key} className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">{n.label}</p>
            <p className="text-xs text-muted-foreground">{n.desc}</p>
          </div>
          <button
            onClick={() => toggle(n.key)}
            disabled={saving === n.key}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${prefs[n.key] ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${prefs[n.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  pro: 'bg-blue-500/10 text-blue-400',
  team: 'bg-purple-500/10 text-purple-400',
  enterprise: 'bg-amber-500/10 text-amber-400',
}

export default function WorkspaceSettingsPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const updateWorkspace = useWorkspaceStore(s => s.updateWorkspace)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (currentWorkspace) setName(currentWorkspace.name)
  }, [currentWorkspace])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace) return
    setSaving(true)
    try {
      const { error } = await getSupabaseClient()
        .from('workspaces')
        .update({ name: name.trim() })
        .eq('id', currentWorkspace.id)
      if (error) throw error
      updateWorkspace(currentWorkspace.id, { name: name.trim() })
      toast.success('Paramètres enregistrés')
    } catch {
      toast.error('Échec de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentWorkspace || deleteConfirm !== currentWorkspace.name) return
    setDeleting(true)
    try {
      const { error } = await getSupabaseClient()
        .from('workspaces')
        .delete()
        .eq('id', currentWorkspace.id)
      if (error) throw error
      toast.success('Espace supprimé')
      router.push('/workspaces')
    } catch {
      toast.error('Impossible de supprimer l\'espace')
      setDeleting(false)
    }
  }

  const plan = currentWorkspace?.plan ?? 'free'
  const isOwner = currentWorkspace?.owner_id === user?.id

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-10 page-enter">
      <div>
        <h1 className="text-lg font-semibold">Paramètres de l&apos;espace</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre espace de travail</p>
      </div>

      <Separator />

      {/* General settings */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Général</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l&apos;espace</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
              className="max-w-sm" required />
          </div>

          <div className="space-y-2">
            <Label>URL de l&apos;espace</Label>
            <div className="flex items-center gap-2 max-w-sm">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input value={`new-flow-dashboard.vercel.app/${currentWorkspace?.slug ?? ''}`}
                disabled className="text-muted-foreground text-xs" />
            </div>
            <p className="text-xs text-muted-foreground">Le slug ne peut pas être modifié après création.</p>
          </div>

          <Button type="submit" size="sm" disabled={saving || !isOwner}>
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </Button>
          {!isOwner && (
            <p className="text-xs text-muted-foreground">Seul le propriétaire peut modifier ces paramètres.</p>
          )}
        </form>
      </section>

      <Separator />

      {/* Plan */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Plan</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={PLAN_COLORS[plan] ?? 'bg-muted'}>
            {PLAN_LABELS[plan] ?? plan}
          </Badge>
          {plan === 'free' && (
            <span className="text-xs text-muted-foreground">
              Jusqu&apos;à 5 membres · 1 Go de stockage
            </span>
          )}
        </div>
        {plan === 'free' && (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Passer à Pro
          </Button>
        )}
      </section>

      <Separator />

      {/* Demo data */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Données de démonstration</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Peuple l&apos;espace avec des notes, tâches, événements et conversations d&apos;exemple pour tester les fonctionnalités.
        </p>
        <Button
          variant="outline" size="sm" className="gap-1.5"
          onClick={async () => {
            if (!currentWorkspace?.id) return
            const t = toast.loading('Génération des données…')
            try {
              const res = await fetch('/api/seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId: currentWorkspace.id }),
              })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error)
              toast.success(`${d.created} éléments créés`, { id: t })
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Erreur', { id: t })
            }
          }}
        >
          <Zap className="h-3.5 w-3.5" />
          Générer données de démo
        </Button>
      </section>

      <Separator />

      {/* Export */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Export des données</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { type: 'tasks', label: 'Tâches (CSV)' },
            { type: 'notes', label: 'Notes (CSV)' },
            { type: 'members', label: 'Membres (CSV)' },
            { type: 'crm_contacts', label: 'CRM contacts (CSV)' },
          ].map(({ type, label }) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              className="gap-1.5 justify-start"
              onClick={() => {
                if (!currentWorkspace?.id) return
                const url = `/api/workspaces/export?workspaceId=${currentWorkspace.id}&type=${type}`
                const a = document.createElement('a')
                a.href = url
                a.download = ''
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
              }}
            >
              <Download className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </section>

      <Separator />

      {/* Notifications */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Notifications</h2>
        </div>
        <NotificationPreferences workspaceId={currentWorkspace?.id} userId={user?.id} />
      </section>

      <Separator />

      {/* Security */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Sécurité</h2>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Gérez les membres et leurs rôles dans l&apos;onglet{' '}
            <button
              className="text-primary hover:underline"
              onClick={() => router.push(`/${slug}/settings/members`)}
            >
              Membres
            </button>.
          </p>
        </div>
      </section>

      {/* Danger zone — owner only */}
      {isOwner && (
        <>
          <Separator />
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <h2 className="text-sm font-semibold text-destructive">Zone de danger</h2>
            </div>
            <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Supprimer l&apos;espace de travail</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Action irréversible. Toutes les données seront perdues.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">
                  Tapez <span className="font-mono font-semibold">{currentWorkspace?.name}</span> pour confirmer
                </Label>
                <Input
                  className="max-w-sm text-sm"
                  placeholder={currentWorkspace?.name}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
              </div>
              <Button
                variant="destructive" size="sm"
                disabled={deleteConfirm !== currentWorkspace?.name || deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
