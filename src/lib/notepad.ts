// src/lib/notepad.ts
// 迭代记事板纯逻辑：分类猜测、coverNotepad 旧文本迁移、统计聚合。不依赖 store/IPC，便于单测。
import type { NotepadCategory, NotepadItem, NotepadLogEntry } from '@shared/index'

export const NOTEPAD_CATEGORY_LABELS: Record<NotepadCategory, string> = {
  bug: 'bug',
  feature: '新功能',
  improvement: '功能优化',
}

/** 兜底短标题：取首个分句（。，：；！？或换行截断），超 15 字截断加省略号 */
export function deriveTitle(text: string): string {
  const firstClause = text.split(/[。，：；！？,;:!?\n]/).map(t => t.trim()).find(t => t.length > 0) ?? text.trim()
  return firstClause.length > 15 ? firstClause.slice(0, 15) + '…' : firstClause
}

export function newNotepadId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 文本 → 分类猜测：含 bug/修复/问题/收起/不符 等 → bug；删减/优化/集成/长期 → 功能优化；否则新功能 */
export function guessCategory(text: string): NotepadCategory {
  if (/bug|修复|问题|收起|不符|错误|失败/i.test(text)) return 'bug'
  if (/删减|优化|改进|集成|长期|迁移|重构/.test(text)) return 'improvement'
  return 'feature'
}

/** 去掉旧记事板行首的有序列表编号（"1、" "2." "- " 等） */
function stripLeadingMarker(line: string): string {
  return line.replace(/^\s*(?:\d+[、.）)]|[-*•])\s*/, '').trim()
}

/**
 * 一次性迁移：notepadItems 已存在则原样返回（幂等）；
 * 否则把 coverNotepad 纯文本按非空行拆成条目，类别自动猜测。
 */
export function migrateCoverNotepad(
  coverNotepad: string,
  existing: NotepadItem[] | undefined,
  now = new Date().toISOString(),
): NotepadItem[] {
  if (existing) return existing
  return coverNotepad
    .split('\n')
    .map(stripLeadingMarker)
    .filter(line => line.length > 0)
    .map(text => ({
      id: newNotepadId(),
      text,
      category: guessCategory(text),
      createdAt: now,
    }))
}

export interface NotepadStats {
  totalResolved: number
  resolvedThisMonth: number
  pending: number
  /** 近 6 个月（含当月）完成数，按时间升序 */
  monthly: { month: string; count: number }[]
}

export function computeNotepadStats(
  items: NotepadItem[],
  log: NotepadLogEntry[],
  now = new Date(),
): NotepadStats {
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    months.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  const counts = new Map<string, number>(months.map(m => [m, 0]))
  const thisMonth = ym(now)
  let resolvedThisMonth = 0
  for (const entry of log) {
    const m = entry.resolvedAt.slice(0, 7)
    if (counts.has(m)) counts.set(m, (counts.get(m) ?? 0) + 1)
    if (m === thisMonth) resolvedThisMonth++
  }
  return {
    totalResolved: log.length,
    resolvedThisMonth,
    pending: items.length,
    monthly: months.map(m => ({ month: m, count: counts.get(m) ?? 0 })),
  }
}

/** 按 resolvedAt 月份（YYYY-MM）降序分组，组内按解决时间倒序 */
export function groupLogByMonth(log: NotepadLogEntry[]): { month: string; entries: NotepadLogEntry[] }[] {
  const groups = new Map<string, NotepadLogEntry[]>()
  for (const entry of log) {
    const m = entry.resolvedAt.slice(0, 7)
    if (!groups.has(m)) groups.set(m, [])
    groups.get(m)!.push(entry)
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, entries]) => ({
      month,
      entries: [...entries].sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt)),
    }))
}