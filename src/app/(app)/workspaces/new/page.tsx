'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Link from 'next/link'
import { Building2 } from 'lucide-react'

export default function NewWorkspacePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/workspaces/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur')
      toast.success(`Espace "${json.workspace.name}" créé !`)
      router.push(`/${json.workspace.slug}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de créer l\'espace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Créer un espace</h1>
            <p className="text-sm text-muted-foreground">
              Un espace pour votre équipe ou projet
            </p>
          </div>
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
            <p className="text-xs text-muted-foreground">
              Exemples : Flow Studio, Startup, Personnel…
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !name.trim()}
          >
            {loading ? 'Création en cours…' : 'Créer l\'espace'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/workspaces" className="hover:underline">
            ← Retour aux espaces
          </Link>
        </p>
      </div>
    </div>
  )
}
