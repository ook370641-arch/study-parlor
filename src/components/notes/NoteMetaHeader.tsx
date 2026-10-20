import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'
import { StarRating } from './StarRating'

const toDate = (iso?: string) => (iso ? iso.slice(0, 10) : '')

export function NoteMetaHeader({ entry }: { entry: NoteEntry }) {
  const updateNoteMetaAction = useStore(s => s.updateNoteMetaAction)
  const { path, meta } = entry

  const inputCls = 'bg-transparent outline-none border-none min-w-0 placeholder:text-parchment/25'

  return (
    <div className="px-12 pt-16 pb-4 border-b border-parchment/10 shrink-0">
      <div className="flex items-baseline gap-3 flex-wrap">
        <input
          data-testid="note-meta-title"
          className={`${inputCls} flex-1 text-2xl text-[#f0e2c8]`}
          defaultValue={meta.title}
          placeholder="未命名笔记"
          onBlur={e => { if (e.target.value !== meta.title) void updateNoteMetaAction(path, { title: e.target.value }) }}
        />
        <StarRating
          value={meta.rating}
          size={18}
          onChange={v => void updateNoteMetaAction(path, { rating: v })}
        />
        {meta.source === 'anthropic' && (
          <span className="text-[10px] px-2 leading-4 rounded-full bg-[#d97757]/20 text-[#e09a7e] border border-[#d97757]/45">
            Anthropic
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-3 text-[11.5px]">
        <input
          data-testid="note-meta-url"
          className={`${inputCls} flex-1 text-[#b08a6a]`}
          defaultValue={meta.url}
          placeholder="来源链接"
          onBlur={e => { if (e.target.value !== meta.url) void updateNoteMetaAction(path, { url: e.target.value }) }}
        />
        <span className="text-parchment/35 shrink-0">
          {meta.read_at ? `读完于 ${toDate(meta.read_at)} · ` : ''}收录于 {toDate(meta.collected_at)}
        </span>
      </div>

      <div className="mt-3 flex gap-7">
        <label className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">一句话摘要</div>
          <input
            data-testid="note-meta-summary"
            className={`${inputCls} w-full text-[13.5px] italic text-parchment/85 border-b border-parchment/10 pb-1`}
            defaultValue={meta.summary}
            placeholder="尚未评注…"
            onBlur={e => { if (e.target.value !== meta.summary) void updateNoteMetaAction(path, { summary: e.target.value }) }}
          />
        </label>
        <label className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.2em] text-ember/75 mb-1">核心亮点</div>
          <input
            data-testid="note-meta-highlight"
            className={`${inputCls} w-full text-[13.5px] italic text-parchment/85 border-b border-parchment/10 pb-1`}
            defaultValue={meta.highlight}
            placeholder="尚未评注…"
            onBlur={e => { if (e.target.value !== meta.highlight) void updateNoteMetaAction(path, { highlight: e.target.value }) }}
          />
        </label>
      </div>
    </div>
  )
}
