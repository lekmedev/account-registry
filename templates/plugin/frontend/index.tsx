// {{LABEL}} plugin UI — self-contained. Nothing may be imported from core:
// plugin globs resolve from different roots on host vs Docker, so relative
// imports into frontend/src would break, and no bare package other than
// react is guaranteed to resolve. That is also why there is no @tanstack
// here — vite.config.ts deliberately does not alias it.
//
// Tokens and class names live in ./theme.css, a copy of
// frontend/src/styles/{tokens,app}.css that scripts/check-plugin-ui.mjs
// keeps in sync with core. Full contract: docs/PLUGIN-UI.md.
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import './theme.css'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const API = '/api/v1/plugins/{{name}}/records'
const PAGE_SIZE = 20

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = localStorage.getItem('access_token')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errMsg(body, res.status))
  return body as T
}

/** FastAPI 422 sends detail as a list of {loc, msg} — render it like a form
 *  error instead of dumping JSON at the user. */
function errMsg(body: unknown, status = 0): string {
  const detail = (body as { detail?: unknown })?.detail ?? body
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
  if (detail) return JSON.stringify(detail)
  return status ? `request_failed_${status}` : 'unknown_error'
}

const errOf = (e: unknown) => (e instanceof Error ? e.message : 'unknown_error')

interface Res<T> {
  data: T | null
  error: string
  loading: boolean
  reload: () => void
}

/**
 * Fetch-on-mount + explicit reload. Stands in for react-query, which plugins
 * may not import: `deps` re-runs the fetch the way a query key would.
 */
