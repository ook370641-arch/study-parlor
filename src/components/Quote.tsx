import { useCallback, useState } from 'react'
import { pickRandomQuote, type Quote as QuoteType } from '@/lib/quotes'

type Props = {
  surface: 'cover' | 'home'
}

export function Quote({ surface }: Props) {
  const [quote, setQuote] = useState<QuoteType | null>(() => pickRandomQuote({ excludeId: null }))

  const refresh = useCallback(() => {
    setQuote(prev => pickRandomQuote({ excludeId: prev?.id ?? null }) ?? prev)
  }, [])

  if (!quote) return null

  const isCover = surface === 'cover'

  return (
    <div className={`group ${isCover ? 'max-w-[240px] text-center sm:text-right' : 'text-center px-8'}`}>
      <div
        data-testid="quote-text"
        className="font-serif italic text-parchment/80 text-sm leading-relaxed line-clamp-3"
        style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
      >
        “{quote.text}”
      </div>
      <div className="mt-1.5 inline-flex items-center gap-2 font-sans text-parchment/55 text-xs">
        <span>— {quote.author}</span>
        <button
          onClick={refresh}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-parchment/40 hover:text-ember transition-opacity"
          aria-label="换一句"
          title="换一句"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
