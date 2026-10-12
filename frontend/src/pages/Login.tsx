import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { errMsg } from '../api'

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try { await login(username, password); nav('/') }
    catch (e) { setErr(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <span className="side__mark" aria-hidden="true">AR</span>
          <div className="side__name">Account Registry</div>
        </div>

        <h1 className="login__title">Sign in</h1>
        <p className="login__lead">Use your core account. Menu access follows your role.</p>

        {err && <div className="alert alert--err" role="alert">{err}</div>}

        <form className="login__form" onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="u">Username</label>
            <input
              id="u" className="input" value={username} autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} placeholder="username"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="p">Password</label>
            <input
              id="p" className="input" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} placeholder="password"
            />
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login__hint">
          dev seed — <code>admin</code> / <code>Admin123!</code>
        </p>
      </div>
    </div>
  )
}