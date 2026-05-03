import { useStore } from '@/store'
import type { NewTopic } from '@shared/index'

export function InspirationChip({ topic }: { topic: NewTopic }) {
  const openPreStudy = useStore(s => s.openPreStudy)
  return (
    <button
      onClick={() => openPreStudy({ mode: 'progress', topic: topic.topic })}
      className="block w-full text-left px-4 py-2
                 bg-ink/40 border border-slate/30 rounded
                 hover:border-ember/60 transition-colors group">
      <div className="text-parchment/90">💡 {topic.topic}</div>
      <div className="text-xs text-parchment/50 font-sans mt-1 group-hover:text-ember/70">
        {topic.hook}
      </div>
    </button>
  )
}
