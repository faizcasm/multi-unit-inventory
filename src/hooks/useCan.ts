'use client'

import { useSession } from 'next-auth/react'
import type { UserRole } from '@/models/User'
import { hasPermission, hasAnyPermission } from '@/lib/permissions/matrix'
import type { Permission } from '@/lib/permissions/matrix'

/** The signed-in user's role (undefined while loading or signed out). */
export function useRole(): UserRole | undefined {
  const { data } = useSession()
  const user = data?.user as { role?: UserRole } | undefined
  return user?.role
}

/** True when the signed-in user's role includes the given permission. */
export function useCan(permission: Permission): boolean {
  const role = useRole()
  return role ? hasPermission(role, permission) : false
}

/** True when the signed-in user's role includes at least one of the permissions. */
export function useCanAny(permissions: Permission[]): boolean {
  const role = useRole()
  return role ? hasAnyPermission(role, permissions) : false
}
