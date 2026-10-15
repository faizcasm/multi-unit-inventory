import NextAuth from 'next-auth'
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
import bcrypt from 'bcryptjs'
import { SessionUser } from '@/types'
import { UserRole } from '@/models/User'

interface ExtendedSession {
  user: SessionUser
}

// Simplified type declarations for next-auth 5
declare module 'next-auth' {
  interface Session {
    user: SessionUser
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
})