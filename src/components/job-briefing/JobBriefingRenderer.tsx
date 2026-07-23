import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BriefingTheme, BriefingFontSize } from '@shared/index'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
} from '@/lib/briefing-font-size'
import { Quote } from '@/components/Quote'

interface Props {
  content: string
  theme: BriefingTheme
  fontSize: BriefingFontSize
}

type JobEventItem = {
  eventType: string
  company: string
  date: string
  summary: string
  url?: string
}

type JobCardData = {
  badge: string
  company: string
  title: string
  city?: string
  origin?: string
  originIsToday: boolean
  points: string[]
  matchLabel?: string
  matchReason?: string
  url?: string
  prepTip?: string
}

type QuestionItem = {
  question: string
  meta: string
  url?: string
  intent?: string
  prepTip?: string
}

type Section =
  | { kind: 'events'; title: string; items: JobEventItem[] }
  | { kind: 'jobs'; title: string; items: JobCardData[] }
  | { kind: 'questions'; title: string; items: QuestionItem[] }
  | { kind: 'trends'; title: string; lines: string[] }
  | { kind: 'unknown'; lines: string[] }

function parseEvents(lines: string[]): JobEventItem[] {
  const items: JobEventItem[] = []
  let current: JobEventItem | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const head = line.match(/^(?:-\s*)?\*\*\[(.+?)\]\s*(.+?)\*\*\s*(.*)$/)
    if (head) {
      if (current) items.push(current)
      const rest = head[3]
      const parts = rest.split(/[·—]/).map(s => s.trim()).filter(Boolean)
      let date = ''
      const summaryParts: string[] = []
      for (const p of parts) {
        if (!date && /\d{4}[-/年]\d{1,2}/.test(p)) date = p
        else summaryParts.push(p)
      }
      current = {
        eventType: head[1].trim(),
        company: head[2].trim(),
        date,
        summary: summaryParts.join(' · '),
      }
      continue
    }
    const link = line.match(/^\[(?:原文链接|原文)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link && current) current.url = link[1]
  }
  if (current) items.push(current)
  return items
}

function parseJobs(lines: string[]): JobCardData[] {
  const jobs: JobCardData[] = []
  let current: JobCardData | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const header = line.match(/^###\s*\[(.+?)\]\s*(.+?)\s*·\s*(.+)$/)
    if (header) {
      if (current) jobs.push(current)
      current = {
        badge: header[1].trim(),
        company: header[2].trim(),
        title: header[3].trim(),
        originIsToday: false,
        points: [],
      }
      continue
    }
    if (!current) continue

    const field = line.match(/^-\s*\*\*(.+?)\*\*:\s*(.+)$/)
    if (field) {
      const name = field[1]
      const value = field[2]
      if (name.includes('城市')) current.city = value.trim()
      else if (name.includes('源自')) {
        current.origin = value.trim()
        // 两种都视为「来自今日新动态」：显式标注（今日新动态），或事件类型前缀 [秋招开启]/[新岗位] 等
        // （LLM 有时会省略 prompt 要求的（今日新动态）后缀，但事件类型方括号只会出现在新动态溯源中）
        current.originIsToday =
          value.includes('今日新动态') ||
          /\[(秋招开启|新岗位|线下活动|宣讲会|其他)\]/.test(value)
      } else if (name.includes('JD 要点') || name.includes('JD要点')) {
        current.points.push(value.trim())
      } else if (name.includes('为什么适合你') || name.includes('岗位亮点')) {
        current.matchLabel = name.trim()
        current.matchReason = value.trim()
      } else if (name.includes('来源')) {
        const link = value.match(/\((https?:\/\/[^\s)]+)\)/)
        current.url = link ? link[1] : value.trim()
      }
      continue
    }

    const tacit = line.match(/^>\s*💭\s*\*\*(?:准备建议|默会知识)\*\*:\s*(.+)$/)
    if (tacit) current.prepTip = tacit[1].trim()
  }
  if (current) jobs.push(current)
  return jobs
}

function parseQuestions(lines: string[]): QuestionItem[] {
  const items: QuestionItem[] = []
  let current: QuestionItem | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const head = line.match(/^\d+[.、]\s*\*\*(.+?)\*\*\s*[（(](.+)[)）]\s*$/)
    if (head) {
      if (current) items.push(current)
      const meta = head[2]
      const link = meta.match(/\[原文\]\((https?:\/\/[^\s)]+)\)/)
      current = {
        question: head[1].trim(),
        meta: meta.replace(/·?\s*\[原文\]\(https?:\/\/[^\s)]+\)/, '').trim(),
        url: link?.[1],
      }
      continue
    }
    const intent = line.match(/^-\s*考察意图[:：]\s*(.+)$/)
    if (intent && current) { current.intent = intent[1].trim(); continue }
    const tip = line.match(/^-\s*准备要点[:：]\s*(.+)$/)
    if (tip && current) current.prepTip = tip[1].trim()
  }
  if (current) items.push(current)
  return items
}

