import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMfaApi, isMoreFactorsError, mfaErrorMessage, maskEmail } from '../src/lib/mfa.js'

// Fake-Client wie Appwrite-SDK 13: call(method, url, headers, params)
function fakeClient(response = {}) {
  const calls = []
  return {
    calls,
    config: { endpoint: 'https://ticket.webklar.com/v1' },
    call: async (method, url, headers, params) => {
      calls.push({ method, url: String(url), headers, params })
      return response
    },
  }
}

test('createEmailChallenge: POST mit factor email und deutscher Sprache', async () => {
  const client = fakeClient({ $id: 'ch1' })
  assert.equal(await createMfaApi(client).createEmailChallenge(), 'ch1')
  const [call] = client.calls
  assert.equal(call.method, 'post')
  assert.equal(call.url, 'https://ticket.webklar.com/v1/account/mfa/challenges')
  assert.deepEqual(call.params, { factor: 'email' })
  assert.equal(call.headers['X-Appwrite-Locale'], 'de')
})

test('completeChallenge: PUT mit challengeId und Code', async () => {
  const client = fakeClient({})
  await createMfaApi(client).completeChallenge('c1', '123456')
  assert.equal(client.calls[0].method, 'put')
  assert.deepEqual(client.calls[0].params, { challengeId: 'c1', otp: '123456' })
})

test('isMoreFactorsError', () => {
  assert.equal(isMoreFactorsError({ type: 'user_more_factors_required' }), true)
  assert.equal(isMoreFactorsError({ type: 'user_unauthorized', code: 401 }), false)
  assert.equal(isMoreFactorsError(null), false)
})

test('mfaErrorMessage: feste Texte', () => {
  assert.equal(mfaErrorMessage({ type: 'user_invalid_token' }), 'Code falsch oder abgelaufen.')
  assert.equal(mfaErrorMessage({ code: 429 }), 'Zu viele Versuche. Bitte warte einige Minuten.')
  assert.equal(mfaErrorMessage({ type: 'general_rate_limit_exceeded' }), 'Zu viele Versuche. Bitte warte einige Minuten.')
  assert.equal(mfaErrorMessage({ type: 'user_email_not_verified' }), '2FA ist für dein Konto noch nicht eingerichtet – bitte Kenso Bescheid geben.')
  assert.equal(mfaErrorMessage({ message: 'Netzwerk weg' }), 'Netzwerk weg')
  assert.equal(mfaErrorMessage({}), 'Anmeldung fehlgeschlagen')
})

test('maskEmail', () => {
  assert.equal(maskEmail('kenso@webklar.com'), 'k…@webklar.com')
  assert.equal(maskEmail(''), '')
})
