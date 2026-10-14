'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Truck, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/helpers'

interface Transfer {
  _id: string
  reference: string
  sourceLocation: { name: string; code: string }
  destinationLocation: { name: string; code: string }
  status: string
  requester: { name: string }
  lineItems: { product: { name: string; sku: string }; requestedQuantity: number }[]
  createdAt: string
  updatedAt: string
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  IN_TRANSIT: 'info',
  COMPLETED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)

      const response = await fetch(`/api/transfers?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch transfers')
      setTransfers(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransfers()
  }, [statusFilter])

  const filteredTransfers = transfers.filter(
    (t) =>
      !search ||
      t.reference.toLowerCase().includes(search.toLowerCase()) ||
      t.sourceLocation.name.toLowerCase().includes(search.toLowerCase()) ||
      t.destinationLocation.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transfers</h1>
          <p className="text-muted-foreground">Manage inventory transfers between locations</p>
        </div>
        <Link href="/transfers/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by reference or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <Select
              placeholder="All Statuses"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'IN_TRANSIT', label: 'In Transit' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'CANCELLED', label: 'Cancelled' },
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

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No transfers found</h3>
              <p className="text-muted-foreground mb-4">Create your first transfer to get started.</p>
              <Link href="/transfers/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Transfer
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransfers.map((transfer) => (
                  <TableRow key={transfer._id}>
                    <TableCell className="font-mono">{transfer.reference}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{transfer.sourceLocation.name}</div>
                        <div className="text-xs text-muted-foreground">{transfer.sourceLocation.code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{transfer.destinationLocation.name}</div>
                          <div className="text-xs text-muted-foreground">{transfer.destinationLocation.code}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{transfer.lineItems.length}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[transfer.status] || 'secondary'}>
                        {transfer.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(transfer.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Link href={`/transfers/${transfer._id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
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
export const dynamic = 'force-dynamic'
