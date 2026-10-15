import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * Edge-safe auth gate: verifies the NextAuth JWT session cookie directly so
 * mongoose / the DB driver are never bundled into the middleware runtime.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  let token: Awaited<ReturnType<typeof getToken>> = null
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NEXTAUTH_URL
        ? process.env.NEXTAUTH_URL.startsWith('https')
        : process.env.NODE_ENV === 'production',
    })
  } catch {
    token = null
  }

  const isLoggedIn = Boolean(token)
  const isDashboardRoute = path.startsWith('/dashboard')
  const isApiRoute = path.startsWith('/api')
  const isAuthRoute = ['/signin', '/register', '/error', '/forgot-password'].includes(path)

  if (isDashboardRoute && !isApiRoute && !isLoggedIn) {
    const signInUrl = new URL('/signin', request.url)
    if (path !== '/dashboard') signInUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(signInUrl)
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|api/).*)'],
}
