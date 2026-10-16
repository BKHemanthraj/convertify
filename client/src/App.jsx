import { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Film, Music, Minimize2, FileText, UploadCloud, X, Download, Scissors, CheckCircle2, AlertCircle, Loader2, LogOut, Zap, Layers, ShieldCheck, Sparkles, RefreshCw, Plus, Trash2, Globe, ChevronDown, Settings2, RotateCcw, Infinity as Inf } from 'lucide-react';
import Auth from './Auth.jsx';
import { LANGS, T } from './i18n.js';

const TOOLS = {
  image: { icon: ImageIcon, d: 'dImage', accept: 'image/*', formats: ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'ico'] },
  video: { icon: Film, d: 'dVideo', accept: 'video/*', formats: ['mp4', 'webm', 'mov', 'mkv', 'gif'] },
  audio: { icon: Music, d: 'dAudio', accept: 'audio/*,video/*', formats: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'] },
  compress: { icon: Minimize2, d: 'dCompress', accept: 'image/*,video/*,.pdf,application/pdf', formats: [] }
};
const DEF = {
  image: { quality: 85, resizeMode: 'none', w: '', h: '', pct: 50, rotate: 0, flip: 'none', gray: false },
  video: { height: 0, fast: true, edit: 'none', start: 0, end: 0, splitMin: '', ranges: [], merge: false },
  audio: { bitrate: 192, volume: 100, mono: false, trim: false, start: 0, end: 0 },
  compress: { level: 'balanced', maxDim: 0, outFmt: 'same', height: 0, targetMB: '' }
};
const size = b => !b ? '' : b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const fmtT = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const parseT = t => String(t).trim().split(':').reverse().reduce((a, v, i) => a + (parseFloat(v) || 0) * 60 ** i, 0);
const kindOf = f => /pdf/.test(f.type) || /\.pdf$/i.test(f.name) ? 'pdf' : (f.type || '').startsWith('video/') ? 'video' : 'image';

function TimeBox({ value, onCommit }) {
  const [t, setT] = useState(fmtT(value)); useEffect(() => setT(fmtT(value)), [value]);
  return <input className="time" value={t} onChange={e => setT(e.target.value)} onBlur={() => onCommit(parseT(t))} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />;
}
function Trimmer({ dur, start, end, onChange, media, title }) {
  const seek = v => { if (media.current) media.current.currentTime = v; };
  const setS = v => { v = Math.max(0, Math.min(v, end - 0.5)); onChange(v, end); seek(v); };
  const setE = v => { v = Math.min(dur, Math.max(v, start + 0.5)); onChange(start, v); seek(v); };
  if (!dur) return <p className="hint">Loading length…</p>;
  return (
    <div className="trim">
      {title && <h4>{title}</h4>}
      {[['Start', start, setS], ['End', end, setE]].map(([n, v, fn]) => (
        <div className="trim-row" key={n}><span>{n}</span>
          <input type="range" min="0" max={dur} step="0.1" value={v} onChange={e => fn(+e.target.value)} />
          <TimeBox value={v} onCommit={fn} />
          <button className="tbtn" onClick={() => fn(media.current?.currentTime || 0)}>Use player time</button></div>))}
      <p className="hint"><Scissors size={14} /> Keeping <b>{fmtT(end - start)}</b> of {fmtT(dur)}. Type exact times like <b>1:30:00</b>.</p>
    </div>
  );
}
function Ranges({ ranges, merge, dur, onChange, onMerge, media, canMerge }) {
  if (!dur) return <p className="hint">Loading video length…</p>;
  const upd = (i, p) => onChange(ranges.map((r, k) => k === i ? { ...r, ...p } : r)), now = () => media.current?.currentTime || 0;
  const setS = (i, v) => { v = Math.max(0, Math.min(v, ranges[i].end - 0.5)); upd(i, { start: v }); if (media.current) media.current.currentTime = v; };
  const setE = (i, v) => upd(i, { end: Math.min(dur, Math.max(v, ranges[i].start + 0.5)) });
  const add = () => { const s = ranges.length ? Math.min(dur - 1, ranges[ranges.length - 1].end) : 0; onChange([...ranges, { start: s, end: Math.min(dur, s + 60) }]); };
  const total = ranges.reduce((a, r) => a + Math.max(0, r.end - r.start), 0);
  return (
    <div className="ranges">
      {ranges.map((r, i) => (
        <div className="rrow" key={i}><span className="rn">{i + 1}</span>
          <div className="rf"><small>Start</small><TimeBox value={r.start} onCommit={v => setS(i, v)} /><button className="tbtn" onClick={() => setS(i, now())}>Now</button></div>
          <div className="rf"><small>End</small><TimeBox value={r.end} onCommit={v => setE(i, v)} /><button className="tbtn" onClick={() => setE(i, now())}>Now</button></div>
          <span className="rl">{fmtT(r.end - r.start)}</span>
          <button className="icon-btn" disabled={ranges.length < 2} onClick={() => onChange(ranges.filter((_, k) => k !== i))}><Trash2 size={17} /></button></div>))}
      <button className="btn soft sm" onClick={add}><Plus size={15} /> Add another range</button>
      <p className="hint"><Scissors size={14} /> {ranges.length} range{ranges.length > 1 ? 's' : ''}, <b>{fmtT(total)}</b> in total. Type times like <b>1:05:00</b>, or play the video and press <b>Now</b>.</p>
      {canMerge && <Toggle on={merge} onChange={onMerge}>Join all ranges into one video (otherwise you get separate files in a ZIP)</Toggle>}
    </div>
  );
}
const Seg = ({ value, options, onChange }) => <div className="seg">{options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
const Toggle = ({ on, onChange, children }) => <label className="toggle"><input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} /><i /><span>{children}</span></label>;

