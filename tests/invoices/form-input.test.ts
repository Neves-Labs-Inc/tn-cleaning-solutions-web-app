import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { messageFor } from '../../src/lib/invoices/errors.ts'
import { readOptionalDate } from '../../src/lib/invoices/form-input.ts'

function form(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value)
  }
  return formData
}

describe('readOptionalDate', () => {
  it('rejects a day the month does not have', () => {
    assert.equal(readOptionalDate(form({ due_date: '2026-02-31' }), 'due_date'), undefined)
  })

  it('rejects Feb 29 in a non-leap year', () => {
    assert.equal(readOptionalDate(form({ paid_date: '2025-02-29' }), 'paid_date'), undefined)
  })

  it('accepts a leap day', () => {
    assert.equal(readOptionalDate(form({ due_date: '2028-02-29' }), 'due_date'), '2028-02-29')
  })

  it('accepts a normal date, trimmed', () => {
    assert.equal(readOptionalDate(form({ due_date: ' 2026-10-13 ' }), 'due_date'), '2026-10-13')
  })

  it('rejects a value that is not a yyyy-MM-dd date', () => {
    assert.equal(readOptionalDate(form({ due_date: '13/10/2026' }), 'due_date'), undefined)
  })

  it('reads a blank, whitespace or missing date as null', () => {
    assert.equal(readOptionalDate(form({ due_date: '' }), 'due_date'), null)
    assert.equal(readOptionalDate(form({ due_date: '   ' }), 'due_date'), null)
    assert.equal(readOptionalDate(form({}), 'due_date'), null)
  })
})

describe('invalid date refusals', () => {
  it('tell the admin to enter a valid due or paid date', () => {
    assert.equal(messageFor('invalid_due_date'), 'Enter a valid date.')
    assert.equal(messageFor('invalid_paid_date'), 'Enter a valid date.')
  })
})
