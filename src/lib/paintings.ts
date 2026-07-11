import manifestData from '@/assets/painting-manifest.json'
import type { Painting } from '@shared/index'

export const manifest: Painting[] = manifestData as Painting[]

export function pickRandom(pool: Painting[], excludeId: string | null): Painting | null {
  const filtered = excludeId ? pool.filter(p => p.id !== excludeId) : pool
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export function formatAttribution(p: Painting): string {
  const parts: string[] = [p.painter, p.title]
  if (typeof p.year === 'number') parts.push(String(p.year))
  return parts.join(' · ')
}

// Warm the browser image cache for the given paintings so the first time a
// surface renders one, it paints instantly instead of flashing the dark base
// color while the JPG loads and decodes from disk. Safe to call in non-DOM
// (test/node) environments where `Image` is undefined.
export function preloadPaintings(paintings: (Painting | null | undefined)[]): void {
  if (typeof Image === 'undefined') return
  for (const p of paintings) {
    if (!p?.url) continue
    const img = new Image()
    img.src = p.url
  }
}
