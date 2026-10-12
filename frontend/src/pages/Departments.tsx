import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'

interface Dept { id: number; name: string; description: string }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export function Departments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const list = useQuery({ queryKey: ['depts'], queryFn: () => api<Page<Dept>>('/api/v1/core/departments?page=1&page_size=100') })
  const create = useMutation({
    mutationFn: () => api<Dept>('/api/v1/core/departments', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => { setName(''); setErr(''); qc.invalidateQueries({ queryKey: ['depts'] }) },
    onError: (e) => setErr(errMsg(e)),
  })
  const canManage = can('core.department.manage')
  return (
    <div>
      <h2>Departments</h2>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>id</th><th>name</th><th>description</th></tr></thead>
        <tbody>{(list.data?.items ?? []).map(d => (<tr key={d.id}><td>{d.id}</td><td>{d.name}</td><td>{d.description}</td></tr>))}</tbody>
      </table>
      {canManage && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="new department name" />
          <button onClick={() => create.mutate()}>Create</button>
        </div>
      )}
    </div>
  )
}
