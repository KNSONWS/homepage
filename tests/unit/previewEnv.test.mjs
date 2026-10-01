import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { isValidEnvName, buildEnvPayload, dotColor, isDevPreview, envValueTooLong, MAX_ENV_VARS } = await loadModule('src/lib/previewEnv.js')

test('isValidEnvName', () => {
  assert.equal(isValidEnvName('VITE_API_URL'), true)
  assert.equal(isValidEnvName('_X1'), true)
  assert.equal(isValidEnvName('vite_x'), false)
  assert.equal(isValidEnvName('1ABC'), false)
  assert.equal(isValidEnvName(''), false)
  assert.equal(isValidEnvName('A-B'), false)
})

test('buildEnvPayload: set und remove, set gewinnt nicht gegen remove', () => {
  const p = buildEnvPayload({ A: '1', B: '2' }, ['B', 'C'])
  assert.deepEqual(p, { set: { A: '1' }, remove: ['B', 'C'] })
})

test('dotColor', () => {
  assert.equal(dotColor('online'), '#10b981')
  assert.equal(dotColor('building'), '#f59e0b')
  assert.equal(dotColor('sleeping'), '#f59e0b')
  assert.equal(dotColor('starting'), '#f59e0b')
  assert.equal(dotColor('failed'), '#ef4444')
  assert.equal(dotColor('off'), '#a0aec0')
  assert.equal(dotColor(undefined), '#a0aec0')
})

test('isDevPreview', () => {
  assert.equal(isDevPreview({ mode: 'dev' }), true)
  assert.equal(isDevPreview({ mode: 'auto', detected: 'dev:npm' }), true)
  assert.equal(isDevPreview({ mode: 'auto', detected: 'build:npm' }), false)
  assert.equal(isDevPreview({ mode: 'build', detected: 'dev:npm' }), false)
  assert.equal(isDevPreview(null), false)
})

test('envValueTooLong zählt Bytes', () => {
  assert.equal(envValueTooLong('a'.repeat(4096)), false)
  assert.equal(envValueTooLong('a'.repeat(4097)), true)
  assert.equal(envValueTooLong('ä'.repeat(2049)), true)
  assert.equal(MAX_ENV_VARS, 30)
})
