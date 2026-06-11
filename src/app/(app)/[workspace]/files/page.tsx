'use client'

import { use, useEffect, useState, useRef } from 'react'
import { filesService } from '@/services/files.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Upload, Search, FileText, Image, Film, File, Trash2, Download, Eye, Link2,
} from 'lucide-react'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { getSupabaseClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { FlowFile } from '@/types/database'
import { FilePreviewModal } from '@/components/files/FilePreviewModal'

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
  const [previewFile, setPreviewFile] = useState<FlowFile | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    filesService
      .getByWorkspace(currentWorkspace.id)
      .then((data) => setFiles(data as FlowFile[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id])

  async function uploadFiles(fileList: FileList | File[]) {
    if (!currentWorkspace?.id || !user?.id) return
    const arr = Array.from(fileList)
    setUploading(true)
    let successCount = 0
    for (const file of arr) {
      try {
        const uploaded = await filesService.upload(file, currentWorkspace.id, user.id)
        setFiles((prev) => [uploaded, ...prev])
        successCount++
      } catch {
        toast.error(`Échec : ${file.name}`)
      }
    }
    if (successCount > 0) toast.success(`${successCount} fichier${successCount > 1 ? 's' : ''} importé${successCount > 1 ? 's' : ''}`)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    await uploadFiles(e.target.files)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  async function handleCopyLink(file: FlowFile) {
    try {
      // Try signed URL first (for private buckets), fallback to public URL
      const { data } = await getSupabaseClient()
        .storage
        .from('workspace-files')
        .createSignedUrl(file.storage_path, 3600 * 24) // 24h
      const url = data?.signedUrl ?? file.url
      if (url) {
        await navigator.clipboard.writeText(url)
        toast.success('Lien copié (valide 24h)')
      } else {
        toast.error('Impossible de générer le lien')
      }
    } catch {
      // Fallback: copy direct url
      if (file.url) {
        await navigator.clipboard.writeText(file.url)
        toast.success('Lien copié')
      } else {
        toast.error('Pas d\'URL disponible')
      }
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
    <div
      className={cn('flex flex-col h-full page-enter relative', dragOver && 'ring-2 ring-primary ring-inset')}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10" />
            <p className="text-sm font-medium">Déposer pour importer</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
        <h1 className="text-base sm:text-lg font-semibold">Fichiers</h1>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
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
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-2.5"><div className="flex items-center gap-2.5"><div className="skeleton h-5 w-5 rounded" /><div className="skeleton h-3.5 w-48" /></div></td>
                  <td className="px-4 py-2.5"><div className="skeleton h-3 w-12" /></td>
                  <td className="px-4 py-2.5"><div className="skeleton h-3 w-20" /></td>
                  <td className="px-4 py-2.5" />
                </tr>
              ))}
            </tbody>
          </table>
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
                <ContextMenu key={file.id}>
                <ContextMenuTrigger>
                <tr
                  className="hover:bg-muted/30 transition-colors group cursor-pointer"
                  onClick={() => setPreviewFile(file)}
                >
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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setPreviewFile(file) }}
                        title="Aperçu">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); handleCopyLink(file) }}
                        title="Copier le lien">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      {file.url && (
                        <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()} title="Télécharger">
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(file) }}
                        title="Supprimer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem onClick={() => setPreviewFile(file)}>
                    <Eye className="mr-2 h-3.5 w-3.5" /> Aperçu
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCopyLink(file)}>
                    <Link2 className="mr-2 h-3.5 w-3.5" /> Copier le lien
                  </ContextMenuItem>
                  {file.url && (
                    <ContextMenuItem onClick={() => { const a = document.createElement('a'); a.href = file.url!; a.download = file.name; a.click() }}>
                      <Download className="mr-2 h-3.5 w-3.5" /> Télécharger
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(file)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                  </ContextMenuItem>
                </ContextMenuContent>
                </ContextMenu>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FilePreviewModal
        file={previewFile}
        open={previewFile !== null}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}
