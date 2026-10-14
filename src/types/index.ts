import { Types } from 'mongoose'
import { UserRole } from '@/models/User'
import { LocationType } from '@/models/Location'
import { UnitOfMeasure } from '@/models/Product'
import { TransferStatus, MovementType } from '@/models/StockTransfer'

export interface JWTPayload {
  userId: string
  email: string
  name: string
  organizationId: string
  organizationSlug: string
  role: UserRole
  locationPermissions: string[]
}

export interface SessionUser {
  id: string
  email: string
  name: string
  image?: string
  organizationId: string
  organizationSlug: string
  role: UserRole
  locationPermissions: string[]
}

export interface LocationWithStats {
  _id: Types.ObjectId
  name: string
  code: string
  type: LocationType
  address?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  isActive: boolean
  productCount: number
  totalStock: number
  lowStockCount: number
}

export interface ProductWithInventory {
  _id: Types.ObjectId
  name: string
  sku: string
  description?: string
  category?: string
  unitOfMeasure: UnitOfMeasure
  barcode?: string
  image?: string
  reorderThreshold: number
  isActive: boolean
  inventory: {
    location: Types.ObjectId
    locationName: string
    locationCode: string
    availableQuantity: number
    reservedQuantity: number
    inTransitQuantity: number
    damagedQuantity: number
  }[]
  totalAvailable: number
  totalReserved: number
  totalInTransit: number
  totalDamaged: number
}

export interface TransferWithDetails {
  _id: Types.ObjectId
  reference: string
  sourceLocation: {
    _id: Types.ObjectId
    name: string
    code: string
  }
  destinationLocation: {
    _id: Types.ObjectId
    name: string
    code: string
  }
  lineItems: {
    product: {
      _id: Types.ObjectId
      name: string
      sku: string
      unitOfMeasure: UnitOfMeasure
    }
    requestedQuantity: number
    approvedQuantity?: number
    dispatchedQuantity?: number
    receivedQuantity?: number
    missingQuantity?: number
    damagedQuantity?: number
    notes?: string
  }[]
  status: TransferStatus
  requester: {
    _id: Types.ObjectId
    name: string
    email: string
  }
  approver?: {
    _id: Types.ObjectId
    name: string
    email: string
  }
  approvedAt?: Date
  approvalNotes?: string
  rejectionReason?: string
  dispatchedBy?: {
    _id: Types.ObjectId
    name: string
  }
  dispatchedAt?: Date
  receivedBy?: {
    _id: Types.ObjectId
    name: string
  }
  receivedAt?: Date
  receiptNotes?: string
  notes?: string
  statusHistory: {
    status: TransferStatus
    changedBy: {
      _id: Types.ObjectId
      name: string
    }
    changedAt: Date
    notes?: string
  }[]
  createdAt: Date
  updatedAt: Date
}

export interface DashboardStats {
  activeProducts: number
  activeLocations: number
  totalAvailableStock: number
  lowStockItems: number
  outOfStockItems: number
  pendingApprovals: number
  inTransitTransfers: number
  completedTransfersThisMonth: number
  recentMovements: number
}

export interface ChartDataPoint {
  label: string
  value: number
}

export interface TransferVolumeData {
  period: string
  created: number
  completed: number
  inTransit: number
}

export interface InventoryByLocationData {
  location: string
  available: number
  reserved: number
  inTransit: number
  damaged: number
}

export interface LowStockProductData {
  product: string
  sku: string
  location: string
  available: number
  threshold: number
}

export interface MovementActivityData {
  date: string
  dispatches: number
  receipts: number
  adjustments: number
  discrepancies: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export type Theme = 'light' | 'dark' | 'system'

export interface UserPreferences {
  theme: Theme
  notifications: {
    email: boolean
    inApp: boolean
  }
  dashboardLayout: 'compact' | 'comfortable'
}