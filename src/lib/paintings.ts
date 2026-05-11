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
