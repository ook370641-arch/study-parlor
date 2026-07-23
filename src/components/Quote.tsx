import { useCallback, useState } from 'react'
import { pickRandomQuote, type Quote as QuoteType } from '@/lib/quotes'

type Props = {
  surface: 'cover' | 'home' | 'study' | 'briefing'
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

  if (surface === 'briefing') {
    return (
      <div className="group max-w-[480px] text-center" data-testid="quote-band">
        <div className="border-t border-b border-ember/35 px-4 py-2.5">
          <div
            data-testid="quote-text"
            className="font-serif italic text-[13px] leading-relaxed text-parchment"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
          >
            “{quote.text}”
          </div>
          <div className="mt-1 inline-flex items-center gap-2 font-sans text-[10px] text-parchment/50">
            <span data-testid="quote-meta">
              — {quote.author}
              {quote.source && (
                <>
                  <span className="mx-1 text-parchment/30">·</span>
                  {quote.source}
                </>
              )}
            </span>
            <button
              onClick={refresh}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-parchment/40 hover:text-ember transition-opacity"
              data-testid="quote-refresh-button"
              title="换一句"
            >
              ↻
            </button>
          </div>
        </div>
      </div>
    )
  }

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
        className="font-serif text-[26px] leading-relaxed text-parchment"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}
      >
        “{quote.text}”
      </div>

      {quote.original && (
        <div
          data-testid="quote-original"
          className="mt-2 font-serif italic text-sm leading-relaxed text-parchment/60"
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
          data-testid="quote-refresh-button"
          title="换一句"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
