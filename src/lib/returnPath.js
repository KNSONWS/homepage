// Rueckkehr-Ziel nach dem Login: nur relative Pfade dieser App (kein offener Redirect).
export function safeReturnPath(from, fallback = '/tickets') {
  const path = typeof from === 'string' ? from : from?.pathname
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback
  if (path === '/login' || path.startsWith('/login/')) return fallback
  const search = typeof from === 'object' && typeof from?.search === 'string' && from.search.startsWith('?') ? from.search : ''
  return path + search
}
