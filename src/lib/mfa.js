/**
 * Mitarbeiter-2FA per E-Mail-Code (Appwrite 1.8.1). Das SDK 13 kennt die MFA-Endpunkte nicht, deshalb
 * gehen die Aufrufe ueber client.call - mit derselben Sitzung (Cookie-Fallback) wie das SDK.
 * Bewusst ohne Import von appwrite.js, damit Node dieses Modul in den Tests laden kann.
 */
const HEADERS = { 'content-type': 'application/json', 'X-Appwrite-Locale': 'de' }

export function createMfaApi(client) {
  const url = () => new URL(`${client.config.endpoint}/account/mfa/challenges`)
  return {
    async createEmailChallenge() {
      const challenge = await client.call('post', url(), { ...HEADERS }, { factor: 'email' })
      return challenge.$id
    },
    async completeChallenge(challengeId, otp) {
      await client.call('put', url(), { ...HEADERS }, { challengeId, otp })
    },
  }
}

export function isMoreFactorsError(err) {
  return err?.type === 'user_more_factors_required'
}

export function mfaErrorMessage(err) {
  if (err?.type === 'user_invalid_token') return 'Code falsch oder abgelaufen.'
  if (err?.code === 429 || err?.type === 'general_rate_limit_exceeded') return 'Zu viele Versuche. Bitte warte einige Minuten.'
  if (err?.type === 'user_email_not_verified') return '2FA ist für dein Konto noch nicht eingerichtet – bitte Kenso Bescheid geben.'
  return err?.message || 'Anmeldung fehlgeschlagen'
}

/** kenso@webklar.com -> k…@webklar.com */
export function maskEmail(email) {
  const [local, domain] = String(email || '').split('@')
  if (!local || !domain) return ''
  return `${local[0]}…@${domain}`
}
