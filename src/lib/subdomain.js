const UMLAUT_MAP = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
}

export function suggestSubdomain(customerName, projectName) {
  const base = (customerName || '').trim() || (projectName || '').trim()
  if (!base) return ''

  let value = base.toLowerCase()
  value = value.replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch])
  value = value.normalize('NFD').replace(/[̀-ͯ]/g, '')
  value = value.replace(/['’‘`]/g, '')
  value = value.replace(/[^a-z0-9]+/g, '-')
  value = value.replace(/^-+|-+$/g, '')
  value = value.slice(0, 63)
  value = value.replace(/-+$/g, '')

  return value
}
