import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATTRIBUTE, planAttribute } from '../scripts/setup-supporters.mjs'

test('Attribut supporters: String 4000, nicht Pflicht', () => {
  assert.deepEqual(ATTRIBUTE, { key: 'supporters', type: 'string', size: 4000, required: false })
})

test('planAttribute: anlegen, vorhanden oder Konflikt', () => {
  assert.equal(planAttribute([]), 'create')
  assert.equal(planAttribute([{ key: 'wsid', type: 'string', size: 10 }]), 'create')
  assert.equal(planAttribute([{ key: 'supporters', type: 'string', size: 4000 }]), 'exists')
  assert.equal(planAttribute([{ key: 'supporters', type: 'string', size: 8000 }]), 'exists')
  assert.equal(planAttribute([{ key: 'supporters', type: 'string', size: 255 }]), 'conflict')
  assert.equal(planAttribute([{ key: 'supporters', type: 'integer' }]), 'conflict')
})
