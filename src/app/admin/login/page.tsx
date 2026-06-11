'use client'

import { useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  async function signIn(e_mail: string, pwd: string) {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: e_mail, password: pwd })
    if (error) {
      toast.error(error.message)
      return false
    }
    window.location.href = '/admin'
    return true
  }

  async function handleDemoLogin() {
    setDemoLoading(true)
    await signIn('demo@flow.app', 'demo123456')
    setDemoLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn(email, password)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <div className="flex justify-center mb-3">
            <div className="h-10 w-10 rounded-lg bg-foreground flex items-center justify-center">
              <Shield className="h-5 w-5 text-background" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Flow Admin</h1>
          <p className="text-sm text-muted-foreground">Accès super-administrateur uniquement</p>
        </div>

        <Button
          className="w-full font-semibold h-11 text-base"
          onClick={handleDemoLogin}
          disabled={demoLoading}
        >
          {demoLoading ? 'Connexion en cours…' : 'Accès démo admin — connexion automatique'}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail admin</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
