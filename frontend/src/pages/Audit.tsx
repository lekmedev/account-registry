import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

interface Entry { id: number; actor_id: number | null; actor_username: string | null; action: string; resource: string; resource_id: string | null; details: Record<string, unknown> | null; created_at: string }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export function Audit() {
  const [action, setAction] = useState('')
  const [resource, setResource] = useState('')
  const [page, setPage] = useState(1)
  const q = `/api/v1/core/audit?page=${page}&page_size=20${action ? `&action=${encodeURIComponent(action)}` : ''}${resource ? `&resource=${encodeURIComponent(resource)}` : ''}`
  const list = useQuery({ queryKey: ['audit', action, resource, page], queryFn: () => api<Page<Entry>>(q) })
  return (
    <div>
      <h2>Audit log</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={action} onChange={e => { setAction(e.target.value); setPage(1) }} placeholder="filter action" />
        <input value={resource} onChange={e => { setResource(e.target.value); setPage(1) }} placeholder="filter resource" />
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
        <span>page {page} / total {list.data?.total ?? '?'}</span>
        <button onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead><tr><th>id</th><th>time</th><th>actor</th><th>action</th><th>resource</th><th>res_id</th><th>details</th></tr></thead>
        <tbody>{(list.data?.items ?? []).map(a => (
          <tr key={a.id}><td>{a.id}</td><td>{a.created_at}</td><td>{a.actor_username ?? a.actor_id ?? 'system'}</td><td>{a.action}</td><td>{a.resource}</td><td>{a.resource_id}</td><td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(a.details)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}
