import { auth } from './src/lib/auth/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isDashboardRoute = req.nextUrl.pathname.startsWith('/dashboard')
  const isApiRoute = req.nextUrl.pathname.startsWith('/api')
  const isAuthRoute = req.nextUrl.pathname.startsWith('/auth')
  const isPublicRoute = req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/api/auth')

  if (isDashboardRoute && !isApiRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}