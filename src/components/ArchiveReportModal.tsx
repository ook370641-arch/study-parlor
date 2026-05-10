import type { ArchiveResult } from '@shared/index'

interface Props {
  result: ArchiveResult
  onClose: () => void
}

export function ArchiveReportModal({ result, onClose }: Props) {
  const isReview = result.mode === 'review'

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
      <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        <div
          className="font-serif text-sm leading-relaxed max-w-2xl mx-auto"
          style={{ color: 'rgba(232, 213, 183, 0.8)' }}
          dangerouslySetInnerHTML={{ __html: formatContent(result.content) }}
        />
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

function formatContent(raw: string): string {
  return raw
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="color:#d97757;margin:1rem 0 0.5rem;border-left:2px solid #d97757;padding-left:0.6rem;font-size:1rem;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h3 style="color:#d97757;margin:1rem 0 0.5rem;border-left:2px solid #d97757;padding-left:0.6rem;font-size:1.05rem;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="color:#d97757;margin:1rem 0 0.5rem;font-size:1.1rem;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e8d5b7;">$1</strong>')
    .replace(/^\* (.+)$/gm, '<li style="padding:0.2rem 0;padding-left:1.2rem;position:relative;list-style:none;"><span style="position:absolute;left:0;color:#8a3a3a;font-size:0.5rem;top:0.5rem;">◆</span>$1</li>')
    .replace(/^- (.+)$/gm, '<li style="padding:0.2rem 0;padding-left:1.2rem;position:relative;list-style:none;"><span style="position:absolute;left:0;color:#8a3a3a;font-size:0.5rem;top:0.5rem;">◆</span>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="padding:0.2rem 0;padding-left:1.2rem;position:relative;list-style:none;"><span style="position:absolute;left:0;color:#8a3a3a;font-size:0.5rem;top:0.5rem;">◆</span>$1</li>')
    .replace(/\n\n/g, '</p><p style="margin-bottom:0.6rem;">')
    .replace(/^(.+)$/gm, '<p style="margin-bottom:0.6rem;">$1</p>')
    .replace(/<p style="margin-bottom:0.6rem;"><h/g, '<h')
    .replace(/<\/h3><\/p>/g, '</h3>')
    .replace(/<p style="margin-bottom:0.6rem;"><li/g, '<li')
    .replace(/<\/li><\/p>/g, '</li>')
}
