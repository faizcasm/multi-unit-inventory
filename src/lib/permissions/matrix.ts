// Client-safe permission matrix.
// This module must stay free of runtime imports (no mongoose, no models) so it can
// be imported from 'use client' components. Model imports must be type-only.
import type { UserRole } from '@/models/User'

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
  | 'suppliers:read'
  | 'suppliers:create'
  | 'suppliers:update'
  | 'suppliers:deactivate'
  | 'purchase_orders:read'
  | 'purchase_orders:create'
  | 'purchase_orders:update'
  | 'purchase_orders:receive'
  | 'purchase_orders:cancel'
  | 'stocktakes:read'
  | 'stocktakes:create'
  | 'stocktakes:update'
  | 'stocktakes:count'
  | 'stocktakes:post'
  | 'integrations:read'
  | 'integrations:manage'

export const rolePermissions: Record<UserRole, Permission[]> = {
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
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'suppliers:deactivate',
    'purchase_orders:read',
    'purchase_orders:create',
    'purchase_orders:update',
    'purchase_orders:receive',
    'purchase_orders:cancel',
    'stocktakes:read',
    'stocktakes:create',
    'stocktakes:update',
    'stocktakes:count',
    'stocktakes:post',
    'integrations:read',
    'integrations:manage',
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
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'suppliers:deactivate',
    'purchase_orders:read',
    'purchase_orders:create',
    'purchase_orders:update',
    'purchase_orders:receive',
    'purchase_orders:cancel',
    'stocktakes:read',
    'stocktakes:create',
    'stocktakes:update',
    'stocktakes:count',
    'stocktakes:post',
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
    'suppliers:read',
    'purchase_orders:read',
    'stocktakes:read',
    'stocktakes:count',
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
    'purchase_orders:read',
    'purchase_orders:receive',
    'stocktakes:read',
    'stocktakes:count',
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
