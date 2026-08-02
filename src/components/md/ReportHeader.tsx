import { Frontmatter, DocType } from '@shared/index'

const TYPE_LABELS: Record<DocType, string> = {
  progress: '学习卷宗',
  review: '复检记录',
  fable: '寓言',
  transcript: '原始对话',
  briefing: '夜航简报',
  'external-materials': '外部资料',
  'anthropic-article': 'Anthropic 博客',
  'web-article': '拾贝文章',
  'article-assistant': '旁注记录',
  'job-briefing': '求职简报',
  writing: '写作',
}


const TYPE_BADGE_STYLES: Record<DocType, string> = {
  progress: 'bg-ember text-ink',
  review: 'bg-wine text-parchment',
  fable: 'bg-ink border border-ember/60 text-parchment',
  transcript: 'bg-ink/60 text-parchment/60',
  briefing: 'bg-slate text-parchment',
  'external-materials': 'bg-ink/40 border border-parchment/20 text-parchment/70',
  'anthropic-article': 'bg-ember/80 text-ink',
  'web-article': 'bg-ember/80 text-ink',
  'article-assistant': 'bg-ink/60 text-parchment/60',
  'job-briefing': 'bg-slate text-parchment',
  writing: 'bg-ember text-ink',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  high: '强',
  mid: '中',
  low: '弱',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

function buildMetadata(frontmatter: Frontmatter): string | null {
  const type = frontmatter.type ?? 'progress'
  const parts: string[] = []

  if (type === 'progress' || type === 'transcript') {
    const sn = frontmatter.session_number ?? 1
    parts.push(`档案编号 ${sn}`)
  }

  if (type === 'review') {
    const rc = frontmatter.review_count ?? 1
    parts.push(`第${rc}次被取出翻阅`)
  }

  const date = frontmatter.last_reviewed ?? frontmatter.last_studied ?? frontmatter.created
  if (date) {
    parts.push(formatDate(date))
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

interface Props {
  frontmatter: Frontmatter
}

export function ReportHeader({ frontmatter }: Props) {
  const type = frontmatter.type ?? 'progress'
  const metadata = buildMetadata(frontmatter)
  const showDifficulty = type === 'progress'
  const showSummary = type === 'progress' && frontmatter.progress_summary
  const showSourceTopic = type === 'fable'

  return (
    <div className="mb-6">
      {/* Top row: badges left, metadata right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Type badge */}
          {type !== 'transcript' && (
            <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${TYPE_BADGE_STYLES[type]}`}>
              {TYPE_LABELS[type]}
            </span>
          )}

          {/* Difficulty badge */}
          {showDifficulty && (
            <span className="inline-block px-2 py-0.5 text-xs rounded-full border border-parchment/15 text-parchment/60">
              {DIFFICULTY_LABELS[frontmatter.difficulty] ?? frontmatter.difficulty}
            </span>
          )}
        </div>

        {/* Metadata */}
        {metadata && (
          <span className="text-sm text-parchment/50 whitespace-nowrap">
            {metadata}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="mt-3 text-2xl font-serif font-semibold text-parchment">
        {frontmatter.title}
      </h1>

      {/* Description */}
      {frontmatter.description && (
        <p className="mt-1.5 text-base text-parchment/60">
          {frontmatter.description}
        </p>
      )}

      {/* Tags */}
      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div className="mt-3" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {frontmatter.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 text-xs rounded border border-parchment/10 text-parchment/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Separator + Summary (progress/research) */}
      {showSummary && (
        <>
          <div className="mt-4 border-t border-parchment/10" />
          <p className="mt-3 text-sm italic text-parchment/50">
            {frontmatter.progress_summary}
          </p>
        </>
      )}

      {/* Source topic (fable) */}
      {showSourceTopic && (
        <p className="mt-3 text-sm text-parchment/50">
          来源主题：{frontmatter.title}
        </p>
      )}
    </div>
  )
}
