// src/components/NotepadPanel.tsx
// 迭代记事板面板：双 tab（待完成/已完成）。待完成=条目化待办（bug/新功能/功能优化三分类），
// 悬停 ✓ 完成自动归档，悬停出现的拖动手柄可手动排序；
// 已完成=迭代档案（短标题列表，点击行内展开全文，顶部迷你统计）。
// 面板固定于界面右下角向上展开（入口见 NotepadFab），左上角拖拽手柄调大小，
// A−/A+ 字号，点击面板外/Esc 收起。
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { NOTEPAD_CATEGORY_LABELS, computeNotepadStats, deriveTitle } from '@/lib/notepad'
import type { NotepadCategory, NotepadFontSize, NotepadItem } from '@shared/index'

const CATEGORIES: NotepadCategory[] = ['feature', 'improvement', 'bug']

const CATEGORY_CHIP: Record<NotepadCategory, string> = {
  feature: 'text-ember border-ember/50',
  improvement: 'text-[#7fb069] border-[#7fb069]/50',
  bug: 'text-[#c0605e] border-[#c0605e]/50',
}

const FONT_STEP: Record<NotepadFontSize, number> = { sm: -1, base: 0, lg: 1 }
const FONT_CLASS: Record<NotepadFontSize, string> = {
  sm: 'text-xs',
  base: 'text-sm',
  lg: 'text-base',
}

