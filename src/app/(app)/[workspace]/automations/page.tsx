'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Plus, Zap, MoreHorizontal, Pencil, Trash2, Play, Pause } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Automation } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props { params: Promise<{ workspace: string }> }

const TRIGGERS = [
  { key: 'task_status_changed', label: 'Statut de tâche modifié', description: 'Quand une tâche change de statut' },
  { key: 'task_created', label: 'Tâche créée', description: 'Quand une nouvelle tâche est créée' },
  { key: 'task_due', label: 'Deadline dépassée', description: 'Quand une tâche dépasse sa date limite' },
  { key: 'member_joined', label: 'Nouveau membre', description: 'Quand quelqu\'un rejoint l\'espace' },
  { key: 'file_uploaded', label: 'Fichier uploadé', description: 'Quand un fichier est ajouté' },
]

const ACTIONS = [
  { key: 'send_notification', label: 'Envoyer une notification', description: 'Notifier des membres' },
  { key: 'assign_task', label: 'Assigner la tâche', description: 'Assigner automatiquement la tâche' },
  { key: 'set_status', label: 'Changer le statut', description: 'Modifier le statut de la tâche' },
  { key: 'send_message', label: 'Envoyer un message', description: 'Poster un message dans un canal' },
  { key: 'create_task', label: 'Créer une tâche', description: 'Créer une nouvelle tâche automatiquement' },
]

export default function AutomationsPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Automation | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', trigger_type: '', action_type: '', is_active: true,
    trigger_config: '{}', action_config: '{}',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    load()
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const { data } = await getSupabaseClient()
      .from('automations')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: false })
    setAutomations((data ?? []) as Automation[])
    setLoading(false)
  }

  function openCreate() {
    setEditTarget(null)
    setForm({ name: '', description: '', trigger_type: TRIGGERS[0].key, action_type: ACTIONS[0].key, is_active: true, trigger_config: '{}', action_config: '{}' })
    setOpen(true)
  }

  function openEdit(a: Automation) {
    setEditTarget(a)
    setForm({
      name: a.name, description: a.description ?? '', trigger_type: a.trigger_type,
      action_type: a.action_type, is_active: a.is_active,
      trigger_config: JSON.stringify(a.trigger_config, null, 2),
      action_config: JSON.stringify(a.action_config, null, 2),
    })
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !form.name.trim() || !form.trigger_type || !form.action_type) return
    setSaving(true)
    try {
      let tc = {}, ac = {}
      try { tc = JSON.parse(form.trigger_config) } catch { tc = {} }
      try { ac = JSON.parse(form.action_config) } catch { ac = {} }
      const payload = {
        workspace_id: currentWorkspace.id, name: form.name.trim(),
        description: form.description.trim() || null,
        trigger_type: form.trigger_type, trigger_config: tc,
        action_type: form.action_type, action_config: ac,
        is_active: form.is_active, created_by: user.id,
      }
      if (editTarget) {
        await getSupabaseClient().from('automations').update(payload).eq('id', editTarget.id)
        toast.success('Automation mise à jour')
      } else {
        await getSupabaseClient().from('automations').insert(payload)
        toast.success('Automation créée')
      }
      setOpen(false)
      load()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }

  async function toggleActive(id: string, current: boolean) {
    await getSupabaseClient().from('automations').update({ is_active: !current }).eq('id', id)
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a))
  }

  async function del(id: string) {
    await getSupabaseClient().from('automations').delete().eq('id', id)
    setAutomations(prev => prev.filter(a => a.id !== id))
    toast.success('Automation supprimée')
  }

  return (
    <div className="flex flex-col h-full page-enter">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
        <div>
          <h1 className="text-base sm:text-lg font-semibold">Automations</h1>
          <p className="text-xs text-muted-foreground">{automations.length} règle{automations.length !== 1 ? 's' : ''} · {automations.filter(a => a.is_active).length} active{automations.filter(a => a.is_active).length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle règle</Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Zap className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Aucune automation</p>
              <p className="text-xs text-muted-foreground">Créez des règles pour automatiser votre workflow</p>
            </div>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Créer une automation</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map(a => {
              const trigger = TRIGGERS.find(t => t.key === a.trigger_type)
              const action = ACTIONS.find(ac => ac.key === a.action_type)
              return (
                <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.is_active ? 'bg-indigo-500/10' : 'bg-muted'}`}>
                        <Zap className={`h-4 w-4 ${a.is_active ? 'text-indigo-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{a.name}</p>
                          <Badge className={a.is_active ? 'bg-green-500/10 text-green-500 text-[10px]' : 'bg-muted text-muted-foreground text-[10px]'}>
                            {a.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                          {a.run_count > 0 && <span className="text-[10px] text-muted-foreground">{a.run_count} exécution{a.run_count !== 1 ? 's' : ''}</span>}
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 rounded px-2 py-0.5">
                            SI {trigger?.label ?? a.trigger_type}
                          </span>
                          <span className="text-[10px] text-muted-foreground">→</span>
                          <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-500 rounded px-2 py-0.5">
                            ALORS {action?.label ?? a.action_type}
                          </span>
                        </div>
                        {a.last_run_at && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Dernière exécution : {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true, locale: fr })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(a.id, a.is_active)}>
                        {a.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>} />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="mr-2 h-3.5 w-3.5" /> Modifier</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => del(a.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editTarget ? 'Modifier l\'automation' : 'Nouvelle automation'}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div><Label>Nom *</Label><Input placeholder="Notification deadline dépassée" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
            <div><Label>Description</Label><Input placeholder="Description courte…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>

            <div className="space-y-2">
              <Label>Déclencheur — SI…</Label>
              <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v ?? f.trigger_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map(t => (
                    <SelectItem key={t.key} value={t.key}>
                      <div><p className="font-medium text-xs">{t.label}</p><p className="text-[10px] text-muted-foreground">{t.description}</p></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Action — ALORS…</Label>
              <Select value={form.action_type} onValueChange={v => setForm(f => ({ ...f, action_type: v ?? f.action_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(a => (
                    <SelectItem key={a.key} value={a.key}>
                      <div><p className="font-medium text-xs">{a.label}</p><p className="text-[10px] text-muted-foreground">{a.description}</p></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Active dès la création</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>

            <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Sauvegarde…' : editTarget ? 'Mettre à jour' : 'Créer l\'automation'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
