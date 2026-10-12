import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'

interface Pos { id: number; name: string; description: string; department_id: number | null; department_name: string | null }
interface Dept { id: number; name: string; description: string }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export function Positions() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [name, setName] = useState('')
  const [deptId, setDeptId] = useState('')
  const list = useQuery({ queryKey: ['positions', deptFilter], queryFn: () => api<Page<Pos>>(`/api/v1/core/positions?page=1&page_size=100${deptFilter ? `&department_id=${deptFilter}` : ''}`) })
  const depts = useQuery({ queryKey: ['depts'], queryFn: () => api<Page<Dept>>('/api/v1/core/departments?page=1&page_size=100') })
  const create = useMutation({
    mutationFn: () => api<Pos>('/api/v1/core/positions', { method: 'POST', body: JSON.stringify({ name, department_id: deptId ? parseInt(deptId) : null }) }),
    onSuccess: () => { setName(''); setDeptId(''); setErr(''); qc.invalidateQueries({ queryKey: ['positions'] }) },
    onError: (e) => setErr(errMsg(e)),
  })
  const canManage = can('core.position.manage')
  return (
    <div>
      <h2>Positions</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">all departments</option>
          {(depts.data?.items ?? []).map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </div>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>id</th><th>name</th><th>department</th></tr></thead>
        <tbody>{(list.data?.items ?? []).map(p => (<tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.department_name ?? p.department_id ?? '-'}</td></tr>))}</tbody>
      </table>
      {canManage && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="new position name" />
          <input value={deptId} onChange={e => setDeptId(e.target.value)} placeholder="dept id (optional)" style={{ width: 140 }} />
          <button onClick={() => create.mutate()}>Create</button>
        </div>
      )}
    </div>
  )
}
