import { useState } from 'react'
import { useStore } from '@/store'

interface Props {
  name: string
  content: string
  sourceType: 'digest' | 'anthropic'
  sourcePath: string
  theme?: 'academic' | 'newspaper'
}

export function TransferToWritingButton({ name, content, sourceType, sourcePath, theme = 'academic' }: Props) {
  const transfer = useStore((s) => s.transferArticleToWriting)
  const [busy, setBusy] = useState(false)
  const isAcademic = theme !== 'newspaper'

  return (
    <button
      data-testid="transfer-to-writing"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await transfer({ name, content, sourceType, sourcePath })
        } finally {
          setBusy(false)
        }
      }}
      className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-40 ${
        isAcademic
          ? 'border-parchment/30 text-parchment/70 hover:text-parchment hover:border-ember/60'
          : 'border-[#1a1a1a]/30 text-[#6b5d52] hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60'
      }`}
    >
      {busy ? '转入中…' : '转入写作'}
    </button>
  )
}
