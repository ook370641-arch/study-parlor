// electron/lib/painting-focus.ts
// 画作焦点写回 Pictures/index.json。与 scripts/curation-crop.cjs 的约定一致：
// FOCUS_RE 校验、默认焦点（50% 50%）删字段、tmp+rename 原子写。
import fs from 'node:fs'
import type { PaintingFocusErrorCode } from '@shared/index'

export const DEFAULT_FOCUS = '50% 50%'
export const FOCUS_RE = /^\d{1,3}% \d{1,3}%$/

export type SetFocusResult = { ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }

export function applyFocusToIndex(indexPath: string, id: string, focus: string): SetFocusResult {
  if (!FOCUS_RE.test(focus)) {
    return { ok: false, code: 'INVALID_FOCUS', message: `非法 focus 格式: ${focus}` }
  }
  let index: Array<{ id?: string; focus?: string }>
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  } catch (err) {
    return { ok: false, code: 'INDEX_UNREADABLE', message: `index.json 读取失败: ${err instanceof Error ? err.message : String(err)}` }
  }
  const entry = index.find(p => p.id === id)
  if (!entry) {
    return { ok: false, code: 'UNKNOWN_PAINTING', message: `未知画作 id: ${id}` }
  }
  if (focus === DEFAULT_FOCUS) delete entry.focus
  else entry.focus = focus
  try {
    const tmp = indexPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n')
    fs.renameSync(tmp, indexPath)
  } catch (err) {
    return { ok: false, code: 'WRITE_FAILED', message: `index.json 写入失败: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: true }
}
