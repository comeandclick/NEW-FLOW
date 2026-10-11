import { commandFile } from '@/lib/studio/server/installer-script'
import { publicOrigin } from '@/lib/studio/server/origin'
import { zipStore } from '@/lib/studio/server/zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Archive à télécharger : contient « Installer Flow Studio.command » (exécutable). Double-clic = installation complète. */
export async function GET(req: Request) {
  let origin: string
  try { origin = publicOrigin(req) } catch { return new Response('bad host', { status: 400 }) }
  const zip = zipStore([
    { name: 'Installer Flow Studio.command', data: Buffer.from(commandFile(origin), 'utf8'), mode: 0o755 },
    { name: 'LISEZ-MOI.txt', data: Buffer.from(`Flow Studio — installation sur Mac\n\n1. Double-clique « Installer Flow Studio.command ».\n2. Si le Mac refuse de l'ouvrir (développeur non identifié) : clic droit sur le fichier > Ouvrir > Ouvrir.\n3. Suis les étapes dans la fenêtre : elle vérifie ton Mac, installe ce qui manque et affiche un code.\n4. Entre le code sur Flow (Création de site > Connexion du Mac).\n\nTout est expliqué sur ${origin}/studio/install\n`, 'utf8') },
  ])
  return new Response(new Uint8Array(zip), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Flow-Studio-Installer.zip"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
