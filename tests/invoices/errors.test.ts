import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { INVOICE_ERROR_CODES, messageFor, toLedgerError } from '../../src/lib/invoices/errors.ts'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../supabase/migrations')

function sqlErrorCodes(): Set<string> {
  const [schemaFile] = readdirSync(MIGRATIONS_DIR).filter((name) => /invoic.*schema.*\.sql$/.test(name))
  assert.ok(schemaFile, 'no invoicing schema migration found')

  const source = readFileSync(join(MIGRATIONS_DIR, schemaFile), 'utf8')
  return new Set([...source.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((match) => match[1]))
}

test('the code list matches the codes invoice_error raises in SQL', () => {
  const sqlCodes = sqlErrorCodes()

  assert.ok(sqlCodes.size > 0, 'no WHEN codes read from the migration')
  assert.deepEqual(new Set(INVOICE_ERROR_CODES), sqlCodes)
})

test('every code has a readable message', () => {
  for (const code of INVOICE_ERROR_CODES) {
    assert.ok(messageFor(code).trim().length > 0, `${code} has no message`)
  }
})

test('a refusal raised by invoice_error maps to its code from DETAIL', () => {
  const error = toLedgerError({
    message: 'The draft changed since you opened it. Reload it and try again.',
    details: 'draft_changed',
    hint: null,
    code: 'P0001',
  })

  assert.deepEqual(error, { code: 'draft_changed', message: messageFor('draft_changed') })
})

test('an unrelated error maps to unknown and keeps its message', () => {
  const error = toLedgerError({
    message: 'connection reset by peer',
    details: 'socket closed',
    hint: null,
    code: '08006',
  })

  assert.deepEqual(error, { code: 'unknown', message: 'connection reset by peer' })
})

test('an error with no details maps to unknown and keeps its message', () => {
  assert.deepEqual(toLedgerError({ message: 'fetch failed' }), { code: 'unknown', message: 'fetch failed' })
})
