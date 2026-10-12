import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'

interface Perm { id: number; code: string; description: string }
interface RoleOut { id: number; name: string; description: string; permissions: Perm[] }

export function Roles() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [codes, setCodes] = useState('')
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleOut[]>('/api/v1/core/roles') })
  const perms = useQuery({ queryKey: ['perms'], queryFn: () => api<Perm[]>('/api/v1/core/permissions') })
  const create = useMutation({
    mutationFn: () => api<RoleOut>('/api/v1/core/roles', { method: 'POST', body: JSON.stringify({ name, description: '', permission_codes: codes ? codes.split(',').map(s => s.trim()).filter(Boolean) : [] }) }),
    onSuccess: () => { setName(''); setCodes(''); setErr(''); qc.invalidateQueries({ queryKey: ['roles'] }) },
    onError: (e) => setErr(errMsg(e)),
  })
  const canManage = can('core.role.manage')
  return (
    <div>
      <h2>Roles</h2>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>id</th><th>name</th><th>permissions</th></tr></thead>
        <tbody>{(roles.data ?? []).map(r => (
          <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td style={{ fontSize: 12 }}>{r.permissions.map(p => p.code).join(', ')}</td></tr>
        ))}</tbody>
      </table>
      {canManage && (
        <div style={{ marginTop: 16, display: 'flex', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="name (a-z0-9_.-)" />
          <input value={codes} onChange={e => setCodes(e.target.value)} placeholder="perm codes csv" style={{ width: 320 }} />
          <button onClick={() => create.mutate()}>Create</button>
        </div>
      )}
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>all perms: {(perms.data ?? []).map(p => p.code).join(', ')}</div>
    </div>
  )
}
