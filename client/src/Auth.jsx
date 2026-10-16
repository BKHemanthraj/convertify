import { useState } from 'react';
import { X, Mail, Lock, User, Sparkles, Zap, Layers, ShieldCheck } from 'lucide-react';
export default function Auth({ initial = 'login', onClose, onAuth, t = k => k }) {
  const [tab, setTab] = useState(initial), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState(''), [load, setLoad] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr(''); setLoad(true);
    try {
      const r = await fetch(`/api/auth/${tab}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const txt = await r.text(); let d = {}; try { d = JSON.parse(txt); } catch {}
      if (!r.ok || !d.token) throw new Error(d.error || 'The server is not responding. Make sure the app is running (npm run dev) and try again.'); onAuth(d);
    } catch (x) { setErr(x.message === 'Failed to fetch' ? 'The server is not responding. Make sure the app is running (npm run dev) and try again.' : x.message); }
    setLoad(false);
  };
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <aside>
          <div className="logo big"><Sparkles size={22} /></div>
          <h2>Convert anything,<br />beautifully.</h2>
          <p>Create a free account to keep your workspace in sync.</p>
          <ul><li><Zap size={16} /> Lightning-fast trims & splits</li><li><Layers size={16} /> Batch convert many files</li><li><ShieldCheck size={16} /> Files auto-deleted after 1 hour</li></ul>
        </aside>
        <section>
          <div className="tabs"><button className={tab === 'login' ? 'on' : ''} onClick={() => { setTab('login'); setErr(''); }}>{t('login')}</button><button className={tab === 'signup' ? 'on' : ''} onClick={() => { setTab('signup'); setErr(''); }}>{t('signup')}</button></div>
          <h3>{tab === 'login' ? 'Welcome back 👋' : 'Create your account'}</h3>
          <form onSubmit={submit}>
            {tab === 'signup' && <label className="in"><User size={17} /><input placeholder="Full name" value={f.name} onChange={set('name')} required /></label>}
            <label className="in"><Mail size={17} /><input type="email" placeholder="Email address" value={f.email} onChange={set('email')} required /></label>
            <label className="in"><Lock size={17} /><input type="password" placeholder="Password (min 6 characters)" value={f.password} onChange={set('password')} required /></label>
            {err && <p className="err">{err}</p>}
            <button className="btn primary full" disabled={load}>{load ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}</button>
          </form>
          <button className="link center" onClick={onClose}>{t('skip')}</button>
        </section>
      </div>
    </div>
  );
}
