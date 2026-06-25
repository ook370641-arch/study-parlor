import { useCallback, useState } from 'react'
import { pickRandomQuote, type Quote as QuoteType } from '@/lib/quotes'

type Props = {
  surface: 'cover' | 'home' | 'study'
}

export function Quote({ surface }: Props) {
  const [quote, setQuote] = useState<QuoteType | null>(() =>
    pickRandomQuote({ excludeId: null })
  )

  const refresh = useCallback(() => {
    setQuote(prev => pickRandomQuote({ excludeId: prev?.id ?? null }) ?? prev)
  }, [])

  if (!quote) return null

  const isCover = surface === 'cover'

  return (
    <div
      className={`group ${
        isCover
          ? 'max-w-[420px] text-right'
          : 'max-w-3xl mx-auto text-center'
      }`}
    >
      <div
        data-testid="quote-text"
        className="font-serif text-[26px] leading-relaxed text-parchment line-clamp-3"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}
      >
        “{quote.text}”
      </div>

      {quote.original && (
        <div
          data-testid="quote-original"
          className="mt-2 font-serif italic text-sm leading-relaxed text-parchment/60 line-clamp-2"
          style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
        >
          {quote.original}
        </div>
      )}

      <div className="mt-3 inline-flex items-center gap-2 font-sans text-sm text-parchment/80">
        <span data-testid="quote-meta">
          — {quote.author}
          {quote.source && (
            <>
              <span className="mx-1.5 text-parchment/40">·</span>
              {quote.source}
            </>
          )}
        </span>
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
