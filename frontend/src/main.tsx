import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { RouteObject } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { Layout } from './Layout'
import { Login } from './pages/Login'
import { Users } from './pages/Users'
import { Roles } from './pages/Roles'
import { Departments } from './pages/Departments'
import { Positions } from './pages/Positions'
import { Audit } from './pages/Audit'
import { loadPluginRoutes } from './plugin_registry'
import { api } from './api'
import './styles/tokens.css'
import './styles/app.css'

const qc = new QueryClient()

function Loading() {
  return (
    <div className="empty">
      <p className="hint">loading…</p>
    </div>
  )
}

function RequireAuth({ children, perm }: { children: JSX.Element; perm?: string }) {
  const { me, loading, can } = useAuth()
  if (loading) return <Loading />
  if (!me) return <Navigate to="/login" replace />
  if (perm && !can(perm)) {
    return (
      <div className="panel">
        <div className="empty">
          <h3 className="empty__title">Forbidden</h3>
          <p className="empty__text">
            This page needs the <code className="mono">{perm}</code> permission.
          </p>
        </div>
      </div>
    )
  }
  return children
}

function Home() {
  const { me } = useAuth()
  // core_version comes from the API so it can never drift from the backend.
  // Use /api/v1/health: the vite dev proxy only forwards the /api prefix.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: string; core_version: string; db: string }>('/api/v1/health'),
  })
  const dbOk = health.data?.db === 'up'

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="mono" style={{ color: 'var(--text-accent)' }}>Core</p>
          <h1>Account Registry</h1>
          <p>
            Core knows nothing about account types. Plugins add them — each one ships its own
            routes, permissions and (optionally) background jobs.
          </p>
        </div>
        <span className={dbOk ? 'badge badge--ok' : 'badge badge--danger'}>
          db {health.data?.db ?? '…'}
        </span>
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Signed in</span>
          <span className="panel__meta">core v{health.data?.core_version ?? '…'}</span>
        </div>
        <div className="panel__body">
          <dl className="row" style={{ gap: '.5rem 1.5rem', margin: 0 }}>
            <dt className="mono">username</dt>
            <dd style={{ margin: 0 }}>{me?.username}</dd>
            <dt className="mono">email</dt>
            <dd style={{ margin: 0 }}>{me?.email}</dd>
            <dt className="mono">roles</dt>
            <dd style={{ margin: 0 }}>{me?.roles.map((r) => r.name).join(', ') || '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">How this works</span>
        </div>
        <div className="panel__body">
          <p style={{ color: 'var(--text-body)', lineHeight: 1.6, marginBottom: '.75rem' }}>
            The sidebar is built from <code className="mono">GET /api/v1/core/menu</code>, which merges
            core sections with every loaded plugin's manifest. Items you lack permission for are
            filtered out server-side, and the frontend never hard-codes a plugin name.
          </p>
          <p className="hint">
            Adding a folder under <code>plugins/</code> is enough — no core edits, frontend rebuild only.
          </p>
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="panel">
      <div className="empty">
        <h3 className="empty__title">404 — not found</h3>
        <p className="empty__text">That route does not exist.</p>
        <a className="btn btn--primary" href="/">Back to home</a>
      </div>
    </div>
  )
}

function App() {
  const [pluginRoutes, setPluginRoutes] = useState<RouteObject[]>([])
  // Plugin UI arrives as a dynamic import, so on a cold load of /opera the
  // route table is still empty and the splat route would render 404 for one
  // frame. Hold the whole table back until discovery settles.
  const [routesReady, setRoutesReady] = useState(false)
  useEffect(() => {
    let alive = true
    loadPluginRoutes()
      .then((r) => { if (alive) setPluginRoutes(r) })
      .catch(() => { if (alive) setPluginRoutes([]) })
      .finally(() => { if (alive) setRoutesReady(true) })
    return () => { alive = false }
  }, [])
  return (
    <BrowserRouter>
      <AuthProvider>
        {routesReady ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/" element={<Home />} />
              <Route path="/users" element={<RequireAuth perm="core.user.view"><Users /></RequireAuth>} />
              <Route path="/roles" element={<RequireAuth perm="core.role.view"><Roles /></RequireAuth>} />
              <Route path="/departments" element={<RequireAuth perm="core.department.view"><Departments /></RequireAuth>} />
              <Route path="/positions" element={<RequireAuth perm="core.position.view"><Positions /></RequireAuth>} />
              <Route path="/audit" element={<RequireAuth perm="core.audit.view"><Audit /></RequireAuth>} />
              {pluginRoutes.map((r, i) => (
                <Route key={`plugin-${i}`} path={r.path} element={r.element}>
                  {(r.children ?? []).map((c, j) => (
                    <Route key={`plugin-${i}-${j}`} path={c.path} element={c.element} />
                  ))}
                </Route>
              ))}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        ) : (
          <Loading />
        )}
      </AuthProvider>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}><App /></QueryClientProvider>
  </React.StrictMode>,
)