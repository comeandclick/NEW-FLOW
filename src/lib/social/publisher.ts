/** Real publishing to each social platform via their official API. */
import type { Platform } from './types'

export interface PublishResult {
  ok: boolean
  url?: string
  postId?: string
  error?: string
}

export interface PublishPayload {
  accessToken: string
  caption: string
  title?: string | null
  mediaUrls: string[]
  platform: Platform
  externalAccountId: string
}

// ── Instagram Graph API ───────────────────────────────────────────────────────

async function publishInstagram(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, externalAccountId } = payload

  // Get IG Business Account linked to this FB page (or use the IG account directly)
  const igRes = await fetch(`https://graph.facebook.com/v19.0/${externalAccountId}?fields=instagram_business_account&access_token=${accessToken}`)
  const igData = await igRes.json() as { instagram_business_account?: { id: string } }
  const igId = igData.instagram_business_account?.id ?? externalAccountId

  const mediaUrl = mediaUrls[0]
  const isVideo = /\.(mp4|mov|avi|webm)$/i.test(mediaUrl ?? '')

  // Step 1: create container
  const body: Record<string, string> = { caption, access_token: accessToken }
  if (mediaUrl) {
    if (isVideo) {
      body.media_type = 'REELS'
      body.video_url = mediaUrl
      body.share_to_feed = 'true'
    } else {
      body.image_url = mediaUrl
    }
  }
  const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const container = await containerRes.json() as { id?: string; error?: { message: string } }
  if (!container.id) return { ok: false, error: container.error?.message ?? 'Container creation failed' }

  // For Reels, wait for STATUS=FINISHED
  if (isVideo) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const statusRes = await fetch(`https://graph.facebook.com/v19.0/${container.id}?fields=status_code&access_token=${accessToken}`)
      const status = await statusRes.json() as { status_code?: string }
      if (status.status_code === 'FINISHED') break
      if (status.status_code === 'ERROR') return { ok: false, error: 'Video processing failed' }
    }
  }

  // Step 2: publish
  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
  })
  const pub = await publishRes.json() as { id?: string; error?: { message: string } }
  if (!pub.id) return { ok: false, error: pub.error?.message ?? 'Publish failed' }

  return { ok: true, postId: pub.id, url: `https://www.instagram.com/p/${pub.id}/` }
}

// ── Facebook Graph API ────────────────────────────────────────────────────────

async function publishFacebook(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, title, mediaUrls, externalAccountId } = payload

  let endpoint: string
  let body: Record<string, string>

  if (mediaUrls.length > 0) {
    const isVideo = /\.(mp4|mov|avi|webm)$/i.test(mediaUrls[0])
    if (isVideo) {
      endpoint = `https://graph.facebook.com/v19.0/${externalAccountId}/videos`
      body = { file_url: mediaUrls[0], description: caption, access_token: accessToken }
    } else {
      endpoint = `https://graph.facebook.com/v19.0/${externalAccountId}/photos`
      body = { url: mediaUrls[0], caption, access_token: accessToken }
    }
  } else {
    endpoint = `https://graph.facebook.com/v19.0/${externalAccountId}/feed`
    body = { message: caption, access_token: accessToken }
    if (title) body.name = title
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { id?: string; error?: { message: string } }
  if (!data.id) return { ok: false, error: data.error?.message ?? 'FB publish failed' }

  return { ok: true, postId: data.id, url: `https://www.facebook.com/${data.id}` }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function publishTikTok(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls } = payload
  const videoUrl = mediaUrls.find((u) => /\.(mp4|mov|avi|webm)$/i.test(u))
  if (!videoUrl) return { ok: false, error: 'TikTok requires a video file' }

  // Fetch video for push_by_file (avoids domain verification)
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) return { ok: false, error: `Failed to fetch video: ${videoRes.status}` }
  const videoBuffer = await videoRes.arrayBuffer()
  const videoSize = videoBuffer.byteLength

  // Init upload
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  })
  const init = await initRes.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { message: string; code?: string } }
  if (!init.data?.publish_id || !init.data?.upload_url) {
    return { ok: false, error: init.error?.message ?? `TikTok init failed: ${JSON.stringify(init)}` }
  }

  // Upload file (single chunk, < 64 MB)
  const uploadRes = await fetch(init.data.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  })
  if (!uploadRes.ok) return { ok: false, error: `TikTok upload failed: ${uploadRes.status}` }

  return { ok: true, postId: init.data.publish_id }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

