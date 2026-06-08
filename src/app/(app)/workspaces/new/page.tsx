'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { workspacesService } from '@/services/workspaces.service'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Link from 'next/link'

export default function NewWorkspacePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    try {
      const ws = await workspacesService.create(name.trim(), user.id)
      toast.success(`Espace "${ws.name}" créé !`)
      router.push(`/${ws.slug}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impossible de créer l\'espace'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Créer un espace</h1>
          <p className="text-sm text-muted-foreground">Un espace pour votre équipe ou projet</p>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l&apos;espace</Label>
            <Input
              id="name"
              placeholder="Mon Entreprise"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              maxLength={50}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
            {loading ? 'Création…' : 'Créer l\'espace'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/workspaces" className="hover:underline">Retour aux espaces</Link>
        </p>
      </div>
    </div>
  )
}
