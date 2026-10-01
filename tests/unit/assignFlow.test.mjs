import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { nextStep, prevStep, newTicketDefaults, canFinish, openTicketsFor } = await loadModule(
  'src/lib/assignFlow.js'
)

test('nextStep: Kunde ja durchläuft alle Schritte', () => {
  const s = { forCustomer: true }
  assert.equal(nextStep({ ...s, step: 'kind' }), 'customer?')
  assert.equal(nextStep({ ...s, step: 'customer?' }), 'customer')
  assert.equal(nextStep({ ...s, step: 'customer' }), 'ticket')
  assert.equal(nextStep({ ...s, step: 'ticket' }), 'summary')
  assert.equal(nextStep({ ...s, step: 'summary' }), 'summary')
})

test('nextStep: ohne Kunde springt customer? direkt zu summary', () => {
  assert.equal(nextStep({ step: 'customer?', forCustomer: false }), 'summary')
})

test('prevStep', () => {
  assert.equal(prevStep({ step: 'kind' }), 'kind')
  assert.equal(prevStep({ step: 'customer?' }), 'kind')
  assert.equal(prevStep({ step: 'customer', forCustomer: true }), 'customer?')
  assert.equal(prevStep({ step: 'ticket', forCustomer: true }), 'customer')
  assert.equal(prevStep({ step: 'summary', forCustomer: true }), 'ticket')
  assert.equal(prevStep({ step: 'summary', forCustomer: false }), 'customer?')
})

test('newTicketDefaults', () => {
  const d = newTicketDefaults({
    kindLabel: 'Migration/Umzug',
    ticketType: 'Migration',
    repoName: 'foo',
    repoUrl: 'https://git.webklar.com/webklar/foo',
    customer: { name: 'Firma', contactName: 'Max' },
    today: '2026-09-30',
  })
  assert.equal(d.topic, 'Migration/Umzug – foo')
  assert.equal(d.type, 'Migration')
  assert.equal(d.requestedBy, 'Max')
  assert.equal(d.startDate, '2026-09-30')
  assert.ok(d.details.includes('https://git.webklar.com/webklar/foo'))
  const e = newTicketDefaults({ kindLabel: 'Website', ticketType: 'Webpage', repoName: 'x', repoUrl: 'u', customer: { name: 'Firma' }, today: '2026-09-30' })
  assert.equal(e.requestedBy, 'Firma')
  assert.equal(e.type, 'Webpage')
})

test('canFinish', () => {
  assert.equal(canFinish({ kind: '' , forCustomer: false }), false)
  assert.equal(canFinish({ kind: 'app', forCustomer: false }), true)
  assert.equal(canFinish({ kind: 'app', forCustomer: true }), false)
  assert.equal(canFinish({ kind: 'app', forCustomer: true, customerId: 'c1' }), false)
  assert.equal(canFinish({ kind: 'app', forCustomer: true, customerId: 'c1', ticketId: 't1' }), true)
  const nt = { topic: 'T', requestedBy: 'M', startDate: '2026-09-30', details: 'd' }
  assert.equal(canFinish({ kind: 'app', forCustomer: true, customerId: 'c1', newTicket: nt }), true)
  assert.equal(canFinish({ kind: 'app', forCustomer: true, customerId: 'c1', newTicket: { ...nt, topic: ' ' } }), false)
  assert.equal(canFinish({ kind: 'app', forCustomer: true, newTicket: nt }), false)
})

test('openTicketsFor', () => {
  const t = [
    { $id: '1', customerId: 'c1', status: 'Open' },
    { $id: '2', customerId: 'c1', status: 'Closed' },
    { $id: '3', customerId: 'c1', status: 'Cancelled' },
    { $id: '4', customerId: 'c2', status: 'Open' },
    { $id: '5', customerId: 'c1', status: 'In Progress' },
  ]
  assert.deepEqual(openTicketsFor(t, 'c1').map((x) => x.$id), ['1', '5'])
  assert.deepEqual(openTicketsFor(null, 'c1'), [])
})

test('kindLabelFor: Label aus Katalog, leer = Art fehlt', async () => {
  const { kindLabelFor } = await loadModule('src/lib/assignFlow.js')
  const kinds = [{ key: 'website', label: 'Website' }, { key: 'app', label: 'App' }]
  assert.equal(kindLabelFor(kinds, 'app'), 'App')
  assert.equal(kindLabelFor(kinds, ''), 'Art fehlt')
  assert.equal(kindLabelFor(kinds, undefined), 'Art fehlt')
  assert.equal(kindLabelFor(kinds, 'unbekannt'), 'unbekannt')
})
