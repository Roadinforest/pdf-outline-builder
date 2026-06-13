import type { ButtonHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant = 'default' | 'outline' | 'destructive' | 'accent'
type ButtonSize = 'default' | 'sm' | 'xs' | 'icon-sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  accent: 'border border-rose-800 bg-rose-800 text-white hover:border-rose-700 hover:bg-rose-700',
  default: 'border border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 hover:border-zinc-800',
  destructive: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  outline: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-11 px-5 text-sm',
  'icon-sm': 'size-9 p-0',
  sm: 'h-9 px-4 text-sm',
  xs: 'h-8 px-3 text-xs',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = 'default', type = 'button', variant = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
})
