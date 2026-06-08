'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, FileText, File } from 'lucide-react'
import type { FlowFile } from '@/types/database'

interface FilePreviewModalProps {
  file: FlowFile | null
  open: boolean
  onClose: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FilePreviewModal({ file, open, onClose }: FilePreviewModalProps) {
  if (!file) return null

  const url = file.url ?? undefined
  const mime = file.mime_type ?? ''
  const isImage = mime.startsWith('image/')
  const isVideo = mime.startsWith('video/')
  const isPdf = mime.includes('pdf')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium truncate">
            {isImage ? null : isPdf ? <FileText className="h-4 w-4 text-red-400 shrink-0" /> : <File className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="truncate">{file.name}</span>
            {file.size && (
              <span className="text-xs text-muted-foreground font-normal shrink-0">
                {formatBytes(file.size)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center min-h-[300px] max-h-[70vh] overflow-auto bg-muted/20">
          {!url ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <File className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aperçu non disponible</p>
            </div>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              className="max-w-full max-h-[65vh] object-contain"
            />
          ) : isVideo ? (
            <video
              src={url}
              controls
              className="max-w-full max-h-[65vh] rounded"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={file.name}
              className="w-full"
              style={{ height: '65vh', border: 'none' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12">
              <File className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aperçu non disponible pour ce type de fichier</p>
              <a href={url} download={file.name} target="_blank" rel="noopener noreferrer">
                <Button size="sm">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Télécharger
                </Button>
              </a>
            </div>
          )}
        </div>

        {url && (isImage || isVideo || isPdf) && (
          <div className="flex justify-end px-5 py-3 border-t border-border shrink-0">
            <a href={url} download={file.name} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
