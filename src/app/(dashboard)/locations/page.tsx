'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Filter, MoreVertical, Warehouse, MapPin, Package, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/helpers'

interface Location {
  _id: string
  name: string
  code: string
  type: string
  address?: { street?: string; city?: string; state?: string; country?: string }
  description?: string
  isActive: boolean
  createdAt: string
  productCount: number
  totalStock: number
  lowStockCount: number
}

const locationTypeLabels: Record<string, string> = {
  warehouse: 'Warehouse',
  store: 'Store',
  distribution_center: 'Distribution Center',
  other: 'Other',
}

const locationTypeColors: Record<string, string> = {
  warehouse: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  store: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  distribution_center: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const fetchLocations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (statusFilter) params.set('isActive', statusFilter === 'active' ? 'true' : 'false')

      const response = await fetch(`/api/locations?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch locations')
      setLocations(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLocations()
  }, [search, typeFilter, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground">Manage your warehouses, stores, and distribution centers</p>
        </div>
        <Link href="/locations/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Location
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <Select
              placeholder="All Types"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: '', label: 'All Types' },
                { value: 'warehouse', label: 'Warehouse' },
                { value: 'store', label: 'Store' },
                { value: 'distribution_center', label: 'Distribution Center' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Select
              placeholder="All Statuses"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      {/* Locations Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Warehouse className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No locations found</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first location.</p>
              <Link href="/locations/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Location
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location._id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link href={`/locations/${location._id}`} className="font-semibold text-lg hover:text-primary transition-colors">
                      {location.name}
                    </Link>
                    <p className="text-muted-foreground text-sm">{location.code}</p>
                  </div>
                  <Badge className={locationTypeColors[location.type] || ''}>
                    {locationTypeLabels[location.type] || location.type}
                  </Badge>
                </div>

                {location.address && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {[location.address.city, location.address.state, location.address.country]
                        .filter(Boolean)
                        .join(', ') || 'No address'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t text-center">
                  <div>
                    <div className="text-sm font-medium">{location.productCount}</div>
                    <div className="text-xs text-muted-foreground">Products</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{location.totalStock}</div>
                    <div className="text-xs text-muted-foreground">Stock</div>
                  </div>
                  <div>
                    {location.lowStockCount > 0 ? (
                      <div className="text-sm font-medium text-orange-500">{location.lowStockCount}</div>
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                    )}
                    <div className="text-xs text-muted-foreground">Low Stock</div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <Badge variant={location.isActive ? 'success' : 'secondary'}>
                    {location.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Link href={`/locations/${location._id}`}>
                    <Button variant="ghost" size="sm">View Details</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}