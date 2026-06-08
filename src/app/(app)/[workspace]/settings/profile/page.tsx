'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'

const TIMEZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Africa/Algiers',
  'Africa/Casablanca',
  'Africa/Cairo',
]

interface Props {
  params: Promise<{ workspace: string }>
}

export default function ProfilePage({ params }: Props) {
  use(params)
  const { user, profile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setTimezone(profile.timezone ?? 'UTC')
      setAvatarUrl(profile.avatar_url ?? null)
    }
  }, [profile])

  const initials = (fullName || profile?.email || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (error) throw error
      toast.success('Profil mis à jour')
    } catch {
      toast.error('Échec de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0] || !user) return
    const file = e.target.files[0]
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop lourde (max 5 MB)')
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await getSupabaseClient()
        .storage.from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = getSupabaseClient()
        .storage.from('avatars')
        .getPublicUrl(path)
      const urlWithBust = `${publicUrl}?t=${Date.now()}`
      await getSupabaseClient()
        .from('profiles')
        .update({ avatar_url: urlWithBust, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      setAvatarUrl(urlWithBust)
      toast.success('Avatar mis à jour')
    } catch {
      toast.error('Échec du téléchargement — vérifiez que le bucket "avatars" est créé')
    } finally {
      setUploadingAvatar(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const newPass = fd.get('password') as string
    const confirm = fd.get('confirm') as string
    if (newPass !== confirm) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }
    if (newPass.length < 8) {
      toast.error('Minimum 8 caractères')
      return
    }
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password: newPass })
      if (error) throw error
      toast.success('Mot de passe modifié')
      e.currentTarget.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Mon profil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gérez vos informations personnelles
        </p>
      </div>

      <Separator />

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
          >
            {uploadingAvatar
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Camera className="h-3 w-3" />
            }
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="font-medium">{fullName || '—'}</p>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-primary hover:underline mt-0.5"
          >
            Changer l&apos;avatar
          </button>
        </div>
      </div>

      <Separator />

      {/* Profile info */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        <h2 className="text-sm font-medium">Informations</h2>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nom complet</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Votre nom"
            className="max-w-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            value={profile?.email ?? ''}
            disabled
            className="max-w-sm text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Contactez le support pour changer votre email
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone">Fuseau horaire</Label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="max-w-sm h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le profil'}
        </Button>
      </form>

      <Separator />

      {/* Password */}
      <div>
        <h2 className="text-sm font-medium mb-4">Sécurité</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              className="max-w-sm"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmer le mot de passe</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              placeholder="••••••••"
              className="max-w-sm"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Changer le mot de passe
          </Button>
        </form>
      </div>
    </div>
  )
}