function parseSections(content: string): Section[] {
  const rawSections = content.split(/^## /m).slice(1)
  const sections: Section[] = []

  for (const raw of rawSections) {
    const [titleLine, ...bodyLines] = raw.split('\n')
    const title = titleLine.trim()

    if (title.includes('今日新动态')) {
      sections.push({ kind: 'events', title, items: parseEvents(bodyLines) })
    } else if (title.includes('最适配的岗位')) {
      sections.push({ kind: 'jobs', title, items: parseJobs(bodyLines) })
    } else if (title.includes('高频考察问题')) {
      sections.push({ kind: 'questions', title, items: parseQuestions(bodyLines) })
    } else if (title.includes('趋势解读')) {
      sections.push({ kind: 'trends', title, lines: bodyLines })
    } else {
      sections.push({ kind: 'unknown', lines: [titleLine, ...bodyLines] })
    }
  }

  return sections
}

function ExternalLink({ href, label = '原文链接' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-ember/60 hover:text-ember"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  )
}

export function JobBriefingRenderer({ content, theme, fontSize }: Props) {
  const isAcademic = theme !== 'newspaper'
  const sections = useMemo(() => parseSections(content), [content])

  const bodyStyle = isAcademic ? ACADEMIC_BODY_STYLES[fontSize] : NEWSPAPER_BODY_STYLES[fontSize]
  const headingStyle = isAcademic ? ACADEMIC_HEADING_STYLES[fontSize] : NEWSPAPER_HEADING_STYLES[fontSize]

  const pageClass = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const cardBg = isAcademic ? 'bg-ink/50 border-slate/30' : 'bg-[#f4f1ec] border-[#d9d3c9]'
  const sectionTitle = isAcademic ? 'text-ember font-serif' : 'text-[#1a1a1a] font-serif'

  const renderSectionTitle = (title: string) => (
    <h2
      className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
      style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
    >
      {isAcademic && (
        <span aria-hidden="true" className="mr-2" style={{ color: '#d97757', fontSize: '0.62em', verticalAlign: '2px' }}>
          ◆
        </span>
      )}
      {title}
    </h2>
  )

  return (
    <div
      className={`max-w-3xl mx-auto space-y-8 ${pageClass}`}
      style={{ fontSize: bodyStyle.size, fontWeight: bodyStyle.weight }}
    >
      {isAcademic && (
        <div className="flex justify-center">
          <Quote surface="briefing" />
        </div>
      )}
      {sections.map((section, idx) => {
        if (section.kind === 'events') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-4">
                  {section.items.map((ev, i) => (
                    <div
                      key={i}
                      data-testid="job-briefing-event"
                      className={`pl-4 border-l-2 ${isAcademic ? 'border-ember/50' : 'border-[#d97757]'}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">{ev.eventType}</span>
                        <span className="font-semibold">{ev.company}</span>
                        {ev.date && <span className="text-sm opacity-60">{ev.date}</span>}
                      </div>
                      {ev.summary && <p className="text-sm opacity-90 mb-1">{ev.summary}</p>}
                      {ev.url && (
                        <div className="text-sm">
                          <ExternalLink href={ev.url} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'jobs') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-4">
                  {section.items.map((job, j) => (
                    <article key={j} className={`rounded-lg border p-4 ${cardBg}`} data-testid="job-briefing-card">
                      <div className="flex items-center gap-2 mb-2">
                        {job.badge.includes('★') ? (
                          <span className="tracking-widest text-ember">{job.badge}</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">{job.badge}</span>
                        )}
                        <h3 className="font-semibold">{job.company} · {job.title}</h3>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                        {job.city && <span>城市：{job.city}</span>}
                      </div>
                      {job.origin && (
                        <div
                          data-testid="job-card-origin"
                          data-today={job.originIsToday ? 'true' : 'false'}
                          className={`text-sm mb-3 ${job.originIsToday ? 'text-ember' : 'opacity-60'}`}
                        >
                          源自：{job.origin}
                        </div>
                      )}
                      {job.points.length > 0 && (
                        <ul className="list-disc list-inside text-sm space-y-1 mb-3 opacity-90">
                          {job.points.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      )}
                      {job.matchReason && (
                        <p className="text-sm mb-3">
                          <span className="font-semibold">{job.matchLabel ?? '为什么适合你'}：</span>
                          {job.matchReason}
                        </p>
                      )}
                      {job.url && (
                        <div className="text-sm mb-2">
                          来源：<ExternalLink href={job.url} label="投递链接" />
                        </div>
                      )}
                      {job.prepTip && (
                        <blockquote className="border-l-2 border-ember pl-3 text-sm italic opacity-80">
                          💭 准备建议：{job.prepTip}
                        </blockquote>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'questions') {
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              {section.items.length === 0 ? (
                <p className="opacity-60">本期暂无</p>
              ) : (
                <div className="space-y-3">
                  {section.items.map((q, i) => (
                    <details key={i} data-testid="job-briefing-question" className={`rounded-lg border p-4 ${cardBg}`}>
                      <summary className="cursor-pointer font-semibold">
                        {i + 1}. {q.question}
                        {q.meta && <span className="ml-2 text-xs opacity-60 font-normal">{q.meta}</span>}
                      </summary>
                      <div className="mt-3 space-y-2 text-sm">
                        {q.intent && <p><span className="font-semibold">考察意图：</span>{q.intent}</p>}
                        {q.prepTip && <p><span className="font-semibold">准备要点：</span>{q.prepTip}</p>}
                        {q.url && <p><ExternalLink href={q.url} label="原文" /></p>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (section.kind === 'trends') {
          const text = section.lines.join('\n').trim()
          return (
            <section key={idx}>
              {renderSectionTitle(section.title)}
              <div className={`pl-4 border-l-4 prose prose-invert max-w-none ${isAcademic ? 'border-ember/60' : 'border-[#d97757]'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            </section>
          )
        }

        return (
          <section key={idx}>
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {section.lines.join('\n')}
              </ReactMarkdown>
            </div>
          </section>
        )
      })}
    </div>
  )
}
