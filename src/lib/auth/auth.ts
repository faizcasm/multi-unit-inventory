import NextAuth from 'next-auth'
import type { Session } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { connectDB } from '@/lib/db/mongodb'
// Side-effect imports: register every schema before populate() runs.
// (A plain `import { User }` gets tree-shaken when unused, which leaves
// mongoose without a registered model and breaks authorize().)
import '@/models/User'
import '@/models/Membership'
import '@/models/Organization'
import { User } from '@/models/User'
import { Membership } from '@/models/Membership'
import { z } from 'zod'
import { SessionUser } from '@/types'
import { UserRole } from '@/models/User'
import { getCachedMembership } from '@/lib/auth/membership-cache'

// Simplified type declarations for next-auth 5
declare module 'next-auth' {
  interface Session {
    user: SessionUser
  }
}

const nextAuth = NextAuth({
  // Required behind proxies / custom hosts: Auth.js only trusts localhost in
  // dev, and Vercel via its own env. Explicitly trust the configured host.
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }).safeParse(credentials)

        if (!parsed.success) return null

        await connectDB()

        const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select('+passwordHash')
        if (!user || !user.isActive) return null

        const isValid = await user.comparePassword(parsed.data.password)
        if (!isValid) return null

        // Get active membership
        const membership = await Membership.findOne({ user: user._id, isActive: true }).populate('organization')
        if (!membership || !(membership.organization as any).isActive) return null

        user.lastLoginAt = new Date()
        await user.save()

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.avatar,
          role: user.role,
          organizationId: membership.organization._id.toString(),
          organizationSlug: (membership.organization as any).slug,
          locationPermissions: membership.locationPermissions.map((id) => id.toString()),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any
        const t = token as any
        t.userId = u.id
        t.organizationId = u.organizationId
        t.organizationSlug = u.organizationSlug
        t.role = u.role
        t.locationPermissions = u.locationPermissions
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        const t = token as any
        session.user = {
          id: t.userId,
          email: (token.email as string) || '',
          name: (token.name as string) || '',
          image: (token.image as string) || undefined,
          organizationId: t.organizationId,
          organizationSlug: t.organizationSlug,
          role: t.role,
          locationPermissions: t.locationPermissions,
        } as any
      }
      return session
    },
  },
  pages: {
    signIn: '/signin',
    error: '/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days — short-lived sessions for a production app
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export const { handlers, signIn, signOut } = nextAuth

/**
 * Session accessor with membership revalidation.
 *
 * The JWT still carries organizationId/role/locationPermissions from login,
 * but every call re-checks the user's active membership (cached for 60s) so:
 * - removed members lose API access within a minute instead of the JWT's
 *   full lifetime, and
 * - role/locationPermission changes take effect without a re-login.
 *
 * Failure modes:
 * - No active membership → returns null (callers already treat a null session
 *   as 401).
 * - DB error → FAILS OPEN (returns the JWT session as-is) so a transient
 *   Atlas blip never logs every user out.
 */
export async function auth(): Promise<Session | null> {
  const session = (await nextAuth.auth()) as Session | null
  if (!session?.user?.id) return session

  try {
    const membership = await getCachedMembership(session.user.id)
    if (!membership) return null

    session.user.organizationId = membership.organizationId
    session.user.role = membership.role as UserRole
    session.user.locationPermissions = membership.locationPermissions
    return session
  } catch (error) {
    console.error('Membership revalidation failed; serving session without revalidation:', error)
    return session
  }
}