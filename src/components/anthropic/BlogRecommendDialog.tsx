import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BriefingTheme } from '@shared/index'

export function BlogRecommendDialog({ theme, onStart, onCancel }: {
  theme: BriefingTheme
  onStart: (note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isAcademic = theme !== 'newspaper'

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        data-testid="blog-recommend-dialog"
        role="dialog"
        aria-label="重新推荐"
        className={`w-full max-w-lg rounded-lg border p-5 shadow-xl ${isAcademic ? 'bg-ink border-parchment/20 text-parchment' : 'bg-[#faf8f4] border-[#1a1a1a]/20 text-[#1a1a1a]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-serif text-lg font-semibold">重新推荐</h3>
        <div className={`mt-3 space-y-2 text-xs leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
          <p><span className={isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}>1. 写作画像：</span>读取近期写作摘要与最近 5 篇原文，归纳当前方向和知识缺口。</p>
          <p><span className={isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}>2. 检索候选：</span>按画像检索 Anthropic 官方来源；未配置搜索时直接匹配本地文章。</p>
          <p><span className={isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}>3. 精选文章：</span>从最近 80 篇本地文章中排除已读与已移除的推荐，最多选出 5 篇。</p>
        </div>
        <label className="mt-4 block text-sm" htmlFor="blog-recommend-note">本批备注（可选）</label>
        <textarea
          ref={inputRef}
          id="blog-recommend-note"
          data-testid="blog-recommend-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="例如：更关注工程实践，避开纯理论文章"
          className={`mt-1.5 w-full resize-none rounded border px-3 py-2 text-sm outline-none ${isAcademic ? 'bg-parchment/5 border-parchment/20 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#8a3a3a]/60'}`}
        />
        <p className={`mt-1 text-[11px] ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>备注会优先影响本批画像与推荐方向，并保存在推荐记录中。</p>
        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button type="button" data-testid="blog-recommend-cancel" onClick={onCancel} className={isAcademic ? 'px-3 py-1.5 text-parchment/60 hover:text-parchment' : 'px-3 py-1.5 text-[#6b5d52] hover:text-[#1a1a1a]'}>取消</button>
          <button type="button" data-testid="blog-recommend-start" onClick={() => onStart(note.trim())} className="rounded bg-ember px-4 py-1.5 text-white hover:bg-ember/90">开始推荐</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
