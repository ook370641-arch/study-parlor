import type { ArchiveResult } from '@shared/index'
import { MarkdownRenderer } from './md/MarkdownRenderer'

interface Props {
  result: ArchiveResult
  onClose: () => void
}

export function ArchiveReportModal({ result, onClose }: Props) {
  const isReview = result.mode === 'review'
  const fileName = isReview ? '复习报告.md' : '学习报告.md'
  // Reconstruct full content with synthetic frontmatter so MarkdownRenderer
  // can render the ReportHeader and strip it consistently with SessionViewer.
  const fullContent = `---\ntitle: "${result.title}"\ntype: ${result.mode}\n---\n\n${result.content}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
         style={{ backgroundColor: '#1a120f' }}>
      {/* Header */}
      <div className="flex justify-between items-start px-6 py-4 border-b shrink-0"
           style={{ borderColor: 'rgba(232, 213, 183, 0.13)' }}>
        <div>
          <div className="font-serif text-lg tracking-wide" style={{ color: '#e8d5b7' }}>
            《{result.title}》— {isReview ? '复习报告' : '学习报告'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-2xl leading-none transition-colors hover:opacity-100"
          style={{ color: 'rgba(232, 213, 183, 0.4)' }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <MarkdownRenderer content={fullContent} fileName={fileName} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t flex justify-center shrink-0"
           style={{ borderColor: 'rgba(232, 213, 183, 0.13)' }}>
        <button
          onClick={onClose}
          className="font-serif font-semibold text-sm tracking-widest px-8 py-2.5 transition-all hover:shadow-lg"
          style={{
            backgroundColor: '#d97757',
            color: '#1a120f',
            borderRadius: '2px'
          }}
        >
          本次学习结束
        </button>
      </div>
    </div>
  )
}
