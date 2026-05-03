import { InputHTMLAttributes, forwardRef } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref}
      className={`bg-ink/40 border-b border-parchment/30 px-3 py-2
                  text-parchment placeholder:text-parchment/30
                  focus:outline-none focus:border-ember
                  origin-bottom transform-gpu
                  transition-transform duration-200 ease-out
                  focus:scale-y-[1.05] focus:scale-x-[1.02]
                  ${className}`}
      {...rest} />
  )
)
Input.displayName = 'Input'
