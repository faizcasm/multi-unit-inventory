'use client'

import * as React from 'react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { TooltipProvider } from '@/components/ui/Tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>{children}</TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}