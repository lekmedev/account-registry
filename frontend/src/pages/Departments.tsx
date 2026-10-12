import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'
import { PageHead, Empty, ErrorNote } from '../Layout'

interface Dept { id: number; name: string; description: string }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export function Departments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [name, setName] = useState('')

  const list = useQuery({
    queryKey: ['depts'],
    queryFn: () => api<Page<Dept>>('/api/v1/core/departments?page=1&page_size=100'),
  })
  const create = useMutation({
    mutationFn: () => api<Dept>('/api/v1/core/departments', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => { setName(''); setErr(''); qc.invalidateQueries({ queryKey: ['depts'] }) },
    onError: (e) => setErr(errMsg(e)),
  })

  const canManage = can('core.department.manage')
  const items = list.data?.items ?? []

  return (
    <div>
      <PageHead
        kicker="Core · core.department"
        title="Departments"
        lead="Referenced by positions and by plugin records. Deleting a department nulls those references instead of cascading."
      />

      <ErrorNote>{err}</ErrorNote>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Departments</span>
          <span className="panel__meta">{items.length} total</span>
        </div>

        {items.length === 0 ? (
          <Empty title="No departments">Create one to group positions and plugin records.</Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead><tr><th>id</th><th>name</th><th>description</th></tr></thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td className="sub">{d.id}</td>
                    <td className="strong">{d.name}</td>
                    <td>{d.description || <span className="sub">—</span>}</td>
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
            <span className="panel__title">Create department</span>
            <span className="panel__meta">core.department.manage</span>
          </div>
          <div className="panel__body">
            <div className="fieldgrid">
              <div className="field">
                <label className="label" htmlFor="dn">name</label>
                <input id="dn" className="input" value={name} placeholder="e.g. Engineering"
                  onChange={(e) => setName(e.target.value)} />
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