const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers, ...rest } = options

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || 'Request failed',
      ...(data.details && { details: data.details }),
    }
  }

  return { success: true, data: data.data, message: data.message }
}

export default { fetch: apiFetch }