function useRes<T>(fetcher: () => Promise<T>, deps: unknown[], enabled = true): Res<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetcher()
      .then((d) => {
        if (!alive) return
        setData(d)
        setError('')
      })
      .catch((e) => alive && setError(errOf(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [...deps, nonce, enabled])

  return { data, error, loading, reload }
}

/** Own permission check — core exposes nothing importable to a plugin.
 *  `ready` gates the forbidden branch so a cold cache never flashes it. */
function usePerms() {
  const me = useRes<{ permissions: string[] }>(() => api('/api/v1/core/auth/me'), [])
  const perms = me.data?.permissions ?? []
  return {
    ready: !me.loading && !me.error,
    can: (p: string) => perms.includes('*') || perms.includes(p),
  }
}

interface Record_ {
  id: number
  code: string
  name: string
  email: string
  department_id: number | null
  department_name: string | null
  tags: string[]
  status: string
  expiration_date: string | null
}
interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
interface Dept {
  id: number
  name: string
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge--ok',
  disabled: 'badge--off',
  expired: 'badge--warn',
}

const EMPTY = {
  code: '',
  name: '',
  email: '',
  department_id: '',
  tags: '',
  status: 'active',
  expiration_date: '',
}
type Form = typeof EMPTY

function toPayload(f: Form) {
  return {
    code: f.code,
    name: f.name,
    email: f.email,
    department_id: f.department_id ? parseInt(f.department_id) : null,
    tags: f.tags
      ? f.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    status: f.status,
    expiration_date: f.expiration_date || null,
  }
}

function toForm(r: Record_): Form {
  return {
    code: r.code,
    name: r.name,
    email: r.email,
    department_id: r.department_id?.toString() ?? '',
    tags: (r.tags ?? []).join(', '),
    status: r.status,
    expiration_date: r.expiration_date ?? '',
  }
}

export function RecordList() {
  const { can, ready } = usePerms()
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const params =
    `q=${encodeURIComponent(q)}` +
    (dept ? `&department_id=${dept}` : '') +
    (status ? `&status=${status}` : '') +
    `&page=${page}&page_size=${PAGE_SIZE}`

  const list = useRes<Page<Record_>>(() => api(`${API}?${params}`), [params])
  const depts = useRes<Page<Dept>>(
    () => api('/api/v1/core/departments?page=1&page_size=100'),
    [],
  )

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(errOf(e))
    } finally {
      setBusy(false)
    }
  }

  const askDelete = (id: number, code: string) => {
    if (!window.confirm(`Delete record "${code}"?`)) return
    void guard(async () => {
      await api(`${API}/${id}`, { method: 'DELETE' })
      list.reload()
    })
  }

  const doExport = () =>
    guard(async () => {
      const access = localStorage.getItem('access_token')
      const res = await fetch(`${BASE}${API}/export?${params}`, {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      })
      if (!res.ok) throw new Error(`export_failed_${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = '{{name}}_records.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    })

  if (ready && !can('{{PERM_PREFIX}}.record.view')) {
    return (
      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">{{LABEL}}</span>
        </div>
        <div className="empty">
          <h3 className="empty__title">No access</h3>
          <p className="empty__text">
            This page needs the <code>{'{{PERM_PREFIX}}.record.view'}</code> permission.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="mono" style={{ color: 'var(--text-accent)' }}>
            Plugin · {'{{name}}'}
          </p>
          <h1>{'{{LABEL}}'}</h1>
          <p>Say here what this registry holds and where the data comes from.</p>
        </div>
        {can('{{PERM_PREFIX}}.record.create') && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setCreating(true)
              setEditing(null)
            }}
          >
            New record
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="search">
          <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            className="input"
            value={q}
            placeholder="search code / name / email"
            aria-label="Search records"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <select
          className="select"
          value={dept}
          aria-label="Filter by department"
          onChange={(e) => {
            setDept(e.target.value)
            setPage(1)
          }}
        >
          <option value="">all departments</option>
          {(depts.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <select
          className="select"
          value={status}
          aria-label="Filter by status"
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">all statuses</option>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
          <option value="expired">expired</option>
        </select>

        <span className="spacer" />

        <div className="pager">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span>
            page {page} / {lastPage} · {total} total
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={page >= lastPage || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>

        {can('{{PERM_PREFIX}}.record.export') && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={doExport}
          >
            Export .xlsx
          </button>
        )}
      </div>

      {err && <div className="alert alert--err" role="alert">{err}</div>}

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Records</span>
          <span className="panel__meta">
            {list.loading ? 'loading…' : `${items.length} shown`}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <h3 className="empty__title">
              {list.loading ? 'Loading records' : 'No records'}
            </h3>
            <p className="empty__text">
              {q || dept || status
                ? 'No record matches the current search or filters.'
                : 'Create the first record to get started.'}
            </p>
          </div>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>code</th>
                  <th>name</th>
                  <th>email</th>
                  <th>department</th>
                  <th>tags</th>
                  <th>status</th>
                  <th>expires</th>
                  <th className="actions">actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="sub">{r.id}</td>
                    <td className="strong">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="trunc">{r.email}</td>
                    <td>{r.department_name || <span className="sub">—</span>}</td>
                    <td>
                      {r.tags?.length ? (
                        <div className="chips">
                          {r.tags.slice(0, 3).map((t) => (
                            <span className="chip" key={t}>{t}</span>
                          ))}
                          {r.tags.length > 3 && (
                            <span className="chip">+{r.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge--off'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="sub">{r.expiration_date || '—'}</td>
                    <td className="actions">
                      {can('{{PERM_PREFIX}}.record.edit') && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setEditing(r.id)
                            setCreating(false)
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {can('{{PERM_PREFIX}}.record.delete') && (
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          disabled={busy}
                          onClick={() => askDelete(r.id, r.code)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing !== null) && (
        <RecordForm
          id={editing}
          can={can}
          depts={depts.data?.items ?? []}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            list.reload()
          }}
        />
      )}
    </div>
  )
}

function RecordForm({
  id,
  can,
  depts,
  onClose,
}: {
  id: number | null
  can: (p: string) => boolean
  depts: Dept[]
  onClose: () => void
}) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const detail = useRes<Record_>(() => api(`${API}/${id}`), [id], id !== null)

  // Populate once the record lands — never setState during render.
  useEffect(() => {
    if (detail.data) setForm(toForm(detail.data))
  }, [detail.data])

  const set =
    (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value })

  const save = () => {
    setBusy(true)
    setErr('')
    const body = JSON.stringify(toPayload(form))
    const call =
      id === null
        ? api<Record_>(API, { method: 'POST', body })
        : api<Record_>(`${API}/${id}`, { method: 'PUT', body })
    call
      .then(() => onClose())
      .catch((e) => setErr(errOf(e)))
      .finally(() => setBusy(false))
  }

  const allowed = id === null ? can('{{PERM_PREFIX}}.record.create') : can('{{PERM_PREFIX}}.record.edit')
  if (!allowed) return null
  if (id !== null && detail.loading && !detail.data) {
    return (
      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Loading record</span>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">
          {id === null ? 'New record' : `Edit record #${id}`}
        </span>
        <span className="panel__meta">
          {id === null
            ? '{{PERM_PREFIX}}.record.create'
            : '{{PERM_PREFIX}}.record.edit'}
        </span>
      </div>

      <div className="panel__body">
        {(err || detail.error) && (
          <div className="alert alert--err" role="alert">
            {err || detail.error}
          </div>
        )}

        <div className="fieldgrid">
          <div className="field">
            <label className="label" htmlFor="rec-code">code *</label>
            <input id="rec-code" className="input" value={form.code}
                   onChange={set('code')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-name">name *</label>
            <input id="rec-name" className="input" value={form.name}
                   onChange={set('name')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-email">email *</label>
            <input id="rec-email" className="input" type="email" value={form.email}
                   onChange={set('email')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-dept">department</label>
            <select id="rec-dept" className="select" value={form.department_id}
                    onChange={set('department_id')}>
              <option value="">none</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-status">status</label>
            <select id="rec-status" className="select" value={form.status}
                    onChange={set('status')}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-exp">expiration date</label>
            <input id="rec-exp" className="input" type="date" value={form.expiration_date}
                   onChange={set('expiration_date')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="rec-tags">tags (csv)</label>
            <input id="rec-tags" className="input" value={form.tags}
                   placeholder="e.g. alpha, beta" onChange={set('tags')} />
          </div>
        </div>

        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : id === null ? 'Create record' : 'Save changes'}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <span className="hint">fields marked * are required</span>
        </div>
      </div>
    </div>
  )
}

// Required export name: frontend/src/plugin_registry.ts globs this file and
// reads `routes`. Each `path` must match a menu[].path in plugin.json.
export const routes = [{ path: '{{ROUTE_PATH}}', element: <RecordList /> }]