import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'
import { PageHead, Empty, ErrorNote } from '../Layout'

interface RoleBrief { id: number; name: string }
interface UserOut { id: number; username: string; email: string; is_active: boolean; roles: RoleBrief[] }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }
interface RoleOut { id: number; name: string; description: string }

export function Users() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ username: '', email: '', password: '', role_ids: '' })

  const list = useQuery({
    queryKey: ['users', q, page],
    queryFn: () => api<Page<UserOut>>(
      `/api/v1/core/users?q=${encodeURIComponent(q)}&page=${page}&page_size=20`,
    ),
  })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleOut[]>('/api/v1/core/roles') })

  const create = useMutation({
    mutationFn: () => api<UserOut>('/api/v1/core/users', {
      method: 'POST',
      body: JSON.stringify({
        username: form.username,
        email: form.email,
        password: form.password,
        role_ids: form.role_ids ? form.role_ids.split(',').map((s) => parseInt(s.trim())).filter(Boolean) : [],
      }),
    }),
    onSuccess: () => {
      setForm({ username: '', email: '', password: '', role_ids: '' })
      setErr('')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => setErr(errMsg(e)),
  })

  const toggle = useMutation({
    mutationFn: (u: UserOut) => api<UserOut>(`/api/v1/core/users/${u.id}`, {
      method: 'PUT', body: JSON.stringify({ is_active: !u.is_active }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => setErr(errMsg(e)),
  })

  const canManage = can('core.user.manage')
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  return (
    <div>
      <PageHead
        kicker="Core · core.user"
        title="Users"
        lead="Accounts that can sign in. Users have no delete endpoint — deactivate instead."
      />

      <ErrorNote>{err}</ErrorNote>

      <div className="panel">
        <div className="panel__head">
          <div className="toolbar" style={{ flex: 1 }}>
            <div className="search">
              <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                className="input" value={q} placeholder="search username or email"
                aria-label="Search users"
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
              />
            </div>
            <div className="pager">
              <button className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span>page {page} · {total} total</span>
              <button
                className="btn btn--ghost"
                disabled={items.length === 0 || page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <Empty title="No users found">
            {q ? 'No user matches that search.' : 'No accounts yet.'}
          </Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>id</th><th>username</th><th>email</th>
                  <th>status</th><th>roles</th>
                  {canManage && <th className="actions">action</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="sub">{u.id}</td>
                    <td className="strong">{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={u.is_active ? 'badge badge--ok' : 'badge badge--off'}>
                        {u.is_active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td>
                      {u.roles.length === 0
                        ? <span className="sub">—</span>
                        : <div className="chips">{u.roles.map((r) => <span key={r.id} className="chip">{r.name}</span>)}</div>}
                    </td>
                    {canManage && (
                      <td className="actions">
                        <button
                          className={u.is_active ? 'btn btn--ghost' : 'btn btn--primary'}
                          onClick={() => toggle.mutate(u)}
                          disabled={toggle.isPending}
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && (
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Create user</span>
            <span className="panel__meta">core.user.manage</span>
          </div>
          <div className="panel__body">
            <div className="fieldgrid">
              <div className="field">
                <label className="label" htmlFor="nu">username</label>
                <input id="nu" className="input" value={form.username} placeholder="a-z 0-9 _ . -"
                  onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="ne">email</label>
                <input id="ne" className="input" type="email" value={form.email} placeholder="name@company.vn"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="np">password</label>
                <input id="np" className="input" type="password" value={form.password} placeholder="min 8 chars"
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="nr">role ids</label>
                <input id="nr" className="input" value={form.role_ids} placeholder="csv, e.g. 1,2"
                  title={(roles.data ?? []).map((r) => `${r.id}=${r.name}`).join('  ')}
                  onChange={(e) => setForm({ ...form, role_ids: e.target.value })} />
              </div>
              <div className="field">
                <button
                  className="btn btn--primary" style={{ width: '100%' }}
                  onClick={() => create.mutate()} disabled={create.isPending}
                >
                  {create.isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
            <p className="hint" style={{ marginTop: '.75rem' }}>
              roles: {(roles.data ?? []).map((r) => `${r.id}=${r.name}`).join('   ') || 'none'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}