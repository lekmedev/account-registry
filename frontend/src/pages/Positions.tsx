import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'
import { PageHead, Empty, ErrorNote } from '../Layout'

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

  const list = useQuery({
    queryKey: ['positions', deptFilter],
    queryFn: () => api<Page<Pos>>(
      `/api/v1/core/positions?page=1&page_size=100${deptFilter ? `&department_id=${deptFilter}` : ''}`,
    ),
  })
  const depts = useQuery({
    queryKey: ['depts'],
    queryFn: () => api<Page<Dept>>('/api/v1/core/departments?page=1&page_size=100'),
  })
  const create = useMutation({
    mutationFn: () => api<Pos>('/api/v1/core/positions', {
      method: 'POST',
      body: JSON.stringify({ name, department_id: deptId ? parseInt(deptId) : null }),
    }),
    onSuccess: () => { setName(''); setDeptId(''); setErr(''); qc.invalidateQueries({ queryKey: ['positions'] }) },
    onError: (e) => setErr(errMsg(e)),
  })

  const canManage = can('core.position.manage')
  const items = list.data?.items ?? []

  return (
    <div>
      <PageHead
        kicker="Core · core.position"
        title="Positions"
        lead="A position may belong to a department. The link is optional and survives department deletion."
      />

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <label className="mono" htmlFor="df">department</label>
        <select id="df" className="select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">all departments</option>
          {(depts.data?.items ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="pager">{items.length} shown</span>
      </div>

      <ErrorNote>{err}</ErrorNote>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Positions</span>
          <span className="panel__meta">{items.length} total</span>
        </div>

        {items.length === 0 ? (
          <Empty title="No positions">
            {deptFilter ? 'This department has no positions yet.' : 'Create one to attach to plugin records.'}
          </Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead><tr><th>id</th><th>name</th><th>department</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="sub">{p.id}</td>
                    <td className="strong">{p.name}</td>
                    <td>
                      {p.department_name
                        ? <span className="chip">{p.department_name}</span>
                        : <span className="sub">unassigned</span>}
                    </td>
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
            <span className="panel__title">Create position</span>
            <span className="panel__meta">core.position.manage</span>
          </div>
          <div className="panel__body">
            <div className="fieldgrid">
              <div className="field">
                <label className="label" htmlFor="pn">name</label>
                <input id="pn" className="input" value={name} placeholder="e.g. Backend Engineer"
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="pd">department</label>
                <select id="pd" className="select" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">unassigned</option>
                  {(depts.data?.items ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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
          </div>
        </div>
      )}
    </div>
  )
}