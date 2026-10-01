// JWT-Cache fuer Serverpuls (rein, ohne Appwrite-Import; createJWT und Uhr werden injiziert).
export const JWT_TTL_MS = 10 * 60 * 1000

export function createJwtCache({ createJWT, now = Date.now, ttlMs = JWT_TTL_MS }) {
  let entry = null // { jwt, at } oder { promise }
  let pending = null

  async function get() {
    if (entry && now() - entry.at < ttlMs) return entry.jwt
    if (pending) return pending
    const p = (async () => {
      try {
        const { jwt } = await createJWT()
        entry = { jwt, at: now() }
        return jwt
      } finally {
        if (pending === p) pending = null
      }
    })()
    pending = p
    return p
  }

  function invalidate() {
    entry = null
  }

  return { get, invalidate }
}

// doFetch(jwt) -> Response-artig ({status}); bei 401 einmal mit frischem JWT wiederholen.
export async function fetchWithRetry(cache, doFetch) {
  const first = await doFetch(await cache.get())
  if (first.status !== 401) return first
  cache.invalidate()
  return doFetch(await cache.get())
}