async function publishLinkedIn(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, title, mediaUrls } = payload

  // Get LinkedIn URN
  const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const user = await userRes.json() as { sub: string }
  const authorUrn = `urn:li:person:${user.sub}`

  const imageUrl = mediaUrls.find((u) => /\.(jpg|jpeg|png|webp|gif)$/i.test(u))
  const videoUrl = mediaUrls.find((u) => /\.(mp4|mov)$/i.test(u))

  let shareContent: Record<string, unknown>
  if (imageUrl) {
    // Register image upload
    const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    })
    const reg = await registerRes.json() as { value?: { uploadMechanism?: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: { uploadUrl: string } }; asset?: string } }
    const uploadUrl = reg.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl
    const assetUrn = reg.value?.asset
    if (!uploadUrl || !assetUrn) return { ok: false, error: 'LinkedIn image register failed' }

    const imgBuf = await (await fetch(imageUrl)).arrayBuffer()
    await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` }, body: imgBuf })

    shareContent = {
      shareCommentary: { text: caption },
      shareMediaCategory: 'IMAGE',
      media: [{ status: 'READY', description: { text: title ?? caption.slice(0, 200) }, media: assetUrn }],
    }
  } else {
    shareContent = {
      shareCommentary: { text: caption },
      shareMediaCategory: 'NONE',
    }
    void videoUrl
  }

  const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })
  const post = await postRes.json() as { id?: string; message?: string }
  if (!post.id) return { ok: false, error: post.message ?? 'LinkedIn publish failed' }

  return { ok: true, postId: post.id, url: `https://www.linkedin.com/feed/update/${post.id}/` }
}

// ── Ayrshare (fallback universel si AYRSHARE_API_KEY défini) ─────────────────

const AYRSHARE_PLATFORM: Record<string, string> = {
  tiktok: 'tiktok', instagram: 'instagram', facebook: 'facebook', linkedin: 'linkedin',
}

async function publishViaAyrshare(payload: PublishPayload): Promise<PublishResult> {
  const apiKey = process.env.AYRSHARE_API_KEY
  if (!apiKey) return { ok: false, error: 'AYRSHARE_API_KEY not set' }
  const platform = AYRSHARE_PLATFORM[payload.platform]
  if (!platform) return { ok: false, error: `Ayrshare: platform ${payload.platform} unsupported` }
  const res = await fetch('https://app.ayrshare.com/api/post', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: payload.caption, platforms: [platform], mediaUrls: payload.mediaUrls }),
  })
  const data = await res.json() as { postIds?: { id: string }[]; errors?: { message: string }[] }
  if (!res.ok || data.errors?.length) return { ok: false, error: data.errors?.[0]?.message ?? 'Ayrshare error' }
  return { ok: true, postId: data.postIds?.[0]?.id }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function publishTo(payload: PublishPayload): Promise<PublishResult> {
  // Si AYRSHARE_API_KEY présent, on passe par Ayrshare pour TikTok (pas encore approuvé en direct)
  if (process.env.AYRSHARE_API_KEY && payload.platform === 'tiktok') {
    return publishViaAyrshare(payload)
  }
  switch (payload.platform) {
    case 'instagram': return publishInstagram(payload)
    case 'facebook': return publishFacebook(payload)
    case 'tiktok': return publishTikTok(payload)
    case 'linkedin': return publishLinkedIn(payload)
  }
}
