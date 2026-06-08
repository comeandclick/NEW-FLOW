'use client'

import { use, useEffect, useState, useRef } from 'react'
import { filesService } from '@/services/files.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Upload, Search, FileText, Image, Film, File, Trash2, Download
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { FlowFile } from '@/types/database'

interface Props {
  params: Promise<{ workspace: string }>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />
  if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-blue-400" />
  if (mimeType.startsWith('video/')) return <Film className="h-5 w-5 text-purple-400" />
  if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-400" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

export default function FilesPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [files, setFiles] = useState<FlowFile[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    filesService
      .getByWorkspace(currentWorkspace.id)
      .then((data) => setFiles(data as FlowFile[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !currentWorkspace?.id || !user?.id) return
    const file = e.target.files[0]
    setUploading(true)
    try {
      const uploaded = await filesService.upload(file, currentWorkspace.id, user.id)
      setFiles((prev) => [uploaded, ...prev])
      toast.success(`${file.name} importé`)
    } catch {
      toast.error('Échec de l\'import')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(file: FlowFile) {
    if (!confirm(`Supprimer "${file.name}" ?`)) return
    try {
      await filesService.delete(file.id, file.storage_path)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
      toast.success('Fichier supprimé')
    } catch {
      toast.error('Échec de la suppression')
    }
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Fichiers</h1>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            accept="*/*"
          />
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Envoi…' : 'Importer'}
          </Button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher des fichiers…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3">
            <File className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucun fichier</p>
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Importer un fichier
            </Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-2 text-xs font-medium text-muted-foreground">Nom</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Taille</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Importé le</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((file) => (
                <tr key={file.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <FileIcon mimeType={file.mime_type} />
                      <span className="text-sm truncate max-w-xs">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {file.size ? formatBytes(file.size) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(file.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.url && (
                        <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDelete(file)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
