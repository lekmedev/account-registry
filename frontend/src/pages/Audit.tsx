import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { PageHead, Empty } from '../Layout'

interface Entry {
  id: number
  actor_id: number | null
  actor_username: string | null
  action: string
  resource: string
  resource_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

function actionBadge(action: string) {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('remove')) return 'badge badge--danger'
  if (a.includes('create') || a.includes('login')) return 'badge badge--ok'
  if (a.includes('update') || a.includes('put')) return 'badge badge--warn'
  return 'badge badge--info'
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function Audit() {
  const [action, setAction] = useState('')
  const [resource, setResource] = useState('')
  const [page, setPage] = useState(1)

  const q = `/api/v1/core/audit?page=${page}&page_size=20${
    action ? `&action=${encodeURIComponent(action)}` : ''
  }${resource ? `&resource=${encodeURIComponent(resource)}` : ''}`

  const list = useQuery({
    queryKey: ['audit', action, resource, page],
    queryFn: () => api<Page<Entry>>(q),
  })

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  return (
    <div>
      <PageHead
        kicker="Core · core.audit"
        title="Audit log"
        lead="Every create, update and delete across core and plugins writes one entry. System jobs log with no actor."
      />

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <div className="search" style={{ maxWidth: 260 }}>
          <input className="input" value={action} placeholder="filter action"
            aria-label="Filter by action"
            onChange={(e) => { setAction(e.target.value); setPage(1) }} />
        </div>
        <div className="search" style={{ maxWidth: 260 }}>
          <input className="input" value={resource} placeholder="filter resource"
            aria-label="Filter by resource"
            onChange={(e) => { setResource(e.target.value); setPage(1) }} />
        </div>
        <span className="spacer" />
        <div className="pager">
          <button className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
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

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Entries</span>
          <span className="panel__meta">{items.length} on this page</span>
        </div>

        {items.length === 0 ? (
          <Empty title="No entries">
            {action || resource ? 'No entry matches that filter.' : 'Nothing has happened yet.'}
          </Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>id</th><th>time</th><th>actor</th>
                  <th>action</th><th>resource</th><th>res id</th><th>details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="sub">{a.id}</td>
                    <td className="sub">{fmtTime(a.created_at)}</td>
                    <td className="strong">
                      {a.actor_username ?? <span className="sub">system · {a.actor_id ?? '—'}</span>}
                    </td>
                    <td><span className={actionBadge(a.action)}>{a.action}</span></td>
                    <td>{a.resource}</td>
                    <td className="sub">{a.resource_id ?? '—'}</td>
                    <td className="trunc" title={a.details ? JSON.stringify(a.details) : ''}>
                      {a.details ? JSON.stringify(a.details) : <span className="sub">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}