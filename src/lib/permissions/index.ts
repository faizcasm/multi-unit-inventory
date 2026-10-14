import { UserRole } from '@/models/User'
import { Types } from 'mongoose'

export type Permission =
  | 'organization:read'
  | 'organization:update'
  | 'organization:delete'
  | 'users:read'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'locations:read'
  | 'locations:create'
  | 'locations:update'
  | 'locations:deactivate'
  | 'products:read'
  | 'products:create'
  | 'products:update'
  | 'products:deactivate'
  | 'inventory:read'
  | 'inventory:adjust'
  | 'transfers:read'
  | 'transfers:create'
  | 'transfers:submit'
  | 'transfers:approve'
  | 'transfers:reject'
  | 'transfers:dispatch'
  | 'transfers:receive'
  | 'transfers:cancel'
  | 'reports:read'
  | 'reports:export'
  | 'audit:read'
  | 'settings:read'
  | 'settings:update'

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    'organization:read',
    'organization:update',
    'organization:delete',
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'locations:read',
    'locations:create',
    'locations:update',
    'locations:deactivate',
    'products:read',
    'products:create',
    'products:update',
    'products:deactivate',
    'inventory:read',
    'inventory:adjust',
    'transfers:read',
    'transfers:create',
    'transfers:submit',
    'transfers:approve',
    'transfers:reject',
    'transfers:dispatch',
    'transfers:receive',
    'transfers:cancel',
    'reports:read',
    'reports:export',
    'audit:read',
    'settings:read',
    'settings:update',
  ],
  inventory_manager: [
    'organization:read',
    'users:read',
    'locations:read',
    'locations:create',
    'locations:update',
    'products:read',
    'products:create',
    'products:update',
    'products:deactivate',
    'inventory:read',
    'inventory:adjust',
    'transfers:read',
    'transfers:create',
    'transfers:submit',
    'transfers:dispatch',
    'transfers:receive',
    'transfers:cancel',
    'reports:read',
    'reports:export',
    'audit:read',
    'settings:read',
  ],
  approver: [
    'organization:read',
    'users:read',
    'locations:read',
    'products:read',
    'inventory:read',
    'transfers:read',
    'transfers:approve',
    'transfers:reject',
    'reports:read',
    'audit:read',
    'settings:read',
  ],
  warehouse_staff: [
    'organization:read',
    'locations:read',
    'products:read',
    'inventory:read',
    'transfers:read',
    'transfers:dispatch',
    'transfers:receive',
    'reports:read',
    'settings:read',
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p))
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  return rolePermissions[role] ?? []
}

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