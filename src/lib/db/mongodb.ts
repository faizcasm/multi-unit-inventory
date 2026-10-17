import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI && process.env.NODE_ENV === 'development') {
  console.warn('MONGODB_URI is not set. Add it in .env.local or Vercel env vars.')
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongoose: MongooseCache | undefined
}

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function connectDB(): Promise<typeof mongoose> {
  if (cached!.conn) {
    return cached!.conn
  }

  if (!cached!.promise) {
    // maxPoolSize 5: N warm serverless lambdas × 10 connections can exhaust
    // Atlas connection caps. The timeout trio bounds how long an Atlas blip
    // can hang a request instead of the driver default (~30s).
    const opts = {
      bufferCommands: false,
      maxPoolSize: 5,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    }

    if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured')
  }
  cached!.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose
    })
  }

  try {
    cached!.conn = await cached!.promise
  } catch (e) {
    cached!.promise = null
    throw e
  }

  return cached!.conn
}

export { connectDB }
export default connectDB