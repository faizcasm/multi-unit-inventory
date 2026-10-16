import { z } from 'zod'

/**
 * CSV import validation for products & locations.
 *
 * Includes a dependency-free RFC4180-style CSV parser (quoted fields, ""
 * escapes, commas/newlines inside quotes, CRLF line endings) plus per-row
 * Zod schemas. Header matching is case-insensitive and whitespace tolerant.
 */

export type ImportTarget = 'products' | 'locations'

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

/** RFC4180-style parser: quoted fields, "" escapes, embedded commas/newlines, CRLF. */
export function parseCsv(input: string): string[][] {
  let text = input
  // Strip a leading UTF-8 BOM (Excel exports love these).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r' || ch === '\n') {
      // CRLF, LF or lone CR all terminate a record.
      if (ch === '\r' && text[i + 1] === '\n') i += 2
      else i += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/* ------------------------------------------------------------------ */
/* Column specs                                                        */
/* ------------------------------------------------------------------ */

export interface ImportFieldSpec {
  /** Canonical camelCase key used in records. */
  key: string
  /** Normalized header aliases that map to this column. */
  aliases: string[]
  required: boolean
}

/** Lowercase and strip everything but letters/digits for tolerant header matching. */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

const PRODUCT_FIELDS: ImportFieldSpec[] = [
  { key: 'name', aliases: ['name', 'productname', 'product'], required: true },
  { key: 'sku', aliases: ['sku'], required: true },
  { key: 'description', aliases: ['description', 'notes'], required: false },
  { key: 'category', aliases: ['category'], required: false },
  { key: 'unitOfMeasure', aliases: ['unitofmeasure', 'uom', 'unit'], required: true },
  { key: 'barcode', aliases: ['barcode', 'ean', 'upc'], required: false },
  { key: 'reorderThreshold', aliases: ['reorderthreshold', 'reorderat'], required: false },
  { key: 'reorderQuantity', aliases: ['reorderquantity'], required: false },
]

const LOCATION_FIELDS: ImportFieldSpec[] = [
  { key: 'name', aliases: ['name', 'locationname'], required: true },
  { key: 'code', aliases: ['code', 'locationcode'], required: true },
  { key: 'type', aliases: ['type', 'locationtype'], required: true },
  { key: 'city', aliases: ['city'], required: false },
  { key: 'country', aliases: ['country'], required: false },
  { key: 'description', aliases: ['description'], required: false },
  { key: 'capacity', aliases: ['capacity'], required: false },
]

/* ------------------------------------------------------------------ */
/* Row schemas                                                         */
/* ------------------------------------------------------------------ */

const nonNegativeInt = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .coerce.number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(0, `${label} must be 0 or greater`)
      .optional()
  )

const productImportRowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(50, 'SKU must be 50 characters or less')
    .regex(/^[A-Z0-9-_]+$/, 'SKU can only contain uppercase letters, numbers, hyphens, and underscores'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or less').optional(),
  category: z.string().trim().max(100, 'Category must be 100 characters or less').optional(),
  unitOfMeasure: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other'], {
    errorMap: () => ({
      message: 'Unit of measure must be one of: pcs, kg, g, l, ml, m, cm, box, pack, roll, other',
    }),
  }),
  barcode: z.string().trim().max(100, 'Barcode must be 100 characters or less').optional(),
  reorderThreshold: nonNegativeInt('Reorder threshold'),
  reorderQuantity: nonNegativeInt('Reorder quantity'),
})

const locationImportRowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(20, 'Code must be 20 characters or less')
    .regex(/^[A-Z0-9-]+$/, 'Code can only contain uppercase letters, numbers, and hyphens'),
  type: z.enum(['warehouse', 'store', 'distribution_center', 'other'], {
    errorMap: () => ({ message: 'Type must be warehouse, store, distribution_center, or other' }),
  }),
  city: z.string().trim().max(100, 'City must be 100 characters or less').optional(),
  country: z.string().trim().max(100, 'Country must be 100 characters or less').optional(),
  description: z.string().trim().max(500, 'Description must be 500 characters or less').optional(),
  capacity: nonNegativeInt('Capacity'),
})

export interface ProductImportData {
  name: string
  sku: string
  description?: string
  category?: string
  unitOfMeasure: string
  barcode?: string
  reorderThreshold: number
  reorderQuantity: number
}

export interface LocationImportData {
  name: string
  code: string
  type: string
  description?: string
  address?: { city?: string; country?: string }
  capacity?: number
}

/* ------------------------------------------------------------------ */
/* Row processing                                                      */
/* ------------------------------------------------------------------ */

export interface ImportRowError {
  /** 1-based line number in the CSV, including the header row. */
  line: number
  row: Record<string, string>
  errors: string[]
}

export interface ImportDuplicate {
  line: number
  code: string
}

export interface ValidImportRow<T> {
  line: number
  data: T
}

export interface CsvProcessResult<T> {
  totalRows: number
  valid: ValidImportRow<T>[]
  invalid: ImportRowError[]
  duplicates: ImportDuplicate[]
}

