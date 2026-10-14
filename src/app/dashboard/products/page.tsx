'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Package, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/helpers'

interface Product {
  _id: string
  name: string
  sku: string
  category?: string
  unitOfMeasure: string
  reorderThreshold: number
  isActive: boolean
  totalAvailable: number
  isLowStock: boolean
  isOutOfStock: boolean
  inventory: { locationName: string; availableQuantity: number }[]
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category) params.set('category', category)
      if (statusFilter) params.set('isActive', statusFilter === 'active' ? 'true' : 'false')

      const response = await fetch(`/api/products?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch products')
      setProducts(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [search, category, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <Link href="/products/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <Select
              placeholder="All Categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: '', label: 'All Categories' },
                { value: 'Electronics', label: 'Electronics' },
                { value: 'Clothing', label: 'Clothing' },
                { value: 'Food', label: 'Food' },
                { value: 'Furniture', label: 'Furniture' },
                { value: 'Other', label: 'Other' },
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
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first product.</p>
              <Link href="/products/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Product
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product._id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link href={`/products/${product._id}`} className="font-semibold text-lg hover:text-primary transition-colors">
                      {product.name}
                    </Link>
                    <p className="text-muted-foreground text-sm font-mono">{product.sku}</p>
                  </div>
                  <Badge variant={product.isActive ? 'success' : 'secondary'}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {product.category && (
                  <Badge variant="outline" className="mb-2">{product.category}</Badge>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="text-center">
                    <div className="text-lg font-bold">{product.totalAvailable}</div>
                    <div className="text-xs text-muted-foreground">Available</div>
                  </div>
                  {product.isOutOfStock ? (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Out of Stock
                    </Badge>
                  ) : product.isLowStock ? (
                    <Badge variant="warning" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Low Stock
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      In Stock
                    </Badge>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t">
                  <Link href={`/products/${product._id}`}>
                    <Button variant="ghost" size="sm" className="w-full">View Details</Button>
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
export const dynamic = 'force-dynamic'
