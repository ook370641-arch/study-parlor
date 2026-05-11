import { useState, useRef, InputHTMLAttributes, forwardRef } from 'react'
import { StarParticle } from './StarParticle'

type Props = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className = '', onFocus, ...rest }, ref) => {
    const [focusSparkle, setFocusSparkle] = useState(false)
    const hasFocused = useRef(false)

    return (
      <div className="relative">
        {focusSparkle && (
          <StarParticle
            count={3}
            origin="edge"
            direction="scatter"
            color="mixed"
            duration={300}
          />
        )}
        <input ref={ref}
          className={`bg-ink/40 border-b border-parchment/30 px-3 py-2
                      text-parchment placeholder:text-parchment/30
                      focus:outline-none focus:border-ember
                      origin-bottom transform-gpu
                      transition-transform duration-200 ease-out
                      focus:scale-y-[1.05] focus:scale-x-[1.02]
                      ${className}`}
          onFocus={(e) => {
            if (!hasFocused.current) {
              hasFocused.current = true
              setFocusSparkle(true)
              setTimeout(() => setFocusSparkle(false), 350)
            }
            onFocus?.(e)
          }}
          {...rest} />
      </div>
    )
  }
)
Input.displayName = 'Input'
