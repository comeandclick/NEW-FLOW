// Liens universels de l'app iPhone Flow Workspace : un lien https://…/app/… (e-mail, message) ouvre l'app quand elle est installée.
// L'app doit déclarer « applinks:<domaine> » (Associated Domains) pour qu'iOS lise ce fichier.
const APP_ID = 'HC882B2L2H.flow.workspace'

export const dynamic = 'force-static'

export function GET() {
  return Response.json({
    applinks: { details: [{ appIDs: [APP_ID], components: [{ '/': '/app/*', comment: 'Espace de travail' }, { '/': '/invite/*', comment: 'Invitations' }] }] },
    webcredentials: { apps: [APP_ID] },
  })
}
