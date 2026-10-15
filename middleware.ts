import { auth } from './src/lib/auth/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const path = req.nextUrl.pathname
  const isDashboardRoute = path.startsWith('/dashboard')
  const isApiRoute = path.startsWith('/api')
  const isAuthRoute = ['/signin', '/register', '/error'].includes(path)
  const isPublicRoute = path === '/' || path.startsWith('/api/auth')

  if (isDashboardRoute && !isApiRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/signin', req.url))
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}