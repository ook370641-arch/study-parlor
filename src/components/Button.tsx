import { ButtonHTMLAttributes, forwardRef } from 'react'
import type { BriefingTheme } from '@shared/index'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  theme?: BriefingTheme
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', theme, className = '', children, ...rest }, ref) => {
    const isAcademic = theme !== 'newspaper'

    if (variant === 'ghost') {
      const ghostCls = isAcademic
        ? 'text-parchment/80 hover:text-parchment'
        : 'text-[#1a1a1a]/70 hover:text-[#1a1a1a]'
      return (
        <button ref={ref}
          className={`px-4 py-2 transition-colors ${ghostCls} ${className}`}
          {...rest}>
          {children}
        </button>
      )
    }

    const primaryCls = isAcademic
      ? `bg-ember text-ink
         shadow-[3px_3px_0_0_#3a5a6a]
         hover:translate-x-[1px] hover:translate-y-[1px]
         hover:shadow-[2px_2px_0_0_#3a5a6a]
         active:translate-x-[3px] active:translate-y-[3px]
         active:shadow-none`
      : `bg-white text-[#1a1a1a] border border-[#1a1a1a]/15
         shadow-[2px_2px_0_0_rgba(0,0,0,0.1)]
         hover:translate-x-[1px] hover:translate-y-[1px]
         hover:shadow-[1px_1px_0_0_rgba(0,0,0,0.1)]
         active:translate-x-[2px] active:translate-y-[2px]
         active:shadow-none`

    return (
      <button ref={ref}
        className={`relative inline-block px-6 py-2 font-sans
                    transition-[transform,box-shadow] duration-100
                    ${primaryCls} ${className}`}
        {...rest}>
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
