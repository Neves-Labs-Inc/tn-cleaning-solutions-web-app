import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clientPrefix, formatInvoiceNumber } from '../../src/lib/invoices/number.ts'

test("the prefix is the first three letters of the client's name, upper case", () => {
  assert.equal(clientPrefix('Smith Residence'), 'SMI')
})

test('the prefix skips anything that is not a letter', () => {
  assert.equal(clientPrefix("O'Brien & Co"), 'OBR')
  assert.equal(clientPrefix('7-Eleven'), 'ELE')
})

test('the prefix drops accents', () => {
  assert.equal(clientPrefix('Émilie Côté'), 'EMI')
})

test('the prefix spells out letters unaccent rewrites rather than strips', () => {
  assert.equal(clientPrefix('Øster'), 'OST')
  assert.equal(clientPrefix('ßa'), 'SSA')
  assert.equal(clientPrefix('Æble'), 'AEB')
  assert.equal(clientPrefix('Łódź'), 'LOD')
})

test('a short name is padded with X', () => {
  assert.equal(clientPrefix('Al'), 'ALX')
  assert.equal(clientPrefix('123'), 'XXX')
})

test('the number pads the count to three digits', () => {
  assert.equal(formatInvoiceNumber(42, 'SMI', 2026), 'INV-042-SMI2026')
})

test('a count past 999 keeps every digit', () => {
  assert.equal(formatInvoiceNumber(1234, 'SMI', 2026), 'INV-1234-SMI2026')
})
