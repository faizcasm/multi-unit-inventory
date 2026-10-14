'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Package, Warehouse, Truck, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import api from '@/lib/api'

interface Stats {
  activeProducts: number
  activeLocations: number
  totalAvailableStock: number
  totalReservedStock: number
  totalInTransitStock: number
  totalDamagedStock: number
  lowStockItems: number
  outOfStockItems: number
  pendingApprovals: number
  inTransitTransfers: number
  completedTransfersThisMonth: number
  recentMovements: number
}

interface Charts {
  transferVolume: { period: string; created: number; completed: number; inTransit: number }[]
  inventoryByLocation: { location: string; available: number; reserved: number; inTransit: number; damaged: number }[]
  lowStockProducts: { productName: string; sku: string; available: number }[]
  movementActivity: { date: string; dispatches: number; receipts: number; adjustments: number; discrepancies: number }[]
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to fetch dashboard')
        setStats(data.data.stats)
        setCharts(data.data.charts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your inventory operations</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your inventory operations</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive">{error}</p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your inventory operations</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <TrendingUp className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Products</p>
                <p className="text-2xl font-bold">{stats?.activeProducts ?? 0}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Locations</p>
                <p className="text-2xl font-bold">{stats?.activeLocations ?? 0}</p>
              </div>
              <Warehouse className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Available Stock</p>
                <p className="text-2xl font-bold">{stats?.totalAvailableStock ?? 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Low Stock Items</p>
                <p className="text-2xl font-bold">{stats?.lowStockItems ?? 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
                <p className="text-2xl font-bold">{stats?.pendingApprovals ?? 0}</p>
              </div>
              <Truck className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Transit</p>
                <p className="text-2xl font-bold">{stats?.inTransitTransfers ?? 0}</p>
              </div>
              <Truck className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed This Month</p>
                <p className="text-2xl font-bold">{stats?.completedTransfersThisMonth ?? 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Recent Movements (7d)</p>
                <p className="text-2xl font-bold">{stats?.recentMovements ?? 0}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Reserved Stock</p>
            <p className="text-2xl font-bold">{stats?.totalReservedStock ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">In Transit Stock</p>
            <p className="text-2xl font-bold">{stats?.totalInTransitStock ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Damaged Stock</p>
            <p className="text-2xl font-bold text-destructive">{stats?.totalDamagedStock ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Out of Stock Items</p>
            <p className="text-2xl font-bold text-destructive">{stats?.outOfStockItems ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Transfer Volume Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Transfer Volume Over Time</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {charts?.transferVolume && charts.transferVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={charts.transferVolume}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="period" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#3b82f6" name="Created" strokeWidth={2} />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" name="Completed" strokeWidth={2} />
                  <Line type="monotone" dataKey="inTransit" stroke="#8b5cf6" name="In Transit" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">No transfer data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Inventory by Location */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory by Location</CardTitle>
            <CardDescription>Stock distribution across locations</CardDescription>
          </CardHeader>
          <CardContent>
            {charts?.inventoryByLocation && charts.inventoryByLocation.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={charts.inventoryByLocation}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="location" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="available" fill="#10b981" name="Available" stackId="a" />
                  <Bar dataKey="reserved" fill="#3b82f6" name="Reserved" stackId="a" />
                  <Bar dataKey="inTransit" fill="#8b5cf6" name="In Transit" stackId="a" />
                  <Bar dataKey="damaged" fill="#ef4444" name="Damaged" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">No inventory data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock & Movement Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Products</CardTitle>
            <CardDescription>Products below reorder threshold</CardDescription>
          </CardHeader>
          <CardContent>
            {charts?.lowStockProducts && charts.lowStockProducts.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {charts.lowStockProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{product.productName || product.sku}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <Badge variant={product.available === 0 ? 'destructive' : 'warning'}>
                      {product.available} left
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">No low stock products</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movement Activity</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            {charts?.movementActivity && charts.movementActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={charts.movementActivity}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="dispatches" fill="#8b5cf6" name="Dispatches" />
                  <Bar dataKey="receipts" fill="#10b981" name="Receipts" />
                  <Bar dataKey="adjustments" fill="#3b82f6" name="Adjustments" />
                  <Bar dataKey="discrepancies" fill="#ef4444" name="Discrepancies" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">No movement data yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}