function LangMenu({ lang, setLang }) {
  const [open, setOpen] = useState(false), ref = useRef();
  useEffect(() => { const f = e => !ref.current?.contains(e.target) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  return (
    <div className="lang" ref={ref}>
      <button className="lang-btn" onClick={() => setOpen(!open)} aria-label="Language"><Globe size={18} /><span>{LANGS.find(l => l[0] === lang)[1]}</span><ChevronDown size={15} /></button>
      {open && <ul className="lang-list">{LANGS.map(([c, n]) => <li key={c}><button className={c === lang ? 'on' : ''} onClick={() => { setLang(c); setOpen(false); }}>{n}</button></li>)}</ul>}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.cv_lang || 'en');
  const [maxGB, setMaxGB] = useState(10), lim = maxGB < 1 ? `${Math.round(maxGB * 1024)} MB` : `${maxGB} GB`;
  const t = k => ((T[lang] || {})[k] ?? T.en[k]).replace(/10 (GB|Go|جيجابايت)/g, lim);
  useEffect(() => { fetch('/api/config').then(r => r.json()).then(c => c.maxGB && setMaxGB(c.maxGB)).catch(() => {}); }, []);
  useEffect(() => { localStorage.cv_lang = lang; document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.cv_user || 'null'); } catch { return null; } });
  const [auth, setAuth] = useState(() => !localStorage.cv_token && !sessionStorage.cv_skip ? 'login' : null);
  const [tool, setTool] = useState('image'), [fmt, setFmt] = useState('png'), [opts, setOpts] = useState(DEF), [stage, setStage] = useState('setup');
  const [items, setItems] = useState([]), [msg, setMsg] = useState(''), [dur, setDur] = useState(0), [drag, setDrag] = useState(false);
  const input = useRef(), media = useRef(), work = useRef(), itemsRef = useRef([]); itemsRef.current = items;
  const o = opts[tool], one = items.length === 1 ? items[0] : null, many = items.length > 1, busy = stage === 'processing';

  useEffect(() => {
    if (!localStorage.cv_token) return;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.cv_token } }).then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user))
      .catch(() => { localStorage.removeItem('cv_token'); localStorage.removeItem('cv_user'); setUser(null); });
  }, []);
  useEffect(() => setDur(0), [one?.id]);
  useEffect(() => { if (stage !== 'setup' || items.length) work.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [stage]);

  const onAuth = d => { localStorage.cv_token = d.token; localStorage.cv_user = JSON.stringify(d.user); setUser(d.user); setAuth(null); };
  const closeAuth = () => { sessionStorage.cv_skip = 1; setAuth(null); };
  const logout = () => { localStorage.removeItem('cv_token'); localStorage.removeItem('cv_user'); setUser(null); };

  const upd = (id, p) => setItems(l => l.map(i => i.id === id ? { ...i, ...p } : i));
  const setOpt = p => setOpts(s => ({ ...s, [tool]: { ...s[tool], ...p } }));
  const changeTool = k => { if (busy) return; setTool(k); setFmt(TOOLS[k].formats[0] || ''); setItems([]); setMsg(''); setStage('setup'); };
  const backToSetup = () => { setItems(l => l.map(i => ({ ...i, status: 'ready', pct: 0, prog: {}, err: '' }))); setStage('setup'); };
  const startOver = () => { setItems([]); setStage('setup'); };

  const add = list => {
    const ok = [], bad = [];
    [...list].forEach(f => { const ty = f.type || '', pdf = /pdf/.test(ty) || /\.pdf$/i.test(f.name);
      const good = tool === 'image' ? ty.startsWith('image/') : tool === 'video' ? ty.startsWith('video/') : tool === 'audio' ? /^(audio|video)\//.test(ty) : (ty.startsWith('image/') || ty.startsWith('video/') || pdf);
      (good && f.size <= maxGB * 1024 ** 3 ? ok : bad).push(f); });
    setMsg(bad.length ? `Skipped ${bad.length} file(s): wrong type or larger than ${lim}.` : '');
    setItems(l => [...l, ...ok.map(file => ({ id: crypto.randomUUID(), file, url: file.type.startsWith('image/') || ok.length + l.length === 1 ? URL.createObjectURL(file) : null, status: 'ready', pct: 0, prog: {} }))]);
  };

  const convertItem = item => new Promise(res => {
    const send = { ...o };
    if (itemsRef.current.length > 1) { if (['trim', 'multi'].includes(send.edit)) send.edit = 'none'; if (send.edit === 'split') { send.start = 0; send.end = 0; } send.trim = false; }
    const fd = new FormData(); fd.append('kind', tool); fd.append('target', fmt || 'x'); fd.append('opts', JSON.stringify(send)); fd.append('file', item.file);
    const x = new XMLHttpRequest(); upd(item.id, { status: 'uploading', pct: 0, err: '' });
    x.upload.onprogress = e => e.lengthComputable && upd(item.id, { pct: Math.round(e.loaded / e.total * 100) });
    x.upload.onload = () => upd(item.id, { status: 'converting', prog: {} });
    x.onerror = () => { upd(item.id, { status: 'error', err: 'The server is not responding. Make sure the app is running (npm run dev).' }); res(); };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch {}
      if (!d.id) { upd(item.id, { status: 'error', err: d.error || 'The server is not responding. Make sure the app is running (npm run dev).' }); return res(); }
      const iv = setInterval(async () => { try {
        const r = await fetch(`/api/status/${d.id}`), txt = await r.text(); let s = {}; try { s = JSON.parse(txt); } catch {}
        if (!s.state) { clearInterval(iv); upd(item.id, { status: 'error', err: 'Lost connection to the server.' }); return res(); }
        upd(item.id, { prog: s });
        if (s.state === 'done') { clearInterval(iv); upd(item.id, { status: 'done', resultId: d.id, outName: s.name, note: s.note, inSize: s.inSize, outSize: s.outSize }); res(); }
        if (s.state === 'error') { clearInterval(iv); upd(item.id, { status: 'error', err: s.error }); res(); }
      } catch {} }, 1000);
    };
    x.open('POST', '/api/convert'); x.send(fd);
  });
  const convertAll = async () => { setStage('processing'); for (const it of itemsRef.current) await convertItem(it); setStage('done'); };

  const done = items.filter(i => i.status === 'done'), lossy = ['jpg', 'webp', 'avif'].includes(fmt);
  const kinds = new Set(items.map(i => kindOf(i.file)));
  const span = o.end - o.start, est = o.edit === 'split' && +o.splitMin > 0 && dur ? Math.ceil(span / (o.splitMin * 60)) : 0;
  const left = s => s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} sec`;
  const status = i => i.status === 'uploading' ? `${t('uploading')} ${i.pct}%` : i.status === 'converting' ? (['zipping', 'finishing'].includes(i.prog.state) ? 'Finishing up…' : i.prog.pct ? `${t('converting')} ${i.prog.pct}%${i.prog.eta ? ` · ${left(i.prog.eta)} ${t('left')}` : ''}` : `${t('converting')}…`)
    : i.status === 'done' ? t('ready') : i.status === 'error' ? i.err : stage === 'processing' ? t('waiting') : size(i.file.size);
  const saved = i => i.inSize && i.outSize && tool === 'compress' ? `${size(i.inSize)} → ${size(i.outSize)} · ${Math.max(0, Math.round((1 - i.outSize / i.inSize) * 100))}% ${t('saved')}` : i.outSize ? size(i.outSize) : '';
  const Thumb = ({ i }) => <div className="thumb">{i.url && kindOf(i.file) === 'image' ? <img src={i.url} /> : kindOf(i.file) === 'pdf' ? <FileText size={22} /> : tool === 'audio' ? <Music size={22} /> : <Film size={22} />}</div>;
  const ready = !!(tool === 'compress' || fmt);
  const editOpts = [['none', 'Convert only'], ...(many ? [] : [['trim', '✂ Trim']]), ['split', '🎞 Split into parts'], ...(many ? [] : [['multi', '🧩 Cut several parts']])];

  return (
    <>
      <header className="top"><div className="wrap row between">
        <a className="brand" href="#"><span className="logo"><RefreshCw size={18} /></span><span>Convert<b>ify</b></span></a>
        <nav className="menu"><a href="#tools">{t('tools')}</a><a href="#features">{t('features')}</a></nav>
        <div className="row gap">
          <LangMenu lang={lang} setLang={setLang} />
          {user ? <div className="user"><span className="avatar">{user.name[0].toUpperCase()}</span><span className="uname">{user.name.split(' ')[0]}</span><button className="icon-btn" onClick={logout} title="Log out"><LogOut size={17} /></button></div>
            : <><button className="btn ghost hide-s" onClick={() => setAuth('login')}>{t('login')}</button><button className="btn primary sm" onClick={() => setAuth('signup')}>{t('signup')}</button></>}
        </div>
      </div></header>

      <section className="hero wrap">
        <span className="pill"><Sparkles size={14} /> {t('badge')}</span>
        <h1>{t('h1a')} <span className="grad">{t('h1b')}</span><br />{t('h1c')}</h1>
        <p>{t('sub')}</p>
      </section>

      <main className="wrap" id="tools">
        <div className="tools">{Object.entries(TOOLS).map(([k, tl]) => { const I = tl.icon; return (
          <button key={k} className={'tool ' + (tool === k ? 'on' : '')} onClick={() => changeTool(k)}><span className={'ti ' + k}><I size={24} /></span><b>{t(k)}</b><small>{t(tl.d)}</small></button>); })}</div>

        <div className="work" ref={work}>
          {stage === 'setup' && <>
            <div className={'drop ' + (drag ? 'drag' : '') + (items.length ? ' compact' : '')} onClick={() => input.current.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
              <input ref={input} type="file" multiple hidden accept={TOOLS[tool].accept} onChange={e => { add(e.target.files); e.target.value = ''; }} />
              {items.length ? <><Plus size={20} /> <b>{t('more')}</b></> : <><span className="up"><UploadCloud size={34} /></span><h3>{t('drop')}</h3><p>{t('browse')}</p></>}
            </div>
            {msg && <p className="warn"><AlertCircle size={15} /> {msg}</p>}

            {items.length > 0 && <>
              <ul className="files">{items.map(i => (
                <li key={i.id}><Thumb i={i} /><div className="fi"><b title={i.file.name}>{i.file.name}</b><small>{size(i.file.size)}</small></div>
                  <button className="icon-btn" onClick={() => setItems(l => l.filter(x => x.id !== i.id))}><X size={18} /></button></li>))}</ul>

              {one && ['video', 'audio'].includes(tool) && one.url && (tool === 'video'
                ? <video ref={media} className="player" src={one.url} controls onLoadedMetadata={e => { const d = e.target.duration; setDur(d); setOpt({ end: d }); }} />
                : <audio ref={media} className="player a" src={one.url} controls onLoadedMetadata={e => { const d = e.target.duration; setDur(d); setOpt({ end: d }); }} />)}

              <div className="panel">
                {tool !== 'compress' && <><h4>{t('to')}</h4>
                  <div className="chips">{TOOLS[tool].formats.map(f => <button key={f} className={'chip ' + (fmt === f ? 'on' : '')} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div></>}

                {tool === 'image' && <div className="grid2">
                  {lossy && <div className="field"><h4>Quality <b>{o.quality}%</b></h4><input type="range" min="10" max="100" value={o.quality} onChange={e => setOpt({ quality: +e.target.value })} /><small>Lower = smaller file</small></div>}
                  <div className="field"><h4>Resize</h4><Seg value={o.resizeMode} onChange={v => setOpt({ resizeMode: v })} options={[['none', 'Original'], ['size', 'Pixels'], ['percent', 'Percent']]} />
                    {o.resizeMode === 'size' && <div className="row gap"><input className="num" type="number" placeholder="Width" value={o.w} onChange={e => setOpt({ w: e.target.value })} /><input className="num" type="number" placeholder="Height" value={o.h} onChange={e => setOpt({ h: e.target.value })} /></div>}
                    {o.resizeMode === 'percent' && <><input type="range" min="10" max="200" value={o.pct} onChange={e => setOpt({ pct: +e.target.value })} /><small>{o.pct}% of original size</small></>}</div>
                  <div className="field"><h4>Rotate</h4><Seg value={o.rotate} onChange={v => setOpt({ rotate: v })} options={[[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']]} /></div>
                  <div className="field"><h4>Flip</h4><Seg value={o.flip} onChange={v => setOpt({ flip: v })} options={[['none', 'None'], ['h', 'Horizontal'], ['v', 'Vertical']]} /></div>
                  <div className="field"><Toggle on={o.gray} onChange={v => setOpt({ gray: v })}>Black & white</Toggle></div>
                </div>}

                {tool === 'video' && <div className="stack">
                  <div className="field"><h4>What do you want to do?</h4>
                    <Seg value={o.edit} onChange={v => setOpt(v === 'multi' && !o.ranges.length ? { edit: v, ranges: [{ start: 0, end: Math.min(dur || 60, 60) }] } : { edit: v })} options={editOpts} /></div>
                  {o.edit === 'trim' && one && <Trimmer dur={dur} start={o.start} end={o.end} media={media} onChange={(s, e) => setOpt({ start: s, end: e })} />}
                  {o.edit === 'split' && <>
                    {one && <Trimmer title="Only use this part of the video (remove the beginning and end you don't want)" dur={dur} start={o.start} end={o.end} media={media} onChange={(s, e) => setOpt({ start: s, end: e })} />}
                    <div className="field"><h4>Minutes per part</h4>
                      <div className="row gap wrapx">{[1, 2, 5, 10, 30].map(m => <button key={m} className={'chip ' + (+o.splitMin === m ? 'on' : '')} onClick={() => setOpt({ splitMin: m })}>{m} min</button>)}
                        <input className="num" type="number" min="0.5" step="0.5" placeholder="Custom minutes" value={o.splitMin} onChange={e => setOpt({ splitMin: e.target.value })} /></div>
                      {est > 0 && <p className="hint"><Scissors size={14} /> {fmtT(span)} of video becomes about <b>{est} parts</b>, delivered as one ZIP.</p>}</div></>}
                  {o.edit === 'multi' && one && <Ranges ranges={o.ranges} merge={o.merge} dur={dur} media={media} canMerge={fmt !== 'gif'} onChange={r => setOpt({ ranges: r })} onMerge={v => setOpt({ merge: v })} />}
                  <div className="grid2">
                    <div className="field"><h4>Resolution</h4><Seg value={o.height} onChange={v => setOpt({ height: v })} options={[[0, 'Original'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p']]} /></div>
                    <div className="field"><Toggle on={o.fast} onChange={v => setOpt({ fast: v })}>Fast mode: skip re-encoding when possible (instant cuts)</Toggle></div>
                  </div></div>}

                {tool === 'audio' && <div className="grid2">
                  {!['wav', 'flac'].includes(fmt) && <div className="field"><h4>Quality</h4><Seg value={o.bitrate} onChange={v => setOpt({ bitrate: v })} options={[[64, '64k'], [128, '128k'], [192, '192k'], [256, '256k'], [320, '320k']]} /></div>}
                  <div className="field"><h4>Volume <b>{o.volume}%</b></h4><input type="range" min="25" max="200" value={o.volume} onChange={e => setOpt({ volume: +e.target.value })} /></div>
                  <div className="field"><Toggle on={o.mono} onChange={v => setOpt({ mono: v })}>Mono (smaller file)</Toggle></div>
                  <div className="field"><Toggle on={o.trim} onChange={v => setOpt({ trim: v })}>Trim audio</Toggle></div>
                  {o.trim && <div className="full">{one ? <Trimmer dur={dur} start={o.start} end={o.end} media={media} onChange={(s, e) => setOpt({ start: s, end: e })} /> : <p className="hint">Trim works on one file at a time.</p>}</div>}
                </div>}

                {tool === 'compress' && <div className="stack">
                  <div className="field"><h4>Compression level</h4><Seg value={o.level} onChange={v => setOpt({ level: v })} options={[['light', 'Light'], ['balanced', 'Balanced'], ['strong', 'Strong']]} /><small>Light = best quality · Strong = smallest file. If a file is already small, we send it back unchanged.</small></div>
                  {kinds.has('image') && <div className="grid2">
                    <div className="field"><h4>Images: max size</h4><Seg value={o.maxDim} onChange={v => setOpt({ maxDim: v })} options={[[0, 'Original'], [3840, '4K'], [1920, 'Full HD'], [1280, 'HD']]} /></div>
                    <div className="field"><h4>Images: format</h4><Seg value={o.outFmt} onChange={v => setOpt({ outFmt: v })} options={[['same', 'Same as original'], ['webp', 'WEBP (smallest)'], ['jpg', 'JPG']]} /></div></div>}
                  {kinds.has('video') && <div className="grid2">
                    <div className="field"><h4>Videos: resolution</h4><Seg value={o.height} onChange={v => setOpt({ height: v })} options={[[0, 'Original'], [1080, '1080p'], [720, '720p'], [480, '480p']]} /></div>
                    <div className="field"><h4>Videos: target size (MB, optional)</h4><input className="num" type="number" min="1" placeholder="e.g. 50" value={o.targetMB} onChange={e => setOpt({ targetMB: e.target.value })} /><small>Videos are saved as MP4 (H.264) so they play everywhere.</small></div></div>}
                  {kinds.has('pdf') && <p className="hint"><FileText size={14} /> PDFs are compressed by lowering image quality inside the document.</p>}
                </div>}
              </div>

              <div className="actions">
                <button className="btn primary lg" disabled={!ready} onClick={convertAll}><Zap size={19} /> {tool === 'compress' ? t('compressBtn') : t('convert')} {items.length} {tool === 'compress' ? '' : `· ${fmt.toUpperCase()}`}</button>
                <button className="link" onClick={() => setItems([])}>{t('clear')}</button>
              </div>
            </>}
          </>}

          {stage === 'processing' && <div className="proc">
            <div className="ring"><Loader2 size={34} className="spin" /></div>
            <h3>{t('procTitle')}</h3><p>{t('procSub')}</p>
            <ul className="files">{items.map(i => (
              <li key={i.id} className={i.status}><Thumb i={i} /><div className="fi"><b title={i.file.name}>{i.file.name}</b><small className={i.status === 'error' ? 'bad' : ''}>{status(i)}</small>
                {['uploading', 'converting'].includes(i.status) && <div className="bar"><div className={!(i.status === 'uploading' || i.prog.pct) ? 'pulse' : ''} style={{ width: (i.status === 'uploading' ? i.pct : i.prog.pct || 100) + '%' }} /></div>}</div>
                {i.status === 'done' ? <CheckCircle2 size={22} className="okc" /> : i.status === 'error' ? <AlertCircle size={22} className="bad" /> : ['uploading', 'converting'].includes(i.status) ? <Loader2 className="spin" size={20} /> : null}</li>))}</ul>
          </div>}

          {stage === 'done' && <div className="proc">
            <div className={'ring ' + (done.length ? 'ok' : 'no')}>{done.length ? <CheckCircle2 size={36} /> : <AlertCircle size={36} />}</div>
            <h3>{done.length ? t('doneTitle') : t('failed')}</h3>
            <ul className="files">{items.map(i => (
              <li key={i.id} className={i.status}><Thumb i={i} /><div className="fi"><b title={i.outName || i.file.name}>{i.outName || i.file.name}</b>
                <small className={i.status === 'error' ? 'bad' : ''}>{i.status === 'error' ? i.err : saved(i) || t('ready')}</small>{i.note && <small className="note">ℹ️ {i.note}</small>}</div>
                {i.status === 'done' ? <a className="btn soft sm" href={`/api/download/${i.resultId}`} download={i.outName}><Download size={15} /> {t('download')}</a> : <AlertCircle size={20} className="bad" />}</li>))}</ul>
            <div className="actions">
              {done.length > 1 ? <a className="btn primary lg" href={`/api/zip?ids=${done.map(d => d.resultId).join(',')}`}><Download size={19} /> {t('all')}</a>
                : done.length === 1 && <a className="btn primary lg" href={`/api/download/${done[0].resultId}`} download={done[0].outName}><Download size={19} /> {t('download')}</a>}
              <div className="row gap wrapx cen"><button className="btn soft" onClick={backToSetup}><Settings2 size={17} /> {t('again')}</button><button className="btn ghost" onClick={startOver}><RotateCcw size={17} /> {t('another')}</button></div>
            </div>
          </div>}
        </div>
      </main>

      <section className="features wrap" id="features">
        <h2>{t('featA')} <span className="grad">{t('featB')}</span></h2>
        <div className="fgrid">{[[Inf, 'Huge files', `Upload up to ${lim} per file with live progress and time left.`], [Layers, 'Batch & ZIP', 'Drop many files at once and download everything as one ZIP.'],
          [Scissors, 'Trim, split & multi-cut', 'Remove the start and end, cut several parts, or split into equal parts.'], [Zap, 'Built for speed', 'Long videos are processed in parallel, with GPU boost when available.'],
          [Minimize2, 'Compress anything', 'Shrink images, videos and PDFs and see exactly how much you saved.'], [ShieldCheck, 'Private', 'Your files are deleted from the server after 1 hour.']].map(([I, ti, d]) => (
          <div className="fc" key={ti}><span className="fi2"><I size={22} /></span><h4>{ti}</h4><p>{d}</p></div>))}</div>
      </section>
      <footer><div className="wrap row between wrapx"><span className="brand sm"><span className="logo"><RefreshCw size={14} /></span><span>Convert<b>ify</b></span></span><small>© {new Date().getFullYear()} Convertify. {t('rights')}</small></div></footer>
      {auth && <Auth initial={auth} onClose={closeAuth} onAuth={onAuth} t={t} />}
    </>
  );
}
