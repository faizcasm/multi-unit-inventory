'use client'

import { useEffect, useState } from 'react'
import { Search, Package, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/helpers'

interface InventoryItem {
  _id: string
  product: { name: string; sku: string; unitOfMeasure: string; reorderThreshold: number; isActive: boolean } | null
  location: { name: string; code: string } | null
  availableQuantity: number
  reservedQuantity: number
  inTransitQuantity: number
  damagedQuantity: number
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])
  const [lowStock, setLowStock] = useState(false)
  const [outOfStock, setOutOfStock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await fetch('/api/locations')
        const data = await response.json()
        if (response.ok) setLocations(data.data || [])
      } catch {}
    }
    fetchLocations()
  }, [])

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (locationId) params.set('locationId', locationId)
      if (lowStock) params.set('lowStock', 'true')
      if (outOfStock) params.set('outOfStock', 'true')

      const response = await fetch(`/api/inventory?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch inventory')
      setInventory(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [search, locationId, lowStock, outOfStock])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Track stock levels across all locations</p>
        </div>
        <Link href="/inventory/adjust">
          <Button className="gap-2">
            Adjust Stock
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by product or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <Select
              placeholder="All Locations"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={[{ value: '', label: 'All Locations' }, ...locations.map((l) => ({ value: l._id, label: `${l.name} (${l.code})` }))]}
            />
            <div className="flex gap-2">
              <Button
                variant={lowStock ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLowStock(!lowStock)}
              >
                Low Stock
              </Button>
              <Button
                variant={outOfStock ? 'default' : 'outline'}
                size="sm"
                onClick={() => setOutOfStock(!outOfStock)}
              >
                Out of Stock
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : inventory.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No inventory found</h3>
              <p className="text-muted-foreground">Try adjusting your filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">In Transit</TableHead>
                  <TableHead className="text-right">Damaged</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.product?.name}</div>
                        <div className="text-xs text-muted-foreground">{item.product?.sku}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.location?.name}</div>
                        <div className="text-xs text-muted-foreground">{item.location?.code}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{item.availableQuantity}</TableCell>
                    <TableCell className="text-right">{item.reservedQuantity}</TableCell>
                    <TableCell className="text-right">{item.inTransitQuantity}</TableCell>
                    <TableCell className="text-right text-destructive">{item.damagedQuantity}</TableCell>
                    <TableCell>
                      {item.availableQuantity === 0 ? (
                        <Badge variant="destructive">Out of Stock</Badge>
                      ) : item.product && item.availableQuantity <= item.product.reorderThreshold && item.product.reorderThreshold > 0 ? (
                        <Badge variant="warning">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}