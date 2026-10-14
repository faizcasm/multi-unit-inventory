'use client'

import * as React from 'react'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Mail, Lock, User, Building, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { cn } from '@/lib/utils/helpers'

interface FormData {
  name: string
  email: string
  password: string
  confirmPassword: string
  organizationName: string
  organizationSlug: string
}

interface FormErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
  organizationName?: string
  organizationSlug?: string
}

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organizationName: '',
    organizationSlug: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showSlugSuggestion, setShowSlugSuggestion] = useState(false)

  const validateField = (name: string, value: string): string | undefined => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Name is required'
        if (value.length > 100) return 'Name must be 100 characters or less'
        break
      case 'email':
        if (!value.trim()) return 'Email is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email address'
        break
      case 'password':
        if (!value) return 'Password is required'
        if (value.length < 8) return 'Password must be at least 8 characters'
        break
      case 'confirmPassword':
        if (value !== formData.password) return 'Passwords do not match'
        break
      case 'organizationName':
        if (!value.trim()) return 'Organization name is required'
        if (value.length > 100) return 'Name must be 100 characters or less'
        break
      case 'organizationSlug':
        if (!value.trim()) return 'Organization slug is required'
        if (!/^[a-z0-9-]+$/.test(value)) return 'Slug can only contain lowercase letters, numbers, and hyphens'
        if (value.length > 50) return 'Slug must be 50 characters or less'
        break
    }
    return undefined
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // Clear error on change
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }

    // Auto-generate slug from organization name
    if (name === 'organizationName' && !formData.organizationSlug) {
      const slug = value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50)
      setFormData((prev) => ({ ...prev, organizationSlug: slug }))
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const error = validateField(name, value)
    if (error) {
      setErrors((prev) => ({ ...prev, [name]: error }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    // Validate all fields
    const newErrors: FormErrors = {}
    let hasErrors = false
    Object.keys(formData).forEach((key) => {
      const error = validateField(key, formData[key as keyof FormData])
      if (error) {
        newErrors[key as keyof FormErrors] = error
        hasErrors = true
      }
    })

    if (hasErrors) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          organizationName: formData.organizationName,
          organizationSlug: formData.organizationSlug,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.details) {
          const fieldErrors: FormErrors = {}
          Object.entries(data.details).forEach(([field, messages]) => {
            fieldErrors[field as keyof FormErrors] = (messages as string[]).join(', ')
          })
          setErrors(fieldErrors)
        } else {
          setSubmitError(data.error || 'Registration failed. Please try again.')
        }
        return
      }

      // Redirect to sign in with success message
      router.push('/auth/signin?registered=true')
    } catch (err) {
      setSubmitError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const passwordRequirements = [
    { test: formData.password.length >= 8, label: 'At least 8 characters' },
    { test: /[A-Z]/.test(formData.password), label: 'One uppercase letter' },
    { test: /[a-z]/.test(formData.password), label: 'One lowercase letter' },
    { test: /[0-9]/.test(formData.password), label: 'One number' },
    { test: /[^A-Za-z0-9]/.test(formData.password), label: 'One special character' },
  ]

  return (
    <div>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create Your Account</CardTitle>
          <CardDescription>Start managing inventory across multiple locations</CardDescription>
        </CardHeader>
        <CardContent>
          {submitError && (
            <div className={cn('mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-sm text-destructive')}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User Info */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Your Information
              </h3>

              <Input
                label="Full Name"
                name="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.name}
                required
                autoComplete="name"
                icon={<User className="h-4 w-4" />}
              />
              <Input
                label="Email"
                name="email"
                type="email"
                placeholder="you@company.com"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.email}
                required
                autoComplete="email"
                icon={<Mail className="h-4 w-4" />}
              />
              <Input
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.password}
                required
                autoComplete="new-password"
                icon={<Lock className="h-4 w-4" />}
                hint={formData.password && (
                  <div className="mt-2 space-y-1">
                    {passwordRequirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {req.test ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <span className="h-3 w-3 text-muted-foreground">○</span>
                        )}
                        <span className={cn(req.test ? 'text-green-500' : 'text-muted-foreground')}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              />
              <Input
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.confirmPassword}
                required
                autoComplete="new-password"
                icon={<Lock className="h-4 w-4" />}
              />
            </div>

            {/* Organization Info */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Building className="h-4 w-4" />
                Organization Details
              </h3>

              <Input
                label="Organization Name"
                name="organizationName"
                type="text"
                placeholder="Acme Corporation"
                value={formData.organizationName}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.organizationName}
                required
                autoComplete="organization"
                icon={<Building className="h-4 w-4" />}
              />
              <Input
                label="Organization Slug"
                name="organizationSlug"
                type="text"
                placeholder="acme-corp"
                value={formData.organizationSlug}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.organizationSlug}
                required
                autoComplete="organization"
                hint="Used in your organization URL (e.g., acme-corp.inventory-hub.app). Lowercase letters, numbers, and hyphens only."
                icon={<Package className="h-4 w-4" />}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}