import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { connectDB } from '@/lib/db/mongodb'
import { Location } from '@/models/Location'
import { Types } from 'mongoose'
import Link from 'next/link'
import { Package, Warehouse, MapPin, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface LocationPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  await connectDB()
  const location = await Location.findById(params.id).lean() as any as any
  if (!location) return { title: 'Location Not Found' }
  return { title: `${location?.name} | Location` }
}

export default async function LocationDetailPage({ params }: LocationPageProps) {
  await connectDB()

  if (!Types.ObjectId.isValid(params.id)) {
    notFound()
  }

  const location = await Location.findById(params.id)
    .populate('organization', 'name')
    .lean() as any as any

  if (!location) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/locations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{location.name}</h1>
          <p className="text-muted-foreground">{location.code} • {location.type}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Location Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium text-sm text-muted-foreground mb-1">Type</h4>
              <p className="capitalize">{location.type.replace('_', ' ')}</p>
            </div>
            <div>
              <h4 className="font-medium text-sm text-muted-foreground mb-1">Status</h4>
              <Badge variant={location.isActive ? 'success' : 'secondary'}>
                {location.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {location.address && (
              <div className="md:col-span-2">
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Address</h4>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <p>
                    {location.address.street && <span>{location.address.street}<br /></span>}
                    {location.address.city && location.address.state && (
                      <span>{location.address.city}, {location.address.state}</span>
                    )}
                    {location.address.postalCode && <span> {location.address.postalCode}</span>}
                    {location.address.country && <span><br />{location.address.country}</span>}
                  </p>
                </div>
              </div>
            )}
            {location.description && (
              <div className="md:col-span-2">
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                <p>{location.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Link href={`/dashboard/locations/${params.id}/inventory`}>
          <Button variant="outline" className="gap-2">
            <Package className="h-4 w-4" />
            View Inventory
          </Button>
        </Link>
        <Link href={`/dashboard/locations/${params.id}/transfers`}>
          <Button variant="outline" className="gap-2">
            <Warehouse className="h-4 w-4" />
            View Transfers
          </Button>
        </Link>
      </div>
    </div>
  )
}
export const dynamic = 'force-dynamic'
