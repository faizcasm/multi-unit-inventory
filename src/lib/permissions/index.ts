import { UserRole } from '@/models/User'
import { Types } from 'mongoose'
import {
  rolePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissionsForRole,
} from './matrix'
import type { Permission } from './matrix'

// Permission matrix + role checks live in the client-safe module so that
// 'use client' components can import them without pulling in mongoose.
export { rolePermissions, hasPermission, hasAnyPermission, hasAllPermissions, getPermissionsForRole }
export type { Permission }

export function canAccessLocation(
  userLocationPermissions: Types.ObjectId[],
  locationId: Types.ObjectId
): boolean {
  if (userLocationPermissions.length === 0) return true // No restrictions = all locations
  return userLocationPermissions.some((id) => id.equals(locationId))
}

export function canUserPerformAction(
  userRole: UserRole,
  userLocationPermissions: (Types.ObjectId | string)[],
  permission: Permission,
  locationId?: Types.ObjectId | string
): boolean {
  if (!hasPermission(userRole, permission)) return false
  if (locationId && !canAccessLocation(userLocationPermissions as any, locationId as any)) return false
  return true
}

export function canApproveOwnTransfer(
  separationOfDuties: boolean,
  requesterId: Types.ObjectId | string,
  approverId: Types.ObjectId | string
): boolean {
  requesterId = typeof requesterId === 'string' ? new Types.ObjectId(requesterId) : requesterId
  approverId = typeof approverId === 'string' ? new Types.ObjectId(approverId) : approverId
  if (!separationOfDuties) return true
  return !requesterId.equals(approverId)
}

export const TRANSFER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
}

export function canTransitionTransfer(currentStatus: string, newStatus: string): boolean {
  const allowed = TRANSFER_TRANSITIONS[currentStatus] ?? []
  return allowed.includes(newStatus)
}

export function getRequiredPermissionForTransition(status: string): Permission | null {
  const permissionMap: Record<string, Permission> = {
    PENDING_APPROVAL: 'transfers:submit',
    APPROVED: 'transfers:approve',
    REJECTED: 'transfers:reject',
    IN_TRANSIT: 'transfers:dispatch',
    COMPLETED: 'transfers:receive',
    CANCELLED: 'transfers:cancel',
  }
  return permissionMap[status] ?? null
}