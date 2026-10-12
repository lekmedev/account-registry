import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'

interface RoleBrief { id: number; name: string }
interface UserOut { id: number; username: string; email: string; is_active: boolean; roles: RoleBrief[]; permissions: string[] }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }
interface RoleOut { id: number; name: string; description: string }

export function Users() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ username: '', email: '', password: '', role_ids: '' })
  const list = useQuery({ queryKey: ['users', q, page], queryFn: () => api<Page<UserOut>>(`/api/v1/core/users?q=${encodeURIComponent(q)}&page=${page}&page_size=20`) })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleOut[]>('/api/v1/core/roles') })
  const create = useMutation({
    mutationFn: () => api<UserOut>('/api/v1/core/users', { method: 'POST', body: JSON.stringify({ username: form.username, email: form.email, password: form.password, role_ids: form.role_ids ? form.role_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean) : [] }) }),
    onSuccess: () => { setForm({ username: '', email: '', password: '', role_ids: '' }); setErr(''); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (e) => setErr(errMsg(e)),
  })
  const toggle = useMutation({
    mutationFn: (u: UserOut) => api<UserOut>(`/api/v1/core/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !u.is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => setErr(errMsg(e)),
  })
  const canManage = can('core.user.manage')
  return (
    <div>
      <h2>Users</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="search username/email" />
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
        <span>page {page} / total {list.data?.total ?? '?'}</span>
        <button onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>id</th><th>username</th><th>email</th><th>active</th><th>roles</th>{canManage && <th>action</th>}</tr></thead>
        <tbody>{(list.data?.items ?? []).map(u => (
          <tr key={u.id}><td>{u.id}</td><td>{u.username}</td><td>{u.email}</td><td>{String(u.is_active)}</td><td>{u.roles.map(r => r.name).join(',')}</td>
          {canManage && <td><button onClick={() => toggle.mutate(u)}>{u.is_active ? 'Disable' : 'Enable'}</button></td>}</tr>
        ))}</tbody>
      </table>
      {canManage && (
        <div style={{ marginTop: 16 }}>
          <h3>Create user</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="username" />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email" />
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="password (8+)" />
            <input value={form.role_ids} onChange={e => setForm({ ...form, role_ids: e.target.value })} placeholder="role ids csv" title={(roles.data ?? []).map(r => `${r.id}=${r.name}`).join(' ')} />
            <button onClick={() => create.mutate()}>Create</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>roles: {(roles.data ?? []).map(r => `${r.id}=${r.name}`).join(' ')}</div>
        </div>
      )}
    </div>
  )
}
