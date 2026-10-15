'use client'

import Link from 'next/link'
import { Plus, Truck } from 'lucide-react'
import { useCan } from '@/hooks/useCan'

/**
 * "New transfer" call-to-action, hidden unless the signed-in user
 * holds the `transfers:create` permission. Safe to embed from server
 * pages too (this file is a client leaf; no props are serialized).
 */
export function NewTransferButton() {
  const canCreate = useCan('transfers:create')
  if (!canCreate) return null
  return (
    <Link href="/dashboard/transfers/new" className="button button-primary">
      <Plus size={16} /> New transfer
    </Link>
  )
}

/** Same action with the truck icon + smaller size (location detail page). */
export function NewTransferTruckButton() {
  const canCreate = useCan('transfers:create')
  if (!canCreate) return null
  return (
    <Link href="/dashboard/transfers/new" className="button button-primary">
      <Truck size={15} /> New transfer
    </Link>
  )
}
