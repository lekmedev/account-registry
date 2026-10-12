const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `request_failed_${status}`)
    this.status = status
    this.detail = detail
  }
}

function tokens() {
  return {
    access: localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token'),
  }
}

async function refreshTokens(): Promise<boolean> {
  const { refresh } = tokens()
  if (!refresh) return false
  const res = await fetch(`${BASE}/api/v1/core/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  if (!res.ok) return false
  const pair = await res.json()
  localStorage.setItem('access_token', pair.access_token)
  localStorage.setItem('refresh_token', pair.refresh_token)
  return true
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const { access } = tokens()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401 && !retried && tokens().refresh) {
    if (await refreshTokens()) return api<T>(path, init, true)
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
    throw new ApiError(401, 'session_expired')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (body as { detail?: unknown }).detail ?? body
    throw new ApiError(res.status, detail)
  }
  return body as T
}

/**
 * FastAPI sends 422 as a list of {loc, msg}. Render it as a readable form
 * error ("email: value is not a valid email address") instead of raw JSON.
 * Plugins carry their own copy of this — they cannot import from here.
 */
function fmtDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const e = d as { loc?: unknown[]; msg?: string }
        const field = (e.loc ?? [])
          .filter((p) => p !== 'body' && p !== 'query' && p !== 'path')
          .join('.')
        const m = e.msg ?? 'invalid'
        return field ? `${field}: ${m}` : m
      })
      .join(' · ')
  }
  return JSON.stringify(detail)
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return fmtDetail(e.detail)
  return e instanceof Error ? e.message : 'unknown_error'
}
