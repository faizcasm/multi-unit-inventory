'use client'

import * as React from 'react'
import Link from 'next/link'
import { Package, Warehouse, Truck, CheckCircle, BarChart3, Shield, ArrowRight, Users, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const features = [
  {
    icon: Warehouse,
    title: 'Multi-Location Stock',
    description: 'Track inventory across unlimited warehouses, stores, and distribution centers with real-time stock levels.',
  },
  {
    icon: Package,
    title: 'Product Catalog',
    description: 'Manage products with SKUs, categories, barcodes, reorder thresholds, and inventory across all locations.',
  },
  {
    icon: Truck,
    title: 'Transfer Workflows',
    description: 'Complete transfer lifecycle: draft → approval → dispatch → receipt with discrepancy handling.',
  },
  {
    icon: CheckCircle,
    title: 'Approval System',
    description: 'Role-based approvals with separation of duties, audit trails, and configurable policies.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description: 'Dashboard with stock levels, low-stock alerts, transfer volumes, and movement history charts.',
  },
  {
    icon: Shield,
    title: 'Secure & Auditable',
    description: 'Organization isolation, role-based access, immutable movement ledger, and full audit history.',
  },
]

const workflowSteps = [
  { number: '01', title: 'Create Transfer', description: 'Select source/destination, add products with quantities, save as draft or submit for approval.' },
  { number: '02', title: 'Review & Approve', description: 'Approvers validate stock availability, quantities, and authorize or reject with reasons.' },
  { number: '03', title: 'Dispatch Stock', description: 'Warehouse staff confirm quantities, deduct source stock, create in-transit records.' },
  { number: '04', title: 'Receive & Reconcile', description: 'Record received, missing, and damaged quantities. Auto-complete when all items accounted for.' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      {/* Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Package className="h-6 w-6 text-primary" />
            <span>Ricoz Inventory</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#workflow" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="/signin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
          <div className="flex items-center gap-4 md:hidden">
            <ThemeToggle />
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              New: Multi-location transfer workflows now available
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Manage Inventory Across{' '}
              <span className="text-primary">Multiple Locations</span>{' '}
              Effortlessly
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              A complete inventory transfer hub for businesses with multiple warehouses, stores, and distribution centers.
              Track stock, manage transfers, handle approvals, and maintain full audit trails.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/signin">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Sign In
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>

          {/* Product Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 h-32 bottom-0 top-auto" />
            <div className="rounded-xl border shadow-xl overflow-hidden bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-sm text-muted-foreground font-mono">inventory-hub.app/dashboard</div>
              </div>
              <div className="p-6 h-[350px] overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Dashboard Overview</h3>
                    <span className="text-xs text-muted-foreground">Real-time data</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Active Products', value: '1,234', icon: Package, color: 'text-blue-500' },
                      { label: 'Locations', value: '12', icon: Warehouse, color: 'text-green-500' },
                      { label: 'In Transit', value: '23', icon: Truck, color: 'text-purple-500' },
                      { label: 'Low Stock', value: '7', icon: CheckCircle, color: 'text-orange-500' },
                    ].map((stat) => (
                      <div key={stat.label} className="p-4 rounded-lg bg-muted/50 border">
                        <div className="flex items-center justify-between mb-2">
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </div>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Recent Transfers</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {[
                        { ref: 'TXN-001234', from: 'Main Warehouse', to: 'Downtown Store', status: 'IN_TRANSIT', items: 5 },
                        { ref: 'TXN-001233', from: 'Distribution Center', to: 'North Warehouse', status: 'COMPLETED', items: 12 },
                        { ref: 'TXN-001232', from: 'East Store', to: 'West Store', status: 'PENDING_APPROVAL', items: 3 },
                        { ref: 'TXN-001231', from: 'Main Warehouse', to: 'South Store', status: 'COMPLETED', items: 8 },
                      ].map((transfer) => (
                        <div key={transfer.ref} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border text-sm">
                          <div>
                            <div className="font-medium">{transfer.ref}</div>
                            <div className="text-xs text-muted-foreground">{transfer.from} → {transfer.to} • {transfer.items} items</div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            transfer.status === 'IN_TRANSIT' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                            transfer.status === 'COMPLETED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          }`}>
                            {transfer.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 bg-muted/30">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Everything You Need</h2>
            <p className="text-lg text-muted-foreground">Comprehensive features for multi-location inventory management</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="h-full transition-shadow hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-20 md:py-32">
        <div className="container px-4">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Simple 4-Step Workflow</h2>
            <p className="text-lg text-muted-foreground">From request to completion with full visibility</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="relative">
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {step.number}
                </div>
                <div className="pt-16 pb-6 px-4">
                  <h3 className="text-lg font-semibold mb-2 text-center">{step.title}</h3>
                  <p className="text-muted-foreground text-sm text-center">{step.description}</p>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-[50%] w-full h-0.5 bg-gradient-to-r from-primary/20 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Ready to Streamline Your Inventory?</h2>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join businesses already using Ricoz Inventory to manage multi-location stock with confidence.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="gap-2">
              Create Your Organization
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 font-bold text-lg mb-4">
                <Package className="h-6 w-6 text-primary" />
                <span>Ricoz Inventory</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Multi-location inventory transfer management for modern businesses.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="#workflow" className="hover:text-foreground transition-colors">How It Works</Link></li>
                <li><Link href="/dashboard/reports" className="hover:text-foreground transition-colors">Reports</Link></li>
                <li><Link href="/dashboard/settings" className="hover:text-foreground transition-colors">Settings</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link></li>
                <li><Link href="/api" className="hover:text-foreground transition-colors">API Reference</Link></li>
                <li><Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link></li>
                <li><Link href="/support" className="hover:text-foreground transition-colors">Support</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t pt-8">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Ricoz Inventory. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <Link href="/security" className="hover:text-foreground transition-colors">Security</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}