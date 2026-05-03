import { useStore } from '@/store'
import type { RecCard as RecCardType } from '@shared/index'

export function RecCard({ card, side }: { card: RecCardType | null; side: 'left' | 'right' }) {
  const openPreStudy = useStore(s => s.openPreStudy)

  if (!card) return <div className="panel h-48 flex items-center justify-center text-parchment/30 font-sans text-sm">—</div>

  const isContinue = card.type === 'continue'
  const onClick = () => openPreStudy({
    mode: isContinue ? 'progress' : 'review',
    topic: card.title,
    file_path: card.file_path
  })

  return (
    <button onClick={onClick}
      className="panel h-48 w-full p-6 text-left hover:border-ember/60
                 transition-colors flex flex-col justify-between group">
      <div className="font-sans text-xs text-parchment/50">
        {isContinue ? '继续学习' : '复习'}
      </div>
      <div className="text-xl font-serif">{card.title}</div>
      <div className="font-sans text-xs text-parchment/40 group-hover:text-ember transition-colors">
        {side === 'left' ? '←' : '→'} 进入会话
      </div>
    </button>
  )
}
