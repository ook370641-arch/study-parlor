import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BackToCover } from '@/components/BackToCover'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { Button } from '@/components/Button'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y} 年 ${m} 月 ${d} 日`
}

export function Briefing() {
  const { result, loading, error } = useStore(s => s.briefing)
  const generateBriefing = useStore(s => s.generateBriefing)
  const [showSources, setShowSources] = useState(false)

  const today = formatBriefingDate(new Date())

  useEffect(() => {
    if (!result && !loading && !error) {
      generateBriefing(today)
    }
  }, [result, loading, error, today, generateBriefing])

  const parsed = result ? parseBriefingMarkdown(result.content) : null

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <SurfaceBackground surface="briefing" />

      <header className="relative z-[5] flex items-center justify-between px-8 py-4 bg-ink/70 backdrop-blur-md border-b border-slate/40">
        <BackToCover />
        <div className="text-center">
          <h1 className="text-xl font-serif">夜航简报</h1>
          {result && (
            <div className="text-xs text-parchment/50 font-sans">
              {formatDisplayDate(result.date)} · AI 行业日报
            </div>
          )}
        </div>
        <SwapPaintingButton surface="briefing" />
      </header>

      <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl w-full mx-auto">
        {loading && <BriefingSkeleton />}

        {error && (
          <div className="bg-wine/20 border border-wine rounded-md p-6 text-center space-y-4">
            <p className="text-parchment/80 font-sans">
              {error === 'FEED_EMPTY' ? '今日海面平静，暂无新信号。' : `简报生成失败：${error}`}
            </p>
            <Button onClick={() => generateBriefing(today)}>重试</Button>
          </div>
        )}

        {parsed && (
          <div className="space-y-6">
            <div className="timeline relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-parchment/15" />
              {parsed.sections.map((section, i) => (
                <div key={i} className="relative mb-6">
                  <div className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full bg-ember" />
                  <h2 className="text-sm font-bold text-ember mb-2 font-sans">{section.title}</h2>
                  <div className="bg-ink/60 backdrop-blur-sm border border-slate/30 rounded-md p-4 text-sm leading-relaxed text-parchment/85">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            {parsed.sources.length > 0 && (
              <div className="border-t border-slate/30 pt-4">
                <button
                  onClick={() => setShowSources(s => !s)}
                  className="w-full text-left text-xs text-slate hover:text-parchment transition-colors flex items-center justify-between py-2"
                >
                  <span>▼ 原始来源</span>
                  <span>{showSources ? '收起' : '展开'}</span>
                </button>
                {showSources && (
                  <div className="mt-2 space-y-3 bg-ink/60 backdrop-blur-sm border border-slate/30 rounded-md p-4">
                    {parsed.sources.map((group, i) => (
                      <div key={i}>
                        <h3 className="text-xs font-bold text-parchment/70 mb-1">{group.title}</h3>
                        <ul className="text-xs text-parchment/50 space-y-1">
                          {group.items.map((item, j) => (
                            <li key={j}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
