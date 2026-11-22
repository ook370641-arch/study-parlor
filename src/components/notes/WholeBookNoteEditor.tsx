import { WritingEditor } from '@/components/writing/WritingEditor'
import { composeWholeBookNoteBody, splitWholeBookNoteBody } from '@/lib/whole-book-note'

export function WholeBookNoteEditor({ filePath, body, bookGuide, onChange }: {
  filePath: string
  body: string
  bookGuide?: string
  onChange: (body: string) => void
}) {
  const { aiBody, original } = splitWholeBookNoteBody(body)
  return (
    <div data-testid="whole-book-note-editor">
      {bookGuide && (
        <section className="mb-6 rounded-lg border border-ember/20 bg-ember/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-parchment/75">
            <strong>全书导读</strong>
            <span className="rounded border border-ember/20 px-1.5 py-0.5 text-[9px] text-ember/75">AI 整理入参</span>
          </div>
          <p className="text-[12px] leading-relaxed text-parchment/60">{bookGuide}</p>
        </section>
      )}
      <div className="mb-3 flex items-center gap-2 text-[10px] text-parchment/40">
        <span>AI 整书综合</span>
        <span className="h-px flex-1 bg-parchment/10" />
      </div>
      <WritingEditor
        key={filePath}
        initial={aiBody}
        onChange={nextAiBody => onChange(composeWholeBookNoteBody(nextAiBody, original))}
        theme="academic"
        filePath={filePath}
      />
      <section className="mt-8 border-t border-parchment/15 pt-5">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium text-parchment/85">原笔迹</h3>
          <span className="rounded border border-ember/20 bg-ember/5 px-1.5 py-0.5 text-[9px] text-ember/75">已有全书笔记 · 每次入参</span>
        </div>
        <textarea
          aria-label="已有全书笔记"
          className="min-h-32 w-full resize-y rounded-lg border border-parchment/15 bg-black/10 p-4 text-[13px] leading-7 text-parchment/80 outline-none transition-colors focus:border-ember/45"
          value={original}
          placeholder="在这里输入你对全书的整体理解；重新整理不会覆盖这一区域。"
          onChange={event => onChange(composeWholeBookNoteBody(aiBody, event.target.value))}
        />
      </section>
    </div>
  )
}
