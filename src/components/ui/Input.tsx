'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/helpers'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: React.ReactNode
  icon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, icon, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-2.5 text-muted-foreground">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              icon && 'pl-10',
              error && 'border-destructive focus-visible:ring-destructive',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <div id={`${inputId}-hint`} className="mt-1.5 text-sm text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }