import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { customerTabs, resolveCustomerTab } = await loadModule('src/lib/customerTabs.js')

test('customerTabs: Rechnungen nur für Admins, Reihenfolge bleibt', () => {
  assert.deepEqual(customerTabs(true), [
    { id: 'overview', label: 'Uebersicht' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'invoices', label: 'Rechnungen' },
    { id: 'projects', label: 'Projekte' },
  ])
  const staff = customerTabs(false)
  assert.deepEqual(staff.map((t) => t.id), ['overview', 'tickets', 'projects'])
  // unbekannt oder nicht eindeutig true gilt als kein Admin
  for (const v of [undefined, null, 0, '', 'true']) {
    assert.deepEqual(customerTabs(v).map((t) => t.id), ['overview', 'tickets', 'projects'], String(v))
  }
  // die Einträge tragen nur id und label (kein internes Feld)
  assert.deepEqual(Object.keys(customerTabs(true)[2]), ['id', 'label'])
})

test('resolveCustomerTab: erlaubter Reiter bleibt, sonst Übersicht', () => {
  assert.equal(resolveCustomerTab('invoices', true), 'invoices')
  assert.equal(resolveCustomerTab('invoices', false), 'overview')
  assert.equal(resolveCustomerTab('invoices', undefined), 'overview')
  assert.equal(resolveCustomerTab('tickets', false), 'tickets')
  assert.equal(resolveCustomerTab('projects', false), 'projects')
  assert.equal(resolveCustomerTab('overview', false), 'overview')
  assert.equal(resolveCustomerTab('gibtsnicht', true), 'overview')
  assert.equal(resolveCustomerTab(undefined, true), 'overview')
})
