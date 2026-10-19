import { connect, constants } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'

/**
 * Notifications natives de l'app iPhone Flow Workspace (APNs), sans Firebase.
 * L'app range son jeton dans push_subscriptions avec endpoint = `apns:<jeton>` (keys.topic = identifiant de l'app).
 * Variables : APNS_KEY (contenu du fichier .p8, \n accepté), APNS_KEY_ID, APNS_TEAM_ID. Sans elles : rien n'est envoyé.
 */
type Result = 'ok' | 'gone' | 'error'
let jwt: { value: string; at: number } | null = null

export const apnsConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID)

function token(): string {
  // Apple accepte un même jeton pendant 1 h ; on le renouvelle toutes les 50 min.
  if (jwt && Date.now() - jwt.at < 50 * 60e3) return jwt.value
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID }), body = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })
  const key = createPrivateKey((process.env.APNS_KEY ?? '').replace(/\\n/g, '\n'))
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  jwt = { value: `${head}.${body}.${sig}`, at: Date.now() }
  return jwt.value
}

function send(host: string, device: string, topic: string, payload: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = connect(`https://${host}`)
    client.on('error', () => resolve({ status: 0 }))
    const req = client.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST', [constants.HTTP2_HEADER_PATH]: `/3/device/${device}`,
      authorization: `bearer ${token()}`, 'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10',
    })
    let status = 0, data = ''
    req.on('response', (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS]) })
    req.on('data', (c) => { data += c })
    req.on('end', () => { client.close(); let reason: string | undefined; try { reason = JSON.parse(data).reason } catch { /* vide si 200 */ } resolve({ status, reason }) })
    req.on('error', () => { client.close(); resolve({ status: 0 }) })
    req.setTimeout(8000, () => { req.close(); client.close(); resolve({ status: 0 }) })
    req.end(payload)
  })
}

/** Envoie une notification à un iPhone. Essaie la production puis le bac à sable (apps installées depuis Xcode). */
export async function sendApns(endpoint: string, keys: { topic?: string } | null, n: { title: string; body?: string | null; url?: string | null }): Promise<Result> {
  if (!apnsConfigured() || !endpoint.startsWith('apns:')) return 'error'
  const device = endpoint.slice(5), topic = keys?.topic ?? 'flow.workspace'
  const payload = JSON.stringify({
    aps: { alert: { title: n.title.slice(0, 120), body: (n.body ?? '').slice(0, 200) }, sound: 'default', 'thread-id': 'flow' },
    url: n.url ?? '/app',
  })
  let r = await send('api.push.apple.com', device, topic, payload)
  if (r.status === 400 && r.reason === 'BadDeviceToken') r = await send('api.sandbox.push.apple.com', device, topic, payload)
  if (r.status === 200) return 'ok'
  if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') return 'gone'
  return 'error'
}
