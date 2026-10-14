import { ImageResponse } from 'next/og'

/** PNG app icons for the manifest (Chrome/Android) and iOS home screen. `?maskable=1` adds the safe-zone padding. */
export const dynamic = 'force-static'
export function generateStaticParams() { return [{ size: '180' }, { size: '192' }, { size: '512' }] }

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  const px = ['180', '192', '512'].includes(size) ? Number(size) : 192
  const maskable = new URL(req.url).searchParams.get('maskable') === '1'
  const tile = maskable ? px : Math.round(px * 0.8)
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center', background: maskable || px === 180 ? '#0a0a0a' : 'transparent' }}>
        <div style={{ width: tile, height: tile, borderRadius: maskable || px === 180 ? 0 : tile * 0.24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#262626,#0a0a0a)', color: 'white', fontSize: tile * 0.62, fontWeight: 800, fontFamily: 'sans-serif' }}>F</div>
      </div>
    ),
    { width: px, height: px },
  )
}
