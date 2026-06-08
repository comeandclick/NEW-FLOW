'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string }>
}

export default function WorkspaceSettingsPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const { currentWorkspace, updateWorkspace } = useWorkspaceStore()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

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
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Workspace Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your workspace</p>
      </div>

      <Separator />

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Workspace URL</Label>
          <Input
            value={currentWorkspace?.slug ?? ''}
            disabled
            className="max-w-sm text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">Slug cannot be changed</p>
        </div>

        <div className="space-y-2">
          <Label>Plan</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm capitalize">{currentWorkspace?.plan ?? 'free'}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {currentWorkspace?.plan === 'free' ? 'Free tier' : 'Paid'}
            </span>
          </div>
        </div>

        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  )
}
