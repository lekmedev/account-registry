import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errMsg } from '../api'
import { useAuth } from '../auth'
import { PageHead, Empty, ErrorNote } from '../Layout'

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
    mutationFn: () => api<RoleOut>('/api/v1/core/roles', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: '',
        permission_codes: codes ? codes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      }),
    }),
    onSuccess: () => { setName(''); setCodes(''); setErr(''); qc.invalidateQueries({ queryKey: ['roles'] }) },
    onError: (e) => setErr(errMsg(e)),
  })

  const canManage = can('core.role.manage')
  const items = roles.data ?? []

  return (
    <div>
      <PageHead
        kicker="Core · core.role"
        title="Roles"
        lead="A role carries a set of permission codes. The role named admin implicitly has all of them."
      />

      <ErrorNote>{err}</ErrorNote>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Roles</span>
          <span className="panel__meta">{items.length} total</span>
        </div>

        {items.length === 0 ? (
          <Empty title="No roles">Create the first role to start granting permissions.</Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr><th>id</th><th>name</th><th>description</th><th>permissions</th></tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="sub">{r.id}</td>
                    <td className="strong">{r.name}</td>
                    <td>{r.description || <span className="sub">—</span>}</td>
                    <td>
                      {r.permissions.length === 0
                        ? <span className="sub">none</span>
                        : <div className="chips">{r.permissions.map((p) => (
                            <span key={p.id} className="chip" title={p.description}>{p.code}</span>
                          ))}</div>}
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
            <span className="panel__title">Create role</span>
            <span className="panel__meta">core.role.manage</span>
          </div>
          <div className="panel__body">
            <div className="fieldgrid">
              <div className="field">
                <label className="label" htmlFor="rn">name</label>
                <input id="rn" className="input" value={name} placeholder="a-z 0-9 _ . -"
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label className="label" htmlFor="rc">permission codes</label>
                <input id="rc" className="input" value={codes} placeholder="comma separated"
                  onChange={(e) => setCodes(e.target.value)} />
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
              all codes: {(perms.data ?? []).map((p) => p.code).join('  ') || 'none'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}