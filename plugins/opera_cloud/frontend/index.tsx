// opera_cloud plugin UI — self-contained (no imports from core src:
// plugin globs resolve from different roots on host vs Docker, so relative
// imports into frontend/src would break). Minimal api + permission logic
// is duplicated here; core never names this plugin (see plugin_registry).
import { useState, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const API = '/api/v1/plugins/opera_cloud/accounts';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = localStorage.getItem('access_token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof (body as any).detail === 'string' ? (body as any).detail : JSON.stringify((body as any).detail ?? body));
  return body as T;
}

function usePerms() {
  const mq = useQuery({
    queryKey: ['opera-me'],
    queryFn: () => api<{ permissions: string[] }>('/api/v1/core/auth/me'),
  });
  const perms = mq.data?.permissions ?? [];
  const can = (p: string) => perms.includes('*') || perms.includes(p);
  return { can };
}

interface OperaAccount {
  id: number; username: string; email: string; employee_name: string;
  employee_id: string; department_id: number | null; department_name: string | null;
  position_id: number | null; position_name: string | null; operator_code: string;
  roles: string[]; privileges: string[]; account_status: string;
  expiration_date: string | null;
}
interface Page<T> { items: T[]; total: number; page: number; page_size: number }
interface Dept { id: number; name: string }
interface Pos { id: number; name: string }

const EMPTY = { username: '', email: '', employee_name: '', employee_id: '', department_id: '', position_id: '', operator_code: '', roles: '', privileges: '', account_status: 'active', expiration_date: '' };

function toPayload(f: typeof EMPTY) {
  return {
    username: f.username, email: f.email, employee_name: f.employee_name,
    employee_id: f.employee_id,
    department_id: f.department_id ? parseInt(f.department_id) : null,
    position_id: f.position_id ? parseInt(f.position_id) : null,
    operator_code: f.operator_code,
    roles: f.roles ? f.roles.split(',').map((s) => s.trim()).filter(Boolean) : [],
    privileges: f.privileges ? f.privileges.split(',').map((s) => s.trim()).filter(Boolean) : [],
    account_status: f.account_status,
    expiration_date: f.expiration_date || null,
  };
}

export function OperaList() {
  const { can } = usePerms();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [pos, setPos] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const params = `q=${encodeURIComponent(q)}${dept ? `&department_id=${dept}` : ''}${pos ? `&position_id=${pos}` : ''}${status ? `&account_status=${status}` : ''}&page=${page}&page_size=20`;
  const list = useQuery({ queryKey: ['opera', q, dept, pos, status, page], queryFn: () => api<Page<OperaAccount>>(`${API}?${params}`) });
  const depts = useQuery({ queryKey: ['opera-depts'], queryFn: () => api<Page<Dept>>('/api/v1/core/departments?page=1&page_size=100'), retry: false });
  const positions = useQuery({ queryKey: ['opera-pos'], queryFn: () => api<Page<Pos>>('/api/v1/core/positions?page=1&page_size=100'), retry: false });

  const del = useMutation({
    mutationFn: (id: number) => api(`${API}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['opera'] }); },
    onError: (e) => setErr(e instanceof Error ? e.message : 'delete_failed'),
  });

  const doExport = async () => {
    try {
      const access = localStorage.getItem('access_token');
      const res = await fetch(`${BASE}${API}/export?${params}`, { headers: access ? { Authorization: `Bearer ${access}` } : {} });
      if (!res.ok) throw new Error(`export_failed_${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'opera_accounts.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : 'export_failed'); }
  };

  const askDelete = (id: number, username: string) => {
    if (window.confirm(`Delete Opera account "${username}"?`)) del.mutate(id);
  };

  if (!can('opera.account.view')) return <div>forbidden (needs opera.account.view)</div>;

  return (
    <div>
      <h2>Opera Cloud</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="search username/email/employee/operator" style={{ width: 280 }} />
        <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
          <option value="">all departments</option>
          {(depts.data?.items ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={pos} onChange={(e) => { setPos(e.target.value); setPage(1); }}>
          <option value="">all positions</option>
          {(positions.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">all statuses</option>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
          <option value="expired">expired</option>
        </select>
        <button disabled={page <= 1} onClick={() => setPage((p: number) => p - 1)}>Prev</button>
        <span>page {page} / total {list.data?.total ?? '?'}</span>
        <button onClick={() => setPage((p: number) => p + 1)}>Next</button>
        {can('opera.account.export') && <button onClick={doExport}>Export .xlsx</button>}
        {can('opera.account.create') && <button onClick={() => { setCreating(true); setEditing(null); }}>New account</button>}
      </div>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>id</th><th>username</th><th>email</th><th>employee</th><th>operator</th><th>status</th><th>actions</th></tr></thead>
        <tbody>{(list.data?.items ?? []).map((a) => (
          <tr key={a.id}>
            <td>{a.id}</td><td>{a.username}</td><td>{a.email}</td>
            <td>{a.employee_name} ({a.employee_id})</td><td>{a.operator_code}</td><td>{a.account_status}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {can('opera.account.edit') && <button onClick={() => { setEditing(a.id); setCreating(false); }}>Edit</button>}
              {can('opera.account.delete') && <button onClick={() => askDelete(a.id, a.username)}>Delete</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
      {(creating || editing !== null) && (
        <OperaForm
          id={editing}
          onClose={() => { setCreating(false); setEditing(null); qc.invalidateQueries({ queryKey: ['opera'] }); }}
        />
      )}
    </div>
  );
}

function OperaForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { can } = usePerms();
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(id === null);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const detail = useQuery({
    queryKey: ['opera-one', id], enabled: id !== null,
    queryFn: () => api<OperaAccount>(`${API}/${id}`),
  });
  if (id !== null && detail.data && !loaded) {
    const a = detail.data;
    setForm({
      username: a.username, email: a.email, employee_name: a.employee_name,
      employee_id: a.employee_id, department_id: a.department_id?.toString() ?? '',
      position_id: a.position_id?.toString() ?? '', operator_code: a.operator_code,
      roles: (a.roles ?? []).join(','), privileges: (a.privileges ?? []).join(','),
      account_status: a.account_status, expiration_date: a.expiration_date ?? '',
    });
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: () => id === null
      ? api<OperaAccount>(API, { method: 'POST', body: JSON.stringify(toPayload(form)) })
      : api<OperaAccount>(`${API}/${id}`, { method: 'PUT', body: JSON.stringify(toPayload(form)) }),
    onSuccess: onClose,
    onError: (e) => setErr(e instanceof Error ? e.message : 'save_failed'),
  });

  const allowed = id === null ? can('opera.account.create') : can('opera.account.edit');
  if (!allowed) return <div>forbidden</div>;
  if (!loaded) return <div>loading...</div>;
  const inp = { style: { width: '100%', marginBottom: 6 } };
  return (
    <div style={{ marginTop: 16, border: '1px solid #ccc', padding: 12, maxWidth: 520 }}>
      <h3>{id === null ? 'New Opera account' : `Edit #${id}`}</h3>
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <input {...inp} value={form.username} onChange={set('username')} placeholder="username *" />
      <input {...inp} value={form.email} onChange={set('email')} placeholder="email *" />
      <input {...inp} value={form.employee_name} onChange={set('employee_name')} placeholder="employee name *" />
      <input {...inp} value={form.employee_id} onChange={set('employee_id')} placeholder="employee id *" />
      <input {...inp} value={form.operator_code} onChange={set('operator_code')} placeholder="operator code *" />
      <input {...inp} value={form.department_id} onChange={set('department_id')} placeholder="department id (optional)" />
      <input {...inp} value={form.position_id} onChange={set('position_id')} placeholder="position id (optional)" />
      <input {...inp} value={form.roles} onChange={set('roles')} placeholder="roles csv (optional)" />
      <input {...inp} value={form.privileges} onChange={set('privileges')} placeholder="privileges csv (optional)" />
      <select value={form.account_status} onChange={set('account_status')} style={{ width: '100%', marginBottom: 6 }}>
        <option value="active">active</option>
        <option value="disabled">disabled</option>
        <option value="expired">expired</option>
      </select>
      <input {...inp} type="date" value={form.expiration_date} onChange={set('expiration_date')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => save.mutate()}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export const routes = [{ path: '/opera', element: <OperaList /> }];
