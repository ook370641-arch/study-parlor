import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { GuideCompass } from '@/components/article-assistant/GuideCompass'
import { canGenerateAiNote } from '@/lib/note-ai'
import type { AiNoteStage, BriefingTheme, GuideProgress, NoteEntry } from '@shared/index'

const STAGE_LABEL: Record<AiNoteStage, string> = {
  reading: '读取材料',
  round1: '第一轮检索',
  round2: '第二轮检索',
  curating: '资料策展',
  writing: '写作中',
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      <path d="m5 2 .7 1.8L7.5 4.5l-1.8.7L5 7l-.7-1.8-1.8-.7 1.8-.7L5 2Z" />
    </svg>
  )
}

export function AiNoteGenerator({ entry, originalBody, theme = 'academic' }: { entry: NoteEntry; originalBody: string; theme?: BriefingTheme }) {
  const [originalOpen, setOriginalOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(true)
  const generation = useStore(state => state.aiNoteGenerations[entry.path] ?? null)
  const generate = useStore(state => state.generateAiNote)
  const apply = useStore(state => state.applyAiNote)
  const cancel = useStore(state => state.cancelAiNote)
  if (!canGenerateAiNote(entry)) return null

  const candidate = generation?.candidate ?? null
  const buttonTone = theme === 'newspaper' ? 'text-[#6b5d52] hover:bg-[#1a1a1a]/10 hover:text-[#8a3a3a]' : 'text-parchment/45 hover:bg-parchment/10 hover:text-ember'
  const stageTone = theme === 'newspaper' ? 'text-[#6b5d52]' : 'text-parchment/40'
  const guideProgress: GuideProgress = generation?.stage === 'writing'
    ? { stage: 'writing', chars: 0, entriesDone: 0, entriesTotal: 1 }
    : generation && generation.stage !== 'reading'
      ? { stage: 'searching', done: 0, total: 1 }
      : { stage: 'planning' }
  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="note-ai-generate"
          title={generation && !candidate ? '查看生成进度' : '生成笔记'}
          aria-label={generation && !candidate ? '查看生成进度' : '生成笔记'}
          disabled={!!candidate || generation?.applying}
          onClick={() => {
            if (generation && !candidate) return setProgressOpen(true)
            setOriginalOpen(false)
            setProgressOpen(true)
            void generate(entry.path)
          }}
          className={`flex h-9 w-9 items-center justify-center rounded ${buttonTone} disabled:cursor-wait disabled:opacity-70`}
        >
          {generation && !candidate ? (
            <svg data-testid="note-ai-spinner" className="animate-spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="8" strokeOpacity=".25" />
              <path d="M20 12a8 8 0 0 0-8-8" />
            </svg>
          ) : <SparklesIcon />}
        </button>
        {generation && !candidate && <span data-testid="note-ai-stage" className={`whitespace-nowrap text-xs ${stageTone}`}>{STAGE_LABEL[generation.stage]}</span>}
      </div>
      {generation && !candidate && progressOpen && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-6" data-testid="note-ai-generating">
          <div role="dialog" aria-modal="true" aria-label="AI 笔记生成中" className="relative w-full max-w-sm overflow-hidden rounded-lg border border-parchment/20 bg-ink text-parchment shadow-2xl">
            <button type="button" data-testid="note-ai-generating-close" aria-label="收起生成进度" onClick={() => setProgressOpen(false)} className="absolute right-3 top-3 z-10 rounded px-2 text-parchment/55 hover:bg-parchment/10 hover:text-parchment">✕</button>
            <div className="px-6 pb-5 pt-3 text-center">
              <div className="mx-auto w-44"><GuideCompass progress={guideProgress} theme={theme === 'newspaper' ? 'newspaper' : 'academic'} height="auto" /></div>
              <h3 className="font-serif text-lg">正在生成笔记</h3>
              <p className="mt-2 text-[12px] text-parchment/55">{STAGE_LABEL[generation.stage]}，可查看原笔迹，生成会继续进行</p>
            </div>
            <div className="flex justify-center border-t border-parchment/10 px-5 py-4">
              <button type="button" data-testid="note-ai-view-original" onClick={() => setOriginalOpen(true)} className="rounded border border-parchment/20 px-4 py-1.5 text-[12px] text-parchment/75 hover:bg-parchment/10 hover:text-parchment">查看原笔迹</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {generation && originalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-6" data-testid="note-ai-original">
          <div role="dialog" aria-modal="true" aria-label="原笔迹" className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-parchment/20 bg-ink text-parchment shadow-2xl">
            <div className="flex items-center border-b border-parchment/10 px-5 py-4">
              <h3 className="font-serif text-lg">原笔迹</h3>
              <button type="button" data-testid="note-ai-original-close" aria-label="关闭原笔迹" onClick={() => setOriginalOpen(false)} className="ml-auto px-2 text-parchment/60 hover:text-parchment">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[13px] leading-7">
              <MarkdownRenderer content={originalBody} fileName={`${entry.meta.title}.md`} hideHeader />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {candidate && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-6" data-testid="note-ai-preview">
          <div role="dialog" aria-modal="true" aria-label="AI 笔记预览" className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-parchment/20 bg-ink text-parchment shadow-2xl">
            <div className="border-b border-parchment/10 px-5 py-4">
              <h3 className="font-serif text-lg">生成笔记预览</h3>
              <p className="mt-1 text-[11px] text-parchment/50">确认后写入当前笔记，原笔迹将完整保留在末尾。</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-[13px] leading-7">
              <MarkdownRenderer content={candidate.body} fileName={`${entry.meta.title}.md`} hideHeader />
            </div>
            <div className="flex justify-end gap-3 border-t border-parchment/10 px-5 py-4">
              <button type="button" data-testid="note-ai-cancel" disabled={generation?.applying} onClick={() => void cancel(entry.path)} className="rounded px-3 py-1.5 text-[12px] text-parchment/60 hover:text-parchment disabled:opacity-40">取消</button>
              <button type="button" data-testid="note-ai-apply" disabled={generation?.applying} onClick={() => void apply(entry.path)} className="rounded bg-ember px-4 py-1.5 text-[12px] text-white hover:bg-ember/90 disabled:opacity-50">{generation?.applying ? '写入中…' : '写入笔记'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
