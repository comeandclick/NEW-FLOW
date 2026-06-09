'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, Phone, Mail,
  Building, DollarSign, Users, TrendingUp,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CrmContact, CrmDeal } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

const CONTACT_STATUSES = ['lead', 'prospect', 'customer', 'churned']
const CONTACT_STATUS_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-500',
  prospect: 'bg-yellow-500/10 text-yellow-600',
  customer: 'bg-green-500/10 text-green-500',
  churned: 'bg-muted text-muted-foreground',
}

const DEAL_STAGES = [
  { key: 'prospection', label: 'Prospection', color: 'border-blue-500' },
  { key: 'qualification', label: 'Qualification', color: 'border-yellow-500' },
  { key: 'proposition', label: 'Proposition', color: 'border-purple-500' },
  { key: 'négociation', label: 'Négociation', color: 'border-orange-500' },
  { key: 'gagné', label: 'Gagné ✓', color: 'border-green-500' },
  { key: 'perdu', label: 'Perdu ✗', color: 'border-red-500' },
]

export default function CrmPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Contact dialog
  const [contactOpen, setContactOpen] = useState(false)
  const [editContact, setEditContact] = useState<CrmContact | null>(null)
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', company: '', position: '', status: 'lead', notes: '' })
  const [savingContact, setSavingContact] = useState(false)

  // Deal dialog
  const [dealOpen, setDealOpen] = useState(false)
  const [editDeal, setEditDeal] = useState<CrmDeal | null>(null)
  const [dealForm, setDealForm] = useState({ title: '', value: '', currency: 'EUR', stage: 'prospection', contact_id: '', notes: '', close_date: '' })
  const [savingDeal, setSavingDeal] = useState(false)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    loadAll()
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const [c, d] = await Promise.all([
      getSupabaseClient().from('crm_contacts').select('*').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }),
      getSupabaseClient().from('crm_deals').select('*').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }),
    ])
    setContacts((c.data ?? []) as CrmContact[])
    setDeals((d.data ?? []) as CrmDeal[])
    setLoading(false)
  }

  function openCreateContact() {
    setEditContact(null)
    setContactForm({ name: '', email: '', phone: '', company: '', position: '', status: 'lead', notes: '' })
    setContactOpen(true)
  }

  function openEditContact(c: CrmContact) {
    setEditContact(c)
    setContactForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', company: c.company ?? '', position: c.position ?? '', status: c.status, notes: c.notes ?? '' })
    setContactOpen(true)
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !contactForm.name.trim()) return
    setSavingContact(true)
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        name: contactForm.name.trim(),
        email: contactForm.email.trim() || null,
        phone: contactForm.phone.trim() || null,
        company: contactForm.company.trim() || null,
        position: contactForm.position.trim() || null,
        status: contactForm.status,
        notes: contactForm.notes.trim() || null,
        created_by: user.id,
      }
      if (editContact) {
        await getSupabaseClient().from('crm_contacts').update(payload).eq('id', editContact.id)
        toast.success('Contact mis à jour')
      } else {
        await getSupabaseClient().from('crm_contacts').insert(payload)
        toast.success('Contact créé')
      }
      setContactOpen(false)
      loadAll()
    } catch { toast.error('Erreur') } finally { setSavingContact(false) }
  }

  async function deleteContact(id: string) {
    await getSupabaseClient().from('crm_contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    toast.success('Contact supprimé')
  }

  function openCreateDeal() {
    setEditDeal(null)
    setDealForm({ title: '', value: '', currency: 'EUR', stage: 'prospection', contact_id: '', notes: '', close_date: '' })
    setDealOpen(true)
  }

  function openEditDeal(d: CrmDeal) {
    setEditDeal(d)
    setDealForm({ title: d.title, value: String(d.value), currency: d.currency, stage: d.stage, contact_id: d.contact_id ?? '', notes: d.notes ?? '', close_date: d.close_date ?? '' })
    setDealOpen(true)
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !dealForm.title.trim()) return
    setSavingDeal(true)
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        title: dealForm.title.trim(),
        value: parseFloat(dealForm.value) || 0,
        currency: dealForm.currency,
        stage: dealForm.stage,
        contact_id: dealForm.contact_id || null,
        notes: dealForm.notes.trim() || null,
        close_date: dealForm.close_date || null,
        created_by: user.id,
      }
      if (editDeal) {
        await getSupabaseClient().from('crm_deals').update(payload).eq('id', editDeal.id)
        toast.success('Deal mis à jour')
      } else {
        await getSupabaseClient().from('crm_deals').insert(payload)
        toast.success('Deal créé')
      }
      setDealOpen(false)
      loadAll()
    } catch { toast.error('Erreur') } finally { setSavingDeal(false) }
  }

  async function deleteDeal(id: string) {
    await getSupabaseClient().from('crm_deals').delete().eq('id', id)
    setDeals(prev => prev.filter(d => d.id !== id))
    toast.success('Deal supprimé')
  }

  async function moveDeal(dealId: string, stage: string) {
    await getSupabaseClient().from('crm_deals').update({ stage }).eq('id', dealId)
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage } : d))
  }

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalDealsValue = deals.filter(d => d.stage === 'gagné').reduce((sum, d) => sum + d.value, 0)
  const pipelineValue = deals.filter(d => !['gagné', 'perdu'].includes(d.stage)).reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">CRM</h1>
          <p className="text-xs text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} · {deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openCreateContact}><Plus className="mr-1.5 h-3.5 w-3.5" /> Contact</Button>
          <Button size="sm" onClick={openCreateDeal}><Plus className="mr-1.5 h-3.5 w-3.5" /> Deal</Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 px-6 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-blue-500" />
          <span><strong>{contacts.filter(c => c.status === 'customer').length}</strong> clients</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-yellow-500" />
          <span><strong>{pipelineValue.toLocaleString('fr-FR')} €</strong> en pipeline</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-green-500" />
          <span><strong>{totalDealsValue.toLocaleString('fr-FR')} €</strong> gagnés</span>
        </div>
      </div>

      <Tabs defaultValue="pipeline" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-3 mb-0 w-fit">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>

        {/* Pipeline tab */}
        <TabsContent value="pipeline" className="flex-1 overflow-hidden p-0 m-0">
          <div className="h-full overflow-x-auto p-4">
            <div className="flex gap-3 h-full min-w-max">
              {DEAL_STAGES.map(stage => {
                const stageDeals = deals.filter(d => d.stage === stage.key)
                const stageValue = stageDeals.reduce((s, d) => s + d.value, 0)
                return (
                  <div key={stage.key} className={`w-60 flex flex-col rounded-xl border-t-2 bg-muted/30 ${stage.color}`}>
                    <div className="p-3 flex items-center justify-between">
                      <span className="text-xs font-medium">{stage.label}</span>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">{stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}</p>
                        {stageValue > 0 && <p className="text-[10px] font-medium">{stageValue.toLocaleString('fr-FR')} €</p>}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {stageDeals.map(deal => {
                        const contact = contacts.find(c => c.id === deal.contact_id)
                        return (
                          <div key={deal.id} className="bg-background rounded-lg p-3 border border-border shadow-sm">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-sm font-medium leading-tight">{deal.title}</p>
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-5 w-5 shrink-0"><MoreHorizontal className="h-3 w-3" /></Button>} />
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditDeal(deal)}><Pencil className="mr-2 h-3.5 w-3.5" /> Modifier</DropdownMenuItem>
                                  {DEAL_STAGES.filter(s => s.key !== stage.key).map(s => (
                                    <DropdownMenuItem key={s.key} onClick={() => moveDeal(deal.id, s.key)}>→ {s.label}</DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem className="text-destructive" onClick={() => deleteDeal(deal.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {deal.value > 0 && <p className="text-xs font-semibold text-green-600 mt-1">{deal.value.toLocaleString('fr-FR')} {deal.currency}</p>}
                            {contact && <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Building className="h-2.5 w-2.5" />{contact.name}</p>}
                            {deal.close_date && <p className="text-[10px] text-muted-foreground">Clôture : {deal.close_date}</p>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-2">
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground"
                        onClick={() => { openCreateDeal(); setDealForm(f => ({ ...f, stage: stage.key })) }}>
                        <Plus className="mr-1 h-3 w-3" /> Ajouter
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* Contacts tab */}
        <TabsContent value="contacts" className="flex-1 overflow-hidden p-0 m-0">
          <div className="p-4 space-y-3 h-full flex flex-col overflow-hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Rechercher…" className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {loading ? (
                [...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Users className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Aucun contact</p>
                </div>
              ) : (
                filteredContacts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">{c.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{c.name}</p>
                        <Badge className={`${CONTACT_STATUS_COLORS[c.status]} text-[10px]`}>{c.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {c.company && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building className="h-2.5 w-2.5" />{c.company}</span>}
                        {c.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{c.email}</span>}
                        {c.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{c.phone}</span>}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-3.5 w-3.5" /></Button>} />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditContact(c)}><Pencil className="mr-2 h-3.5 w-3.5" /> Modifier</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteContact(c.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Contact dialog */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editContact ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle></DialogHeader>
          <form onSubmit={saveContact} className="space-y-3">
            <div><Label>Nom *</Label><Input placeholder="Jean Dupont" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" placeholder="jean@example.com" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Téléphone</Label><Input placeholder="+33 6 00 00 00 00" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entreprise</Label><Input placeholder="Acme Corp" value={contactForm.company} onChange={e => setContactForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div><Label>Poste</Label><Input placeholder="CEO" value={contactForm.position} onChange={e => setContactForm(f => ({ ...f, position: e.target.value }))} /></div>
            </div>
            <div><Label>Statut</Label>
              <Select value={contactForm.status} onValueChange={v => setContactForm(f => ({ ...f, status: v ?? f.status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea placeholder="Notes…" value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <Button type="submit" className="w-full" disabled={savingContact}>{savingContact ? 'Sauvegarde…' : editContact ? 'Mettre à jour' : 'Créer le contact'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deal dialog */}
      <Dialog open={dealOpen} onOpenChange={setDealOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editDeal ? 'Modifier le deal' : 'Nouveau deal'}</DialogTitle></DialogHeader>
          <form onSubmit={saveDeal} className="space-y-3">
            <div><Label>Titre *</Label><Input placeholder="Contrat annuel Acme" value={dealForm.title} onChange={e => setDealForm(f => ({ ...f, title: e.target.value }))} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valeur (€)</Label><Input type="number" placeholder="5000" value={dealForm.value} onChange={e => setDealForm(f => ({ ...f, value: e.target.value }))} /></div>
              <div><Label>Étape</Label>
                <Select value={dealForm.stage} onValueChange={v => setDealForm(f => ({ ...f, stage: v ?? f.stage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEAL_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Contact associé</Label>
              <Select value={dealForm.contact_id} onValueChange={v => setDealForm(f => ({ ...f, contact_id: v ?? f.contact_id }))}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date de clôture</Label><Input type="date" value={dealForm.close_date} onChange={e => setDealForm(f => ({ ...f, close_date: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea placeholder="Notes…" value={dealForm.notes} onChange={e => setDealForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <Button type="submit" className="w-full" disabled={savingDeal}>{savingDeal ? 'Sauvegarde…' : editDeal ? 'Mettre à jour' : 'Créer le deal'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
