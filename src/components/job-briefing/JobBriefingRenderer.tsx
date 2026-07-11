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

interface Props {
  content: string
  theme: BriefingTheme
  fontSize: BriefingFontSize
}

type Section =
  | { kind: 'jobs'; title: string; items: JobCardData[] }
  | { kind: 'skills'; title: string; rows: { skill: string; frequency: string }[] }
  | { kind: 'trends'; title: string; lines: string[] }
  | { kind: 'unknown'; lines: string[] }

type JobCardData = {
  source: 'OFFICIAL' | 'TAVILY'
  company: string
  title: string
  city?: string
  salary?: string
  difficulty?: string
  points: string[]
  url?: string
  tacit?: string
}

function parseJobs(lines: string[]): JobCardData[] {
  const jobs: JobCardData[] = []
  let current: JobCardData | null = null

  for (const raw of lines) {
    const line = raw.trim()
    const header = line.match(/^###\s*\[(OFFICIAL|TAVILY)\]\s*(.+?)\s*·\s*(.+)$/)
    if (header) {
      if (current) jobs.push(current)
      current = {
        source: header[1] as 'OFFICIAL' | 'TAVILY',
        company: header[2].trim(),
        title: header[3].trim(),
        points: [],
      }
      continue
    }
    if (!current) continue

    const city = line.match(/^-\s*\*\*城市\*\*:\s*(.+)$/i)
    if (city) { current.city = city[1].trim(); continue }

    const salary = line.match(/^-\s*\*\*薪资\*\*:\s*(.+)$/i)
    if (salary) { current.salary = salary[1].trim(); continue }

    const difficulty = line.match(/^-\s*\*\*难度\*\*:\s*(.+)$/i)
    if (difficulty) { current.difficulty = difficulty[1].trim(); continue }

    const point = line.match(/^-\s*\*\*JD 要点\*\*:\s*(.+)$/i)
    if (point) {
      current.points.push(point[1].trim())
      continue
    }

    const sourceLink = line.match(/^-\s*\*\*来源\*\*:\s*\[原文链接\]\((.+?)\)$/i)
    if (sourceLink) { current.url = sourceLink[1].trim(); continue }

    const plainPoint = line.match(/^-\s*(.+)$/)
    if (plainPoint && !line.includes('来源')) {
      current.points.push(plainPoint[1].trim())
      continue
    }

    const bareLink = line.match(/\[原文链接\]\((https?:\/\/[^\s)]+)\)/i)
    if (bareLink) { current.url = bareLink[1].trim() }

    const tacit = line.match(/^>\s*💭\s*\*\*默会知识\*\*:\s*(.+)$/i)
    if (tacit) { current.tacit = tacit[1].trim() }
  }
  if (current) jobs.push(current)
  return jobs
}

function parseSections(content: string): Section[] {
  const rawSections = content.split(/^## /m).slice(1)
  const sections: Section[] = []

  for (const raw of rawSections) {
    const [titleLine, ...bodyLines] = raw.split('\n')
    const title = titleLine.trim()

    if (title.includes('优先岗位')) {
      sections.push({ kind: 'jobs', title, items: parseJobs(bodyLines) })
    } else if (title.includes('技能雷达')) {
      const rows: { skill: string; frequency: string }[] = []
      for (const line of bodyLines) {
        const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/)
        if (row && !line.includes('---') && !line.includes('技能')) {
          rows.push({ skill: row[1].trim(), frequency: row[2].trim() })
        }
      }
      sections.push({ kind: 'skills', title, rows })
    } else if (title.includes('趋势解读')) {
      sections.push({ kind: 'trends', title, lines: bodyLines })
    } else {
      sections.push({ kind: 'unknown', lines: [titleLine, ...bodyLines] })
    }
  }

  return sections
}

function renderStars(text?: string): React.ReactNode {
  if (!text) return null
  return <span className="tracking-widest text-ember">{text}</span>
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-ember/60 hover:text-ember"
      onClick={(e) => e.stopPropagation()}
    >
      原文链接
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

  return (
    <div
      className={`max-w-3xl mx-auto space-y-8 ${pageClass}`}
      style={{
        fontSize: bodyStyle.size,
        fontWeight: bodyStyle.weight,
      }}
    >
      {sections.map((section, idx) => {
        if (section.kind === 'jobs') {
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.items.map((job, j) => (
                  <article
                    key={j}
                    className={`rounded-lg border p-4 ${cardBg}`}
                    data-testid="job-briefing-card"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${job.source === 'OFFICIAL' ? 'bg-ember/20 text-ember' : 'bg-slate/20 text-parchment/80'}`}>
                        {job.source === 'OFFICIAL' ? '官方' : 'Tavily'}
                      </span>
                      <h3 className="font-semibold">{job.company} · {job.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80 mb-3">
                      {job.city && <span>城市：{job.city}</span>}
                      {job.salary && <span>薪资：{job.salary}</span>}
                      {job.difficulty && <span>难度：{renderStars(job.difficulty)}</span>}
                    </div>
                    {job.points.length > 0 && (
                      <ul className="list-disc list-inside text-sm space-y-1 mb-3 opacity-90">
                        {job.points.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                    {job.url && (
                      <div className="text-sm mb-2">
                        来源：<ExternalLink href={job.url} />
                      </div>
                    )}
                    {job.tacit && (
                      <blockquote className="border-l-2 border-ember pl-3 text-sm italic opacity-80">
                        💭 默会知识：{job.tacit}
                      </blockquote>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        }

        if (section.kind === 'skills') {
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.rows.map((row, i) => {
                  const pct = parseInt(row.frequency.replace('%', ''), 10)
                  const width = Number.isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct))
                  return (
                    <div key={i} data-testid="job-briefing-skill-row">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{row.skill}</span>
                        <span>{row.frequency}</span>
                      </div>
                      <div className={`h-2 rounded-full ${isAcademic ? 'bg-parchment/10' : 'bg-[#d9d3c9]'}`}>
                        <div
                          className="h-full rounded-full bg-ember"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        }

        if (section.kind === 'trends') {
          const text = section.lines.join('\n').trim()
          return (
            <section key={idx}>
              <h2
                className={`text-2xl mb-6 border-b pb-2 ${sectionTitle}`}
                style={{ fontSize: headingStyle.size, fontWeight: headingStyle.weight }}
              >
                {section.title}
              </h2>
              <div className={`pl-4 border-l-4 prose prose-invert max-w-none ${isAcademic ? 'border-ember/60' : 'border-[#d97757]'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text}
                </ReactMarkdown>
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