const MIN_W = 320
const MIN_H = 280
const DEFAULT_SIZE = { w: 384, h: 560 }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function NotepadPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useStore(s => s.notepadItems)
  const log = useStore(s => s.notepadLog)
  const fontSize = useStore(s => s.notepadFontSize)
  const panelSize = useStore(s => s.notepadPanelSize)
  const addNotepadItem = useStore(s => s.addNotepadItem)
  const resolveNotepadItem = useStore(s => s.resolveNotepadItem)
  const deleteNotepadItem = useStore(s => s.deleteNotepadItem)
  const moveNotepadItem = useStore(s => s.moveNotepadItem)
  const updateNotepadItem = useStore(s => s.updateNotepadItem)
  const setNotepadFontSize = useStore(s => s.setNotepadFontSize)
  const setNotepadPanelSize = useStore(s => s.setNotepadPanelSize)

  const panelRef = useRef<HTMLDivElement | null>(null)
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [draft, setDraft] = useState('')
  const [draftCategory, setDraftCategory] = useState<NotepadCategory>('feature')
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null)
  // 待办手动排序：dragId=已按下拖动手柄的条目，dropIndex=相对原数组的插入位
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  // 行内编辑：就地改内容 + 分类（2026-10-22 需求，比"打回输入框"更直接）
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState<NotepadCategory>('feature')

  const size = liveSize ?? panelSize ?? DEFAULT_SIZE

  // 点击面板外 / Esc 收起
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (panelRef.current?.contains(t)) return
      if (t.closest('[data-testid="notepad-fab-button"]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const bumpFont = (dir: 1 | -1) => {
    const order: NotepadFontSize[] = ['sm', 'base', 'lg']
    const cur = order.indexOf(fontSize)
    const next = order[Math.max(0, Math.min(order.length - 1, cur + dir))]
    if (next !== fontSize) setNotepadFontSize(next)
  }

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    addNotepadItem(t, draftCategory)
    setDraft('')
  }

  // 粘贴多行 → 自动拆成多条（归入当前选择的分类）
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n')) return
    e.preventDefault()
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => addNotepadItem(l, draftCategory))
  }

  const onComplete = (id: string) => {
    if (completingId) return
    setCompletingId(id)
    setTimeout(() => {
      resolveNotepadItem(id)
      setCompletingId(null)
    }, 450)
  }

  const startEdit = (item: NotepadItem) => {
    setEditingId(item.id)
    setEditText(item.text)
    setEditCategory(item.category)
  }

  const submitEdit = () => {
    const t = editText.trim()
    if (editingId && t) updateNotepadItem(editingId, { text: t, category: editCategory })
    setEditingId(null)
  }

  // 拖放结束提交排序：dropIndex 是相对原数组的插入位，被拖项先移除后插入位需减 1 修正
  const commitReorder = () => {
    if (dragId == null || dropIndex == null) return
    const from = items.findIndex(i => i.id === dragId)
    if (from < 0) return
    const to = dropIndex > from ? dropIndex - 1 : dropIndex
    if (to !== from) moveNotepadItem(dragId, to)
  }

  // 左上角拖拽手柄：往左上拖放大（面板固定右下角，向上展开）
  const onGripPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...size }
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(MIN_W, Math.min(window.innerWidth * 0.9, start.w + (startX - ev.clientX)))
      const h = Math.max(MIN_H, Math.min(window.innerHeight * 0.8, start.h + (startY - ev.clientY)))
      setLiveSize({ w: Math.round(w), h: Math.round(h) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveSize(prev => {
        if (prev) setNotepadPanelSize(prev)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const stats = computeNotepadStats(items, log)
  const maxMonthly = Math.max(1, ...stats.monthly.map(m => m.count))
  const sortedLog = [...log].sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt))

  const tabBtn = (id: 'pending' | 'done', label: string, count: number) => (
    <button
      type="button"
      data-testid={`notepad-tab-${id}`}
      onClick={() => setTab(id)}
      className={`px-2.5 py-0.5 text-[11px] transition-colors
                  ${tab === id ? 'bg-ember text-ink font-bold'
                               : 'text-parchment/45 hover:text-parchment/70'}`}
    >{label} {count}</button>
  )

  return (
    <div
      ref={panelRef}
      data-testid="notepad-panel"
      style={{ width: size.w, height: size.h }}
      className="fixed bottom-[4.25rem] right-5 z-30 rounded-lg border border-parchment/30
                 bg-[rgba(15,10,8,0.85)] backdrop-blur-md shadow-lg flex flex-col"
    >
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-parchment/10">
        <span className="text-xs text-parchment/60 mr-1">迭代记事板</span>
        <span className="flex rounded-md border border-parchment/25 overflow-hidden">
          {tabBtn('pending', '待完成', items.length)}
          {tabBtn('done', '已完成', log.length)}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="notepad-font-dec"
          onClick={() => bumpFont(-1)}
          disabled={FONT_STEP[fontSize] === -1}
          className="h-6 min-w-6 px-1 rounded border border-parchment/25 text-xs text-parchment/70
                     hover:border-ember/60 hover:text-ember disabled:opacity-30 disabled:hover:border-parchment/25 disabled:hover:text-parchment/70"
        >−</button>
        <button
          type="button"
          data-testid="notepad-font-inc"
          onClick={() => bumpFont(1)}
          disabled={FONT_STEP[fontSize] === 1}
          className="h-6 min-w-6 px-1 rounded border border-parchment/25 text-xs text-parchment/70
                     hover:border-ember/60 hover:text-ember disabled:opacity-30 disabled:hover:border-parchment/25 disabled:hover:text-parchment/70"
        >＋</button>
      </div>

      {tab === 'pending' && (
        <>
          <div className={`flex-1 overflow-y-auto px-2 py-1 ${FONT_CLASS[fontSize]}`}>
            {items.length === 0 && (
              <div className="px-2 py-6 text-center text-parchment/35 text-xs">没有待办——去下面记一笔</div>
            )}
            {items.map((item, i) => (
              <div key={item.id}>
                {dragId != null && dropIndex === i && (
                  <div data-testid="notepad-drop-marker" className="h-0.5 mx-2 rounded bg-ember/80" />
                )}
                <div
                  data-testid="notepad-item"
                  draggable={dragId === item.id}
                  onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}
                  onDragOver={e => {
                    if (dragId == null) return
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    setDropIndex(i + (e.clientY < r.top + r.height / 2 ? 0 : 1))
                  }}
                  onDrop={e => { e.preventDefault(); commitReorder() }}
                  onDragEnd={() => { commitReorder(); setDragId(null); setDropIndex(null) }}
                  className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg transition-all duration-300
                              hover:bg-parchment/5
                              ${completingId === item.id ? 'opacity-40 -translate-x-2' : ''}
                              ${dragId === item.id ? 'opacity-40' : ''}`}
                >
                  <span className="text-ember font-bold min-w-4 pt-px text-[0.85em]">{i + 1}</span>
                  {editingId === item.id ? (
                    <span className="flex-1 min-w-0" data-testid="notepad-edit-row">
                      <input
                        data-testid="notepad-edit-input"
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') submitEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full bg-parchment/10 rounded px-2 py-1 outline-none text-parchment"
                      />
                      <span className="flex gap-1 mt-1" data-testid="notepad-edit-category-picker">
                        {CATEGORIES.map(c => (
                          <button
                            key={c}
                            type="button"
                            data-testid={`notepad-edit-cat-${c}`}
                            onClick={() => setEditCategory(c)}
                            className={`px-1.5 py-px rounded-full text-[10px] border transition-colors
                                        ${editCategory === c
                                          ? 'border-ember text-ember bg-ember/10'
                                          : 'border-parchment/20 text-parchment/45 hover:border-parchment/40'}`}
                          >{NOTEPAD_CATEGORY_LABELS[c]}</button>
                        ))}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-px border mt-[0.15em] ${CATEGORY_CHIP[item.category]}`}>
                        {NOTEPAD_CATEGORY_LABELS[item.category]}
                      </span>
                      <span className={`flex-1 leading-relaxed text-parchment/90
                                        ${completingId === item.id ? 'line-through' : ''}`}>
                        {item.text}
                      </span>
                    </>
                  )}
                  {editingId === item.id ? (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        data-testid="notepad-edit-save"
                        title="保存"
                        onClick={submitEdit}
                        className="w-5 h-5 rounded border border-ember/60 text-ember text-xs
                                   hover:bg-ember/15"
                      >✓</button>
                      <button
                        type="button"
                        data-testid="notepad-edit-cancel"
                        title="取消"
                        onClick={() => setEditingId(null)}
                        className="w-5 h-5 rounded border border-parchment/30 text-parchment/60 text-xs
                                   hover:bg-parchment/10"
                      >✕</button>
                    </span>
                  ) : (
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      data-testid="notepad-edit"
                      title="编辑"
                      onClick={() => startEdit(item)}
                      className="w-5 h-5 rounded border border-parchment/30 text-parchment/60
                                 hover:border-ember/60 hover:text-ember flex items-center justify-center"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                           strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      data-testid="notepad-drag"
                      title="拖动排序"
                      onPointerDown={() => setDragId(item.id)}
                      onPointerUp={() => { if (dropIndex == null) setDragId(null) }}
                      className="w-5 h-5 rounded border border-parchment/30 text-parchment/60 cursor-grab
                                 hover:border-ember/60 hover:text-ember flex items-center justify-center"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                        <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
                        <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
                        <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      data-testid="notepad-resolve"
                      title="完成（移入已完成）"
                      onClick={() => onComplete(item.id)}
                      className="w-5 h-5 rounded border border-[#7fb069]/50 text-[#7fb069] text-xs
                                 hover:bg-[#7fb069]/15"
                    >✓</button>
                    <button
                      type="button"
                      data-testid="notepad-delete"
                      title="删除"
                      onClick={() => deleteNotepadItem(item.id)}
                      className="w-5 h-5 rounded border border-[#c0605e]/50 text-[#c0605e] text-xs
                                 hover:bg-[#c0605e]/15"
                    >✕</button>
                  </span>
                  )}
                </div>
                {dragId != null && dropIndex === items.length && i === items.length - 1 && (
                  <div data-testid="notepad-drop-marker" className="h-0.5 mx-2 rounded bg-ember/80" />
                )}
              </div>
            ))}
          </div>

          <div className="px-3 pt-2 pb-1 border-t border-parchment/10">
            <div className="flex gap-1.5 mb-1.5" data-testid="notepad-category-picker">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  data-testid={`notepad-cat-${c}`}
                  onClick={() => setDraftCategory(c)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors
                              ${draftCategory === c
                                ? 'border-ember text-ember bg-ember/10'
                                : 'border-parchment/20 text-parchment/45 hover:border-parchment/40'}`}
                >{NOTEPAD_CATEGORY_LABELS[c]}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ember font-bold">+</span>
              <input
                data-testid="notepad-input"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                onPaste={onPaste}
                placeholder="记一笔…（回车添加）"
                className="flex-1 bg-transparent outline-none text-sm text-parchment placeholder:text-parchment/35"
              />
            </div>
          </div>
        </>
      )}

      {tab === 'done' && (
        <div className={`flex-1 overflow-y-auto px-2 py-1 ${FONT_CLASS[fontSize]}`}>
          <div className="flex items-center gap-3 px-2 py-2 text-[10px] text-parchment/45">
            <span>累计 <span className="text-ember font-bold">{stats.totalResolved}</span></span>
            <span>本月 <span className="text-ember font-bold">{stats.resolvedThisMonth}</span></span>
            <span className="flex-1" />
            <span className="flex items-end gap-0.5 h-4" title="近 6 个月趋势">
              {stats.monthly.map(m => (
                <span
                  key={m.month}
                  title={`${m.month}：${m.count} 条`}
                  className="w-2 rounded-sm bg-gradient-to-b from-ember to-[#8a4a33]"
                  style={{ height: `${Math.max(12, (m.count / maxMonthly) * 100)}%` }}
                />
              ))}
            </span>
          </div>
          {sortedLog.length === 0 && (
            <div className="px-2 py-6 text-center text-parchment/35 text-xs">还没有已完成的条目</div>
          )}
          {/* 山河长廊：左侧 96px 装饰轨道（河/山交替），右侧每条需求通栏整行。
              轨道段逐行自绘（svg overflow visible），行高变化不影响路径 */}
          {(() => {
            const ROW_H = 68
            const TRACK_W = 96
            const NODE_Y = 26
            const modeOf = (i: number): 'river' | 'mountain' => Math.floor(i / 3) % 2 === 0 ? 'river' : 'mountain'
            const xOf = (i: number) => modeOf(i) === 'river'
              ? 48 + Math.sin(i * 1.1) * 22
              : (i % 2 === 0 ? 26 : 70)
            return (
              <div className="mt-1">
                {sortedLog.map((entry, i) => {
                  const expanded = expandedId === entry.id
                  const isLast = i === sortedLog.length - 1
                  const x = xOf(i)
                  const mode = modeOf(i)
                  const px = i > 0 ? xOf(i - 1) : null
                  const pmode = i > 0 ? modeOf(i - 1) : null
                  const segD = px !== null
                    ? (pmode === 'river' && mode === 'river'
                        ? `M ${px} ${NODE_Y - ROW_H} C ${px} ${NODE_Y - ROW_H / 2}, ${x} ${NODE_Y - ROW_H / 2}, ${x} ${NODE_Y}`
                        : `M ${px} ${NODE_Y - ROW_H} L ${x} ${NODE_Y}`)
                    : null
                  // 登山段第一行补一个山脚剪影
                  const showPeak = mode === 'mountain' && pmode !== 'mountain'
                  return (
                    <div key={entry.id} className="flex items-stretch">
                      <div className="relative shrink-0" style={{ width: TRACK_W, minHeight: ROW_H }}>
                        {showPeak && (
                          <svg className="absolute inset-0" width={TRACK_W} height={ROW_H}>
                            <path d={`M 4 ${ROW_H} L ${TRACK_W / 2} 6 L ${TRACK_W - 4} ${ROW_H} Z`} fill="rgba(232,213,183,.07)" />
                          </svg>
                        )}
                        <svg className="absolute inset-0 overflow-visible" width={TRACK_W} height={ROW_H}>
                          {segD && pmode === 'river' && mode === 'river' && (
                            <path d={segD} fill="none" stroke="#d97757" strokeWidth={12} strokeLinecap="round" opacity={.16} />
                          )}
                          {segD && (
                            <path
                              d={segD} fill="none"
                              stroke="#d97757"
                              strokeWidth={pmode === 'river' && mode === 'river' ? 2.5 : 1.5}
                              strokeLinecap="round"
                              strokeDasharray={pmode === 'river' && mode === 'river' ? undefined : '4 5'}
                              opacity={pmode === 'river' && mode === 'river' ? .95 : .8}
                            />
                          )}
                          <circle
                            cx={x} cy={NODE_Y} r={isLast ? 5 : 4}
                            fill={isLast ? '#d97757' : '#2a1f1a'}
                            stroke={isLast ? '#d97757' : 'rgba(217,119,87,.7)'}
                            strokeWidth={2}
                            style={isLast ? { filter: 'drop-shadow(0 0 5px rgba(217,119,87,.9))' } : undefined}
                          />
                        </svg>
                      </div>
                      <div
                        data-testid="notepad-log-entry"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        className={`flex-1 min-w-0 my-1 rounded-lg px-3 py-2 cursor-pointer transition-colors
                                    hover:bg-parchment/5 ${expanded ? 'bg-parchment/5' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-px border ${CATEGORY_CHIP[entry.category]}`}>
                            {NOTEPAD_CATEGORY_LABELS[entry.category]}
                          </span>
                          <span className="shrink-0 text-[10px] text-parchment/50 tabular-nums">{fmtDate(entry.resolvedAt).slice(5)}</span>
                          {entry.source === 'agent' && <span className="shrink-0 text-[10px] text-parchment/30">agent</span>}
                        </div>
                        <div className="leading-relaxed text-parchment/90 mt-0.5 truncate">
                          {entry.title ?? deriveTitle(entry.text)}
                        </div>
                        {expanded && (
                          <div className="mt-1.5 pt-1.5 border-t border-parchment/15 text-parchment/65 leading-relaxed text-[0.9em]">
                            {entry.text}
                            <div className="text-[10px] text-parchment/40 mt-1">
                              记入 {fmtDate(entry.createdAt)} · 解决于 {fmtDate(entry.resolvedAt)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {sortedLog.length > 0 && (
                  <div className="flex">
                    <div className="relative shrink-0" style={{ width: TRACK_W, height: 26 }}>
                      <svg className="absolute inset-0 overflow-visible" width={TRACK_W} height={26}>
                        <line
                          x1={xOf(sortedLog.length - 1)} y1={NODE_Y - ROW_H + 42}
                          x2={xOf(sortedLog.length - 1)} y2={20}
                          stroke="#d97757" strokeWidth={1.5} strokeDasharray="2 4" opacity={.4}
                        />
                      </svg>
                    </div>
                    <div className="text-[10px] tracking-widest text-ember/50 self-center">山河仍在延伸…</div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      <div
        data-testid="notepad-resize-grip"
        onPointerDown={onGripPointerDown}
        className="absolute left-1 top-1 w-5 h-5 cursor-nwse-resize touch-none"
        title="拖拽调整大小"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="round" className="w-full h-full text-ember/70">
          <path d="M17 3 L3 17" /><path d="M17 9 L9 17" /><path d="M17 15 L15 17" />
        </svg>
      </div>
    </div>
  )
}
