import { ButtonHTMLAttributes, forwardRef } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', className = '', children, ...rest }, ref) => {
    if (variant === 'ghost') {
      return (
        <button ref={ref}
          className={`px-4 py-2 text-parchment/80 hover:text-parchment transition-colors ${className}`}
          {...rest}>
          {children}
        </button>
      )
    }
    return (
      <button ref={ref}
        className={`relative inline-block px-6 py-2 font-sans
                    bg-ember text-ink
                    shadow-[3px_3px_0_0_#3a5a6a]
                    hover:translate-x-[1px] hover:translate-y-[1px]
                    hover:shadow-[2px_2px_0_0_#3a5a6a]
                    active:translate-x-[3px] active:translate-y-[3px]
                    active:shadow-none
                    transition-[transform,box-shadow] duration-100
                    ${className}`}
        {...rest}>
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
