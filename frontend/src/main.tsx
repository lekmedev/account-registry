import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const qc = new QueryClient()

function RequireAuth({ children, perm }: { children: JSX.Element; perm?: string }) {
  const { me, loading, can } = useAuth()
  if (loading) return <div>loading...</div>
  if (!me) return <Navigate to="/login" replace />
  if (perm && !can(perm)) return <div>forbidden (needs {perm})</div>
  return children
}

function Home() {
  const { me } = useAuth()
  return <div><h2>Welcome, {me?.username}</h2><p>Use the menu. Plugin pages appear automatically when granted.</p></div>
}

function App() {
  const [pluginRoutes, setPluginRoutes] = useState<RouteObject[]>([])
  useEffect(() => { loadPluginRoutes().then(setPluginRoutes).catch(() => {}) }, [])
  return (
    <BrowserRouter>
      <AuthProvider>
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
          <Route path="*" element={<div>not found — <a href="/">home</a></div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}><App /></QueryClientProvider>
  </React.StrictMode>,
)
