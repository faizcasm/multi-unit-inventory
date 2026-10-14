import { Metadata } from 'next'
import Link from 'next/link'
import { Package } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Authentication',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 bg-primary text-primary-foreground">
        <div className="max-w-md text-center">
          <Link href="/" className="flex items-center justify-center gap-2 font-bold text-2xl mb-8">
            <Package className="h-8 w-8" />
            <span>Ricoz Inventory</span>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-6">
            Manage Inventory Across Multiple Locations
          </h1>
          <p className="text-lg text-primary-foreground/80 mb-8">
            Track stock, manage transfers, handle approvals, and maintain full audit trails
            across all your warehouses, stores, and distribution centers.
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">10k+</div>
              <div className="text-sm opacity-70">Products Tracked</div>
            </div>
            <div>
              <div className="text-3xl font-bold">500+</div>
              <div className="text-sm opacity-70">Locations Managed</div>
            </div>
            <div>
              <div className="text-3xl font-bold">50k+</div>
              <div className="text-sm opacity-70">Transfers Processed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}