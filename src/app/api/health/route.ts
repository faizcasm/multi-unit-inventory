import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'

// Always evaluate the live DB connection — never statically optimize.
export const dynamic = 'force-dynamic'

/**
 * Public uptime/monitoring endpoint. Deliberately unauthenticated (monitors
 * can't log in) and reveals nothing beyond process uptime + DB reachability.
 * 200 when Mongo answers, 503 when it doesn't.
 */
export async function GET() {
  const base = {
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }

  try {
    await connectDB()
    return NextResponse.json(
      { success: true, data: { status: 'ok', db: 'up', ...base } },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { success: false, data: { status: 'degraded', db: 'down', ...base } },
      { status: 503 }
    )
  }
}
