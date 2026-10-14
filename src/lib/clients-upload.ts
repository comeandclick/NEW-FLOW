'use client'
/**
 * Envoi d'un fichier vers un lien d'envoi signé de Supabase, avec la progression (une vidéo de 40 Mo prend du temps).
 * Même requête que storage-js `uploadToSignedUrl` (PUT sur /object/upload/sign/...?token=), corps brut.
 */
export function putSigned(url: string, file: File, onProgress?: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (anon) xhr.setRequestHeader('apikey', anon)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    // corps brut (pas de formulaire) : même chemin que storage-js pour un flux, type du fichier conservé
    xhr.send(file)
  })
}

/** Lien d'envoi signé à partir du jeton renvoyé par l'API (côté client). */
export const signedUploadUrl = (bucket: string, path: string, token: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(token)}`
