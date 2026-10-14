'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 pb-8 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Authentication Error</h1>
          <p className="text-muted-foreground mb-6">
            Something went wrong during authentication. Please try again or contact support if the problem persists.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => window.history.back()} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="ghost" className="gap-2">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}