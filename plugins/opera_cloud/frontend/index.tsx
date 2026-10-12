// opera_cloud plugin UI — self-contained (no imports from core src: plugin globs
// resolve from different roots on host vs Docker, so relative imports into
// frontend/src would break). React-only: no @tanstack, no router imports; the
// core shell renders around us. Tokens + classes live in ./theme.css, a copy of
// frontend/src/styles/{tokens,app}.css kept honest by scripts/check-plugin-ui.mjs.
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import './theme.css'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const API = '/api/v1/plugins/opera_cloud/accounts'
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
  if (!res.ok) throw new Error(msg(body, res.status))
  return body as T
}

function msg(body: unknown, status = 0): string {
  const detail = (body as { detail?: unknown })?.detail ?? body
  if (typeof detail === 'string') return detail
  // FastAPI 422 sends a list of {loc, msg}. Render it like a form error,
  // not as raw JSON: "email: value is not a valid email address".
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
 * Fetch-on-mount + explicit `reload`. Stands in for react-query, which plugins
 * may not import: `deps` re-runs the fetch the same way a query key would.
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

/** Own permission check. Core exposes nothing importable to plugins. */
function usePerms() {
  const me = useRes<{ permissions: string[] }>(
    () => api('/api/v1/core/auth/me'),
    [],
  )
  const perms = me.data?.permissions ?? []
  return {
    // `ready` gates the forbidden branch so a cold cache never flashes it.
    ready: !me.loading && !me.error,
    can: (p: string) => perms.includes('*') || perms.includes(p),
  }
}

interface OperaAccount {
  id: number
  username: string
  email: string
  employee_name: string
  employee_id: string
  department_id: number | null
  department_name: string | null
  position_id: number | null
  position_name: string | null
  operator_code: string
  roles: string[]
  privileges: string[]
  account_status: string
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
interface Pos {
  id: number
  name: string
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge--ok',
  disabled: 'badge--off',
  expired: 'badge--warn',
}

const EMPTY = {
  username: '',
  email: '',
  employee_name: '',
  employee_id: '',
  department_id: '',
  position_id: '',
  operator_code: '',
  roles: '',
  privileges: '',
  account_status: 'active',
  expiration_date: '',
}
type Form = typeof EMPTY

function toPayload(f: Form) {
  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  return {
    username: f.username,
    email: f.email,
    employee_name: f.employee_name,
    employee_id: f.employee_id,
    department_id: f.department_id ? parseInt(f.department_id) : null,
    position_id: f.position_id ? parseInt(f.position_id) : null,
    operator_code: f.operator_code,
    roles: csv(f.roles),
    privileges: csv(f.privileges),
    account_status: f.account_status,
    expiration_date: f.expiration_date || null,
  }
}

function toForm(a: OperaAccount): Form {
  return {
    username: a.username,
    email: a.email,
    employee_name: a.employee_name,
    employee_id: a.employee_id,
    department_id: a.department_id?.toString() ?? '',
    position_id: a.position_id?.toString() ?? '',
    operator_code: a.operator_code,
    roles: (a.roles ?? []).join(', '),
    privileges: (a.privileges ?? []).join(', '),
    account_status: a.account_status,
    expiration_date: a.expiration_date ?? '',
  }
}

export function OperaList() {
  const { can, ready } = usePerms()
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [pos, setPos] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const params =
    `q=${encodeURIComponent(q)}` +
    (dept ? `&department_id=${dept}` : '') +
    (pos ? `&position_id=${pos}` : '') +
    (status ? `&account_status=${status}` : '') +
    `&page=${page}&page_size=${PAGE_SIZE}`

  const list = useRes<Page<OperaAccount>>(() => api(`${API}?${params}`), [params])
  const depts = useRes<Page<Dept>>(
    () => api('/api/v1/core/departments?page=1&page_size=100'),
    [],
  )
  const positions = useRes<Page<Pos>>(
    () => api('/api/v1/core/positions?page=1&page_size=100'),
    [],
  )

  // Any filter change invalidates the current page number.
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

  const askDelete = (id: number, username: string) => {
    if (!window.confirm(`Delete Opera account "${username}"?`)) return
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
      a.download = 'opera_accounts.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    })

  if (ready && !can('opera.account.view')) {
    return (
      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Opera Cloud</span>
        </div>
        <div className="empty">
          <h3 className="empty__title">No access</h3>
          <p className="empty__text">
            This page needs the <code>opera.account.view</code> permission.
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
            Plugin · opera_cloud
          </p>
          <h1>Opera Cloud</h1>
          <p>
            Local registry of Opera Cloud accounts. No external system is
            called; records are stored here only.
          </p>
        </div>
        {can('opera.account.create') && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setCreating(true)
              setEditing(null)
            }}
          >
            New account
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
            placeholder="search username / email / employee / operator"
            aria-label="Search accounts"
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
          />
        </div>

        <select
          className="select"
          value={dept}
          aria-label="Filter by department"
          onChange={(e) => { setDept(e.target.value); setPage(1) }}
        >
          <option value="">all departments</option>
          {(depts.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <select
          className="select"
          value={pos}
          aria-label="Filter by position"
          onChange={(e) => { setPos(e.target.value); setPage(1) }}
        >
          <option value="">all positions</option>
          {(positions.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          className="select"
          value={status}
          aria-label="Filter by status"
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
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
            className="btn btn--ghost"
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
            className="btn btn--ghost"
            disabled={page >= lastPage || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>

        {can('opera.account.export') && (
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
          <span className="panel__title">Accounts</span>
          <span className="panel__meta">
            {list.loading ? 'loading…' : `${items.length} shown`}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <h3 className="empty__title">
              {list.loading ? 'Loading accounts' : 'No accounts'}
            </h3>
            <p className="empty__text">
              {q || dept || pos || status
                ? 'No account matches the current search or filters.'
                : 'Create the first Opera Cloud account to get started.'}
            </p>
          </div>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>username</th>
                  <th>email</th>
                  <th>employee</th>
                  <th>org</th>
                  <th>operator</th>
                  <th>roles</th>
                  <th>status</th>
                  <th>expires</th>
                  <th className="actions">actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="sub">{a.id}</td>
                    <td className="strong">{a.username}</td>
                    <td className="trunc">{a.email}</td>
                    <td>
                      {a.employee_name}
                      <div className="sub">{a.employee_id}</div>
                    </td>
                    <td>
                      {a.department_name || a.position_name ? (
                        <>
                          {a.department_name || <span className="sub">—</span>}
                          <div className="sub">
                            {a.position_name || 'no position'}
                          </div>
                        </>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td className="sub">{a.operator_code}</td>
                    <td>
                      {a.roles?.length ? (
                        <div className="chips">
                          {a.roles.slice(0, 3).map((r) => (
                            <span className="chip" key={r}>{r}</span>
                          ))}
                          {a.roles.length > 3 && (
                            <span className="chip">+{a.roles.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.account_status] ?? 'badge--off'}`}>
                        {a.account_status}
                      </span>
                    </td>
                    <td className="sub">{a.expiration_date || '—'}</td>
                    <td className="actions">
                      {can('opera.account.edit') && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setEditing(a.id)
                            setCreating(false)
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {can('opera.account.delete') && (
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          disabled={busy}
                          onClick={() => askDelete(a.id, a.username)}
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
        <OperaForm
          id={editing}
          can={can}
          depts={depts.data?.items ?? []}
          positions={positions.data?.items ?? []}
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

function OperaForm({
  id,
  can,
  depts,
  positions,
  onClose,
}: {
  id: number | null
  can: (p: string) => boolean
  depts: Dept[]
  positions: Pos[]
  onClose: () => void
}) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const detail = useRes<OperaAccount>(() => api(`${API}/${id}`), [id], id !== null)

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
        ? api<OperaAccount>(API, { method: 'POST', body })
        : api<OperaAccount>(`${API}/${id}`, { method: 'PUT', body })
    call
      .then(() => onClose())
      .catch((e) => setErr(errOf(e)))
      .finally(() => setBusy(false))
  }

  const allowed = id === null ? can('opera.account.create') : can('opera.account.edit')
  if (!allowed) return null
  if (id !== null && detail.loading && !detail.data) {
    return (
      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Loading account</span>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">
          {id === null ? 'New account' : `Edit account #${id}`}
        </span>
        <span className="panel__meta">
          {id === null ? 'opera.account.create' : 'opera.account.edit'}
        </span>
      </div>

      <div className="panel__body">
        {(err || detail.error) && (
          <div className="alert alert--err" role="alert">{err || detail.error}</div>
        )}

        <div className="fieldgrid">
          <div className="field">
            <label className="label" htmlFor="op-username">username *</label>
            <input id="op-username" className="input" value={form.username}
                   onChange={set('username')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-email">email *</label>
            <input id="op-email" className="input" type="email" value={form.email}
                   onChange={set('email')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-empname">employee name *</label>
            <input id="op-empname" className="input" value={form.employee_name}
                   onChange={set('employee_name')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-empid">employee id *</label>
            <input id="op-empid" className="input" value={form.employee_id}
                   onChange={set('employee_id')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-operator">operator code *</label>
            <input id="op-operator" className="input" value={form.operator_code}
                   onChange={set('operator_code')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-dept">department</label>
            <select id="op-dept" className="select" value={form.department_id}
                    onChange={set('department_id')}>
              <option value="">none</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="op-pos">position</label>
            <select id="op-pos" className="select" value={form.position_id}
                    onChange={set('position_id')}>
              <option value="">none</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="op-status">status</label>
            <select id="op-status" className="select" value={form.account_status}
                    onChange={set('account_status')}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="op-exp">expiration date</label>
            <input id="op-exp" className="input" type="date" value={form.expiration_date}
                   onChange={set('expiration_date')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-roles">roles (csv)</label>
            <input id="op-roles" className="input" value={form.roles}
                   placeholder="e.g. admin, readonly" onChange={set('roles')} />
          </div>
          <div className="field">
            <label className="label" htmlFor="op-priv">privileges (csv)</label>
            <input id="op-priv" className="input" value={form.privileges}
                   placeholder="e.g. export, billing" onChange={set('privileges')} />
          </div>
        </div>

        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : id === null ? 'Create account' : 'Save changes'}
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

export const routes = [{ path: '/opera', element: <OperaList /> }]