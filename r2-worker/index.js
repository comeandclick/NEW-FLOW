// Fichiers de Flow sur Cloudflare R2 (19/11/2026) : le stockage Supabase gratuit (1 Go) était plein.
// Toute requête doit porter une signature HMAC faite par le serveur de Flow (secret partagé SECRET) :
//   GET    /<chemin>?e=<expiration unix>&s=<signature>   lire (Range accepté, cache navigateur long)
//   PUT    /<chemin>?e=…&s=…&o=put                       déposer (déménageur, outils)
//   DELETE /<chemin>?e=…&s=…&o=del                       supprimer
// signature = hex(HMAC-SHA256(SECRET, `${op}:${chemin}:${e}`)), op = get | put | del.
const enc = new TextEncoder();
async function signe(secret, texte) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texte)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function egal(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag'};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    const u = new URL(req.url);
    const chemin = decodeURIComponent(u.pathname.slice(1));
    const op = req.method === 'PUT' ? 'put' : req.method === 'DELETE' ? 'del' : 'get';
    const e = Number(u.searchParams.get('e') || 0), s = u.searchParams.get('s') || '';
    if (!chemin || chemin.includes('..') || !e || e < Date.now() / 1000) return new Response('Lien expiré ou invalide', {status: 403, headers: CORS});
    if (!egal(s, await signe(env.SECRET, `${op}:${chemin}:${e}`))) return new Response('Signature invalide', {status: 403, headers: CORS});
    if (op === 'put') {
      await env.FICHIERS.put(chemin, req.body, {httpMetadata: {contentType: req.headers.get('content-type') || 'application/octet-stream', cacheControl: 'private, max-age=31536000, immutable'}});
      const o = await env.FICHIERS.head(chemin);
      return Response.json({ok: true, taille: o?.size ?? 0}, {headers: CORS});
    }
    if (op === 'del') { await env.FICHIERS.delete(chemin); return Response.json({ok: true}, {headers: CORS}); }
    const range = req.headers.get('range');
    const o = await env.FICHIERS.get(chemin, range ? {range: req.headers} : {});
    if (!o) return new Response('Introuvable', {status: 404, headers: CORS});
    const h = new Headers(CORS);
    o.writeHttpMetadata(h); h.set('ETag', o.httpEtag); h.set('Accept-Ranges', 'bytes');
    h.set('Cache-Control', 'private, max-age=604800');
    const nom = u.searchParams.get('n'); if (nom) h.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nom)}`);
    if (range && o.range) { const r = o.range; const debut = r.offset ?? 0; const len = r.length ?? (o.size - debut); h.set('Content-Range', `bytes ${debut}-${debut + len - 1}/${o.size}`); h.set('Content-Length', String(len)); return new Response(req.method === 'HEAD' ? null : o.body, {status: 206, headers: h}); }
    h.set('Content-Length', String(o.size));
    return new Response(req.method === 'HEAD' ? null : o.body, {headers: h});
  },
};