function buildRecords(
  csvText: string,
  fields: ImportFieldSpec[]
): { records: Array<{ line: number; values: Record<string, string> }>; error?: string } {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ''))
  if (rows.length === 0) {
    return { records: [], error: 'CSV is empty. Add a header row followed by data rows.' }
  }

  const aliasToKey = new Map<string, string>()
  for (const field of fields) {
    for (const alias of field.aliases) aliasToKey.set(alias, field.key)
  }

  const header = rows[0]
  // Positional mapping tolerates duplicate/unknown headers gracefully.
  const positionalMap: Array<{ index: number; key: string } | null> = header.map((cell, index) => {
    const key = aliasToKey.get(normalizeHeader(cell))
    return key ? { index, key } : null
  })

  const missingRequired = fields
    .filter((f) => f.required && !positionalMap.some((c) => c && c.key === f.key))
    .map((f) => f.key)
  if (missingRequired.length > 0) {
    return {
      records: [],
      error: `Missing required column(s): ${missingRequired.join(', ')}. Expected headers: ${fields
        .filter((f) => f.required)
        .map((f) => f.key)
        .join(', ')}.`,
    }
  }

  const records = rows.slice(1).map((row, index) => {
    const values: Record<string, string> = {}
    for (const column of positionalMap) {
      if (!column) continue
      const raw = row[column.index]
      const value = typeof raw === 'string' ? raw.trim() : ''
      // First non-empty column wins when duplicate headers map to the same key.
      if (value !== '' || values[column.key] === undefined) values[column.key] = value
    }
    return { line: index + 2, values } // +2: header is line 1, data rows are 1-based after it.
  })
  return { records }
}

function processCsvRows<T>(
  csvText: string,
  fields: ImportFieldSpec[],
  validate: (values: Record<string, string>) => { success: true; data: T } | { success: false; errors: string[] },
  duplicateKey: (data: T) => string,
  existingKeys: Set<string>
): CsvProcessResult<T> | { error: string } {
  const { records, error } = buildRecords(csvText, fields)
  if (error) return { error }

  const seen = new Set<string>()
  const result: CsvProcessResult<T> = { totalRows: records.length, valid: [], invalid: [], duplicates: [] }

  for (const record of records) {
    // Drop empty values so optional fields fall back to their defaults.
    const values: Record<string, string> = {}
    for (const [key, value] of Object.entries(record.values)) {
      if (value !== '') values[key] = value
    }

    const parsed = validate(values)
    if (!parsed.success) {
      result.invalid.push({ line: record.line, row: record.values, errors: parsed.errors })
      continue
    }

    const key = duplicateKey(parsed.data).toLowerCase()
    if (existingKeys.has(key) || seen.has(key)) {
      result.duplicates.push({ line: record.line, code: duplicateKey(parsed.data) })
      continue
    }
    seen.add(key)
    result.valid.push({ line: record.line, data: parsed.data })
  }
  return result
}

export function processProductCsv(csvText: string, existingKeys: Set<string>): CsvProcessResult<ProductImportData> | { error: string } {
  return processCsvRows<ProductImportData>(
    csvText,
    PRODUCT_FIELDS,
    (values) => {
      const normalized = {
        ...values,
        sku: (values.sku || '').trim().toUpperCase(),
        unitOfMeasure: (values.unitOfMeasure || '').trim().toLowerCase(),
      }
      const parsed = productImportRowSchema.safeParse(normalized)
      if (!parsed.success) {
        return { success: false, errors: parsed.error.issues.map((issue) => issue.message) }
      }
      return {
        success: true,
        data: {
          name: parsed.data.name,
          sku: parsed.data.sku,
          description: parsed.data.description || undefined,
          category: parsed.data.category || undefined,
          unitOfMeasure: parsed.data.unitOfMeasure,
          barcode: parsed.data.barcode || undefined,
          reorderThreshold: parsed.data.reorderThreshold ?? 0,
          reorderQuantity: parsed.data.reorderQuantity ?? 0,
        },
      }
    },
    (data) => data.sku,
    existingKeys
  )
}

export function processLocationCsv(csvText: string, existingKeys: Set<string>): CsvProcessResult<LocationImportData> | { error: string } {
  return processCsvRows<LocationImportData>(
    csvText,
    LOCATION_FIELDS,
    (values) => {
      const normalized = {
        ...values,
        code: (values.code || '').trim().toUpperCase(),
        type: (values.type || '').trim().toLowerCase().replace(/[\s-]+/g, '_'),
      }
      const parsed = locationImportRowSchema.safeParse(normalized)
      if (!parsed.success) {
        return { success: false, errors: parsed.error.issues.map((issue) => issue.message) }
      }
      const city = parsed.data.city || undefined
      const country = parsed.data.country || undefined
      return {
        success: true,
        data: {
          name: parsed.data.name,
          code: parsed.data.code,
          type: parsed.data.type,
          description: parsed.data.description || undefined,
          address: city || country ? { city, country } : undefined,
          capacity: parsed.data.capacity,
        },
      }
    },
    (data) => data.code,
    existingKeys
  )
}
