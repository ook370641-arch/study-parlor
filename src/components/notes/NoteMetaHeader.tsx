import { useState } from 'react'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'
import { StarRating } from './StarRating'

export function NoteMetaHeader({ entry }: { entry: NoteEntry }) {
  const updateNoteMetaAction = useStore(s => s.updateNoteMetaAction)
  const { path, meta } = entry
  const [infoOpen, setInfoOpen] = useState(false)

  const inputCls = 'bg-transparent outline-none border-none min-w-0 placeholder:text-parchment/25'

  return (
    <div className="relative pb-5">
      <input
        data-testid="note-meta-title"
        className={`${inputCls} w-full text-2xl text-[#f0e2c8]`}
        defaultValue={meta.title}
        placeholder="未命名笔记"
        onBlur={e => { if (e.target.value !== meta.title) void updateNoteMetaAction(path, { title: e.target.value }) }}
      />
      <div className="mt-2 flex items-center gap-3 text-[11px] text-parchment/40">
        <StarRating
          value={meta.rating}
          size={14}
          onChange={v => void updateNoteMetaAction(path, { rating: v })}
        />
        {meta.source === 'anthropic' && (
          <span className="text-[10px] px-2 leading-4 rounded-full bg-[#d97757]/20 text-[#e09a7e] border border-[#d97757]/45">
            Anthropic
          </span>
        )}
        <span>
          {meta.read_at ? `读完于 ${meta.read_at.slice(0, 10)} · ` : ''}收录于 {meta.collected_at.slice(0, 10)}
        </span>
        <button
          data-testid="note-meta-info-toggle"
          title="链接与亮点" aria-label="链接与亮点"
          className="ml-auto text-parchment/45 hover:text-parchment"
          onClick={() => setInfoOpen(o => !o)}
        >ⓘ</button>
      </div>
      <input
        data-testid="note-meta-summary"
        className={`${inputCls} mt-3 w-full text-[13px] italic text-parchment/75 border-l-2 border-ember/70 pl-3 py-1 bg-ember/5 rounded-r`}
        defaultValue={meta.summary}
        placeholder="尚未评注…"
        onBlur={e => { if (e.target.value !== meta.summary) void updateNoteMetaAction(path, { summary: e.target.value }) }}
      />
      {infoOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded border border-parchment/15 bg-[#1a1512] p-3 shadow-xl">
          <label className="block">
            <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">来源链接</div>
            <input
              data-testid="note-meta-url"
              className={`${inputCls} w-full text-[12px] text-[#b08a6a] border-b border-parchment/10 pb-1`}
              defaultValue={meta.url}
              placeholder="来源链接"
              onBlur={e => { if (e.target.value !== meta.url) void updateNoteMetaAction(path, { url: e.target.value }) }}
            />
          </label>
          <label className="block mt-3">
            <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">核心亮点</div>
            <input
              data-testid="note-meta-highlight"
              className={`${inputCls} w-full text-[12px] italic text-parchment/85 border-b border-parchment/10 pb-1`}
              defaultValue={meta.highlight}
              placeholder="尚未评注…"
              onBlur={e => { if (e.target.value !== meta.highlight) void updateNoteMetaAction(path, { highlight: e.target.value }) }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
