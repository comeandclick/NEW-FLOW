'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function LoginPage() {
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
    window.location.href = '/workspaces'
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

  async function handleGoogle() {
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
    if (error) toast.error(error.message)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bon retour</h1>
          <p className="text-sm text-muted-foreground">Connectez-vous à votre espace Flow</p>
        </div>

        <Button
          className="w-full font-semibold h-11 text-base"
          onClick={handleDemoLogin}
          disabled={demoLoading}
        >
          {demoLoading ? 'Connexion en cours…' : 'Accès démo — connexion automatique'}
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
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link href="/reset-password" className="text-xs text-muted-foreground hover:text-foreground">
                Mot de passe oublié ?
              </Link>
            </div>
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

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continuer avec Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Pas de compte ?{' '}
          <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  )
}
