const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

export interface ApiPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  details?: unknown
  /** Present on paginated list endpoints (inventory, products, transfers, ...). */
  pagination?: ApiPagination
  /** Top-level extras some endpoints return (e.g. `locations` on /api/inventory). */
  [key: string]: unknown
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: Omit<RequestInit, 'body'> & {
    /**
     * Accepts either a plain object (JSON-encoded here) or an already
     * JSON.stringify'd string (passed through untouched).
     */
    body?: unknown
  } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers, ...rest } = options

  const serializedBody =
    body == null
      ? undefined
      : typeof body === 'string'
        ? body
        : JSON.stringify(body)

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: serializedBody,
    ...rest,
  })

  let data: Record<string, any> = {}
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    return {
      success: false,
      error: data.error || 'Request failed',
      ...(data.details && { details: data.details }),
    }
  }

  // Spread top-level fields (pagination, locations, message, ...) alongside `data`.
  return { success: true, ...data, data: data.data }
}

export default { fetch: apiFetch }