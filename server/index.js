import express from 'express'; import cors from 'cors'; import multer from 'multer'; import archiver from 'archiver'; import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_GB = +process.env.MAX_UPLOAD_GB || 10, MAX_JOBS = +process.env.MAX_JOBS || 0; // set these on a public server
const lim = MAX_GB < 1 ? `${Math.round(MAX_GB * 1024)} MB` : `${MAX_GB} GB`;
const UP = path.resolve('uploads'), OUT = path.resolve('outputs'), DATA = path.resolve('data');
[UP, OUT, DATA].forEach(d => fs.mkdirSync(d, { recursive: true }));
for (const d of [UP, OUT]) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { recursive: true, force: true }); // clean leftovers on start
const FFMPEG = ffmpegPath || 'ffmpeg', CORES = os.cpus().length;
const upload = multer({
  storage: multer.diskStorage({ destination: UP, filename: (_, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname)) }),
  limits: { fileSize: Math.floor(MAX_GB * 1024 ** 3) }
});
process.on('uncaughtException', e => console.error('Uncaught error (server kept running):', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection (server kept running):', e));
const app = express(); app.use(cors()); const jobs = {};

// ================= AUTH (simple: users.json + scrypt + signed token) =================
const UF = path.join(DATA, 'users.json'), SF = path.join(DATA, 'secret.txt');
const users = fs.existsSync(UF) ? JSON.parse(fs.readFileSync(UF, 'utf8')) : [];
const SECRET = process.env.SECRET || (fs.existsSync(SF) ? fs.readFileSync(SF, 'utf8') : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SF, s); return s; })());
const hmac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const sign = u => { const b = Buffer.from(JSON.stringify({ e: u.email, x: Date.now() + 30 * 864e5 })).toString('base64url'); return `${b}.${hmac(b)}`; };
const verify = tok => { try { const [b, s] = String(tok).split('.'); if (hmac(b) !== s) return null; const d = JSON.parse(Buffer.from(b, 'base64url')); return d.x > Date.now() ? users.find(u => u.email === d.e) : null; } catch { return null; } };
const pub = u => ({ name: u.name, email: u.email });
app.post('/api/auth/signup', express.json(), (req, res) => {
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'This email is already registered. Try logging in.' });
  const salt = crypto.randomBytes(16).toString('hex'), u = { name, email, salt, hash: hash(pw, salt) };
  users.push(u); fs.writeFileSync(UF, JSON.stringify(users, null, 2)); res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/auth/login', express.json(), (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), u = users.find(x => x.email === email);
  if (!u || hash(String(req.body.password || ''), u.salt) !== u.hash) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(u), user: pub(u) });
});
app.get('/api/auth/me', (req, res) => { const u = verify((req.headers.authorization || '').replace('Bearer ', '')); u ? res.json({ user: pub(u) }) : res.status(401).json({ error: 'Not logged in' }); });

// ================= HELPERS =================
const run = (cmd, args, onProg) => new Promise((ok, no) => {
  const p = spawn(cmd, args); let err = '', buf = '';
  p.stderr.on('data', d => err = (err + d).slice(-1500));
  if (onProg) p.stdout.on('data', d => { buf = (buf + d).slice(-400); const m = [...buf.matchAll(/out_time_(?:us|ms)=(\d+)/g)]; if (m.length) onProg(+m.at(-1)[1] / 1e6); });
  p.on('error', () => no(new Error(`Could not start ${path.basename(cmd)}`)));
  p.on('close', c => c === 0 ? ok() : no(new Error(err.trim().split('\n').filter(Boolean).pop() || 'Conversion failed')));
});
const probe = file => new Promise(ok => {
  const p = spawn(FFMPEG, ['-hide_banner', '-i', file]); let e = '';
  p.stderr.on('data', d => e += d); p.on('error', () => ok({}));
  p.on('close', () => { const d = e.match(/Duration: (\d+):(\d+):([\d.]+)/);
    ok({ v: (e.match(/Video: (\w+)/) || [])[1], a: (e.match(/Audio: (\w+)/) || [])[1], dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 }); });
});
const zipDir = (dir, out) => new Promise((ok, no) => {
  const o = fs.createWriteStream(out), a = archiver('zip', { store: true });
  o.on('close', ok); a.on('error', no); a.pipe(o); a.directory(dir, false); a.finalize();
});
// GPU encoder auto-detect (much faster when the PC has one)
const HW = [['h264_nvenc', ['-preset', 'p2', '-cq', '26']], ['h264_qsv', ['-global_quality', '26', '-preset', 'veryfast']], ['h264_amf', ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '26', '-qp_p', '26']]];
let hw = null;
(async () => {
  for (const [n, a] of HW) { try { await run(FFMPEG, ['-f', 'lavfi', '-i', 'color=black:s=1280x720', '-frames:v', '3', '-pix_fmt', 'yuv420p', '-c:v', n, ...a, '-f', 'null', '-']); hw = ['-c:v', n, ...a]; console.log('GPU encoder found:', n); break; } catch {} }
  if (!hw) console.log(`No GPU encoder, using CPU (${CORES} cores) with parallel processing`);
})();

// ---- encoders ----
const venc = (t, h) => {
  const vf = h ? ['-vf', `scale=-2:'min(${h},ih)'`] : [];
  const x = [...(hw || ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26']), ...vf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'];
  return ({ mp4: [...x, '-movflags', '+faststart'], mov: x, mkv: x,
    webm: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', ...vf, '-c:a', 'libopus'],
    gif: ['-vf', `fps=12,scale=-2:${Math.min(h || 360, 480)}`, '-an'] })[t] || [];
};
const iargs = (t, o) => {
  const vf = [], q = Math.min(100, Math.max(1, +o.quality || 85));
  if (+o.maxDim) vf.push(`scale='min(${+o.maxDim},iw)':'min(${+o.maxDim},ih)':force_original_aspect_ratio=decrease`);
  if (o.resizeMode === 'size' && (+o.w || +o.h)) vf.push(+o.w && +o.h ? `scale=${+o.w}:${+o.h}:force_original_aspect_ratio=decrease` : `scale=${+o.w || -2}:${+o.h || -2}`);
  if (o.resizeMode === 'percent' && +o.pct > 0 && +o.pct !== 100) vf.push(`scale=trunc(iw*${+o.pct}/200)*2:trunc(ih*${+o.pct}/200)*2`);
  if (+o.rotate === 90) vf.push('transpose=1'); if (+o.rotate === 180) vf.push('transpose=1,transpose=1'); if (+o.rotate === 270) vf.push('transpose=2');
  if (o.flip === 'h') vf.push('hflip'); if (o.flip === 'v') vf.push('vflip');
  if (o.gray) vf.push('hue=s=0');
  if (o.palette) vf.push(`split[a][b];[a]palettegen=max_colors=${+o.palette}[p];[b][p]paletteuse`);
  if (t === 'ico') vf.push(`scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease`);
  if (t === 'avif') vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  vf.push('setsar=1');
  if (['jpg', 'bmp'].includes(t)) vf.push('split=2[bg][fg];[bg]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill[bg2];[bg2][fg]overlay=format=auto,format=rgb24'); // transparent -> white
  const c = { jpg: ['-q:v', String(2 + Math.round((100 - q) * 29 / 100)), '-pix_fmt', 'yuvj420p'], png: ['-compression_level', '9'], webp: ['-c:v', 'libwebp', '-quality', String(q)],
    avif: ['-c:v', 'libaom-av1', '-crf', String(Math.round(63 - q * 0.63)), '-b:v', '0', '-cpu-used', '8', '-still-picture', '1', '-pix_fmt', 'yuv420p'] }[t] || [];
  return [...(vf.length ? ['-vf', vf.join(',')] : []), ...c, '-map_metadata', '-1'];
};
const aargs = (t, o) => {
  const br = `${+o.bitrate || 192}k`, af = +o.volume && +o.volume !== 100 ? ['-af', `volume=${(+o.volume / 100).toFixed(2)}`] : [];
  const c = { mp3: ['-c:a', 'libmp3lame', '-b:a', br], m4a: ['-c:a', 'aac', '-b:a', br], aac: ['-c:a', 'aac', '-b:a', br], ogg: ['-c:a', 'libvorbis', '-b:a', br],
    opus: ['-c:a', 'libopus', '-b:a', br], flac: ['-c:a', 'flac'], wav: ['-c:a', 'pcm_s16le'] }[t] || [];
  return ['-vn', '-map', '0:a:0', ...af, ...(o.mono ? ['-ac', '1'] : []), ...c];
};

// ================= VIDEO (parallel, seek-based = fast for long movies) =================
const mkProg = (job, total) => { const t0 = Date.now(); return t => { if (!total) return; job.pct = Math.min(99, Math.round(t / total * 100)); const sp = t / ((Date.now() - t0) / 1000); job.eta = sp > 0 ? Math.round((total - t) / sp) : null; }; };
async function doVideo(f, target, o, job, id, safe) {
  const info = await probe(f.path);
  if (!info.dur) throw new Error('Could not read the video length. Is this a valid video file?');
  const h = +o.height || 0;
  let copy = !!o.fast && ['mp4', 'mkv', 'mov'].includes(target) && !h;
  if (copy && !(info.v === 'h264' && (!info.a || ['aac', 'mp3'].includes(info.a)))) { copy = false; job.note = `Your video uses ${info.v || 'an unsupported'} codec, so it was converted to H.264 so it plays everywhere.`; }
  const codec = copy ? ['-c', 'copy', '-avoid_negative_ts', 'make_zero'] : venc(target, h), maps = ['-map', '0:v:0', '-map', '0:a:0?', '-sn'];
  const clamp = (a, b) => ({ s: Math.max(0, +a || 0), e: Math.min(info.dur, +b || info.dur) }), pad = i => String(i + 1).padStart(3, '0');
  let parts, dir = null, merge = false, label = 'parts';
  const mk = () => { dir = path.join(OUT, id); fs.mkdirSync(dir); };
  if (o.edit === 'trim') {
    const { s, e } = clamp(o.start, o.end); if (e - s < 0.5) throw new Error('Trim end must be after the start.');
    parts = [{ ss: s, len: e - s, out: job.path }]; job.name = `${safe}_trim.${target}`;
  } else if (o.edit === 'split' && +o.splitMin > 0) {
    const { s, e } = clamp(o.start, o.end), span = e - s; if (span < 1) throw new Error('The selected range is too short.');
    const sec = Math.round(o.splitMin * 60); let n = Math.ceil(span / sec); if (n > 1 && span - (n - 1) * sec < 1) n--;
    mk(); parts = Array.from({ length: n }, (_, i) => ({ ss: s + i * sec, len: i === n - 1 ? span - i * sec : sec, out: path.join(dir, `${safe}_part_${pad(i)}.${target}`) }));
  } else if (o.edit === 'multi') {
    const rs = (o.ranges || []).map(r => clamp(r.start, r.end)).filter(r => r.e - r.s >= 0.5);
    if (!rs.length) throw new Error('Add at least one range with a start and an end time.');
    mk(); merge = !!o.merge && target !== 'gif'; label = 'cuts';
    parts = rs.map((r, i) => ({ ss: r.s, len: r.e - r.s, out: path.join(dir, `${safe}_cut_${pad(i)}.${target}`) }));
  } else parts = [{ ss: 0, len: info.dur, out: job.path }];
  const C = parts.length === 1 ? 1 : copy ? 4 : hw ? 2 : Math.min(4, Math.max(1, CORES >> 1));
  const thr = C > 1 ? ['-threads', String(Math.max(1, Math.floor(CORES / C)))] : [];
  const total = parts.reduce((a, p) => a + p.len, 0), t0 = Date.now();
  const upd = () => { const d = parts.reduce((a, p) => a + (p.fin ? p.len : Math.min(p.cur || 0, p.len)), 0); job.pct = Math.min(99, Math.round(d / total * 100)); job.eta = d > 0.5 ? Math.round((Date.now() - t0) / 1000 * (total - d) / d) : null; };
  let next = 0, failed = null;
  const worker = async () => { while (!failed && next < parts.length) { const p = parts[next++];
    try { await run(FFMPEG, ['-y', '-progress', 'pipe:1', '-nostats', ...(copy ? [] : ['-hwaccel', 'auto']), '-ss', String(p.ss), '-i', f.path, '-t', String(p.len), ...maps, ...codec, ...thr, p.out], s => { p.cur = s; upd(); }); p.fin = true; upd(); }
    catch (e) { failed = e; } } };
  await Promise.all(Array.from({ length: C }, worker));
  if (failed) { if (dir) fs.rmSync(dir, { recursive: true, force: true }); throw failed; }
  if (merge) {
    job.state = 'finishing'; job.eta = null; const list = path.join(dir, 'list.txt');
    fs.writeFileSync(list, parts.map(p => `file '${p.out.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    await run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', job.path]);
    job.name = `${safe}_edited.${target}`; fs.rmSync(dir, { recursive: true, force: true });
  } else if (dir) { job.state = 'zipping'; job.eta = null; job.path = path.join(OUT, `${id}.zip`); job.name = `${safe}_${label}.zip`; await zipDir(dir, job.path); fs.rmSync(dir, { recursive: true, force: true }); }
}

// ================= COMPRESS (images, videos, PDF) =================
const VID_EXT = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.wmv', '.flv', '.mpg', '.mpeg', '.3gp', '.ts', '.mts'];
const IMG_EXT = ['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff', '.ico'];
async function doPdf(f, lvl, job) {
  const set = { light: '/printer', balanced: '/ebook', strong: '/screen' }[lvl];
  const args = (out, inp) => ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', `-dPDFSETTINGS=${set}`, '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dDetectDuplicateImages=true', '-dCompressFonts=true', `-sOutputFile=${out}`, inp];
  const win = (() => { try { const b = 'C:\\Program Files\\gs'; return process.platform === 'win32' ? fs.readdirSync(b).map(d => path.join(b, d, 'bin', 'gswin64c.exe')) : []; } catch { return []; } })();
  for (const c of ['gs', 'gswin64c', 'gswin32c', ...win]) { // use real Ghostscript if the PC has it
    try { await run(c, args(job.path, f.path)); return; } catch (e) { if (!/Could not start/.test(e.message)) throw e; }
  }
  if (f.size > 500 * 1024 ** 2) throw new Error('This PDF is too big for the built-in compressor (500 MB max). Install Ghostscript for bigger files.');
  const init = (await import('@jspawn/ghostscript-wasm/gs.mjs')).default; // built-in fallback, nothing to install
  const wasm = fs.readFileSync(fileURLToPath(new URL('./node_modules/@jspawn/ghostscript-wasm/gs.wasm', import.meta.url)));
  const gs = await init({ print: () => {}, printErr: () => {}, instantiateWasm: (imp, ok) => { WebAssembly.instantiate(wasm, imp).then(r => ok(r.instance, r.module)); return {}; } });
  gs.FS.writeFile('in.pdf', fs.readFileSync(f.path));
  try { gs.callMain(args('out.pdf', 'in.pdf')); } catch {}
  let out; try { out = gs.FS.readFile('out.pdf'); } catch { throw new Error('Could not compress this PDF (it may be damaged or password-protected).'); }
  fs.writeFileSync(job.path, out);
}
async function doCompress(f, o, job, id, safe) {
  const ext = path.extname(f.originalname).toLowerCase(), mt = f.mimetype || '', lvl = ['light', 'balanced', 'strong'].includes(o.level) ? o.level : 'balanced';
  if (mt === 'application/pdf' || ext === '.pdf') { job.path = path.join(OUT, `${id}.pdf`); job.name = `${safe}_compressed.pdf`; await doPdf(f, lvl, job); }
  else if (mt.startsWith('video/') || VID_EXT.includes(ext)) {
    const info = await probe(f.path), h = +o.height || 0, mb = +o.targetMB;
    job.path = path.join(OUT, `${id}.mp4`); job.name = `${safe}_compressed.mp4`;
    let rate = ['-crf', String({ light: 23, balanced: 28, strong: 33 }[lvl])];
    let ab = lvl === 'strong' ? 96000 : 128000;
    if (mb > 0 && info.dur) { const budget = mb * 8 * 1024 * 1024 / info.dur; ab = Math.min(ab, Math.max(32000, Math.floor(budget * 0.15))); const vb = Math.max(40000, Math.floor(budget - ab)); rate = ['-b:v', String(vb), '-maxrate', String(Math.round(vb * 1.2)), '-bufsize', String(vb * 2)]; }
    await run(FFMPEG, ['-y', '-progress', 'pipe:1', '-nostats', '-hwaccel', 'auto', '-i', f.path, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-c:v', 'libx264', '-preset', 'veryfast', ...rate,
      ...(h ? ['-vf', `scale=-2:'min(${h},ih)'`] : []), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', String(ab), '-movflags', '+faststart', job.path], mkProg(job, info.dur));
  } else if (mt.startsWith('image/') || IMG_EXT.includes(ext)) {
    const inExt = ext.slice(1), Q = { light: 85, balanced: 70, strong: 50 }[lvl];
    const out = o.outFmt && o.outFmt !== 'same' ? o.outFmt : ({ jpeg: 'jpg', jfif: 'jpg', bmp: 'png', tif: 'jpg', tiff: 'jpg', ico: 'png' }[inExt] || inExt);
    const palette = { png: { balanced: 256, strong: 64 }, gif: { light: 256, balanced: 128, strong: 64 } }[out]?.[lvl], anim = ['gif', 'webp'].includes(inExt) && ['gif', 'webp'].includes(out);
    job.path = path.join(OUT, `${id}.${out}`); job.name = `${safe}_compressed.${out}`;
    await run(FFMPEG, ['-y', '-i', f.path, ...(anim ? [] : ['-frames:v', '1']), ...iargs(out, { quality: Q, maxDim: o.maxDim, palette }), job.path]);
  } else throw new Error('Unsupported file. Please use an image, a video or a PDF.');
  if (fs.statSync(job.path).size >= f.size * 0.98) { // never hand back a bigger file
    const keep = path.join(OUT, `${id}_orig${ext}`); fs.copyFileSync(f.path, keep); fs.unlink(job.path, () => {});
    job.path = keep; job.name = `${safe}${ext}`; job.note = 'This file was already well compressed, so the original is returned unchanged.';
  }
}

// ================= API =================
app.post('/api/convert', upload.single('file'), (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: 'No file' });
  const active = Object.values(jobs).filter(j => ['working', 'zipping', 'finishing'].includes(j.state)).length;
  if (MAX_JOBS && active >= MAX_JOBS) { fs.unlink(f.path, () => {}); return res.status(503).json({ error: 'The server is busy with other conversions. Please try again in a minute.' }); }
  let o = {}; try { o = JSON.parse(req.body.opts || '{}'); } catch {}
  const { kind, target } = req.body, id = crypto.randomUUID(), base = path.parse(f.originalname).name, safe = base.replace(/[^\w-]+/g, '_').slice(0, 60) || 'file';
  const job = jobs[id] = { state: 'working', pct: 0, eta: null, note: '', t: Date.now(), name: `${base}.${target}`, path: path.join(OUT, `${id}.${target}`) };
  res.json({ id }); // reply right after upload; work continues in background
  (async () => {
    try {
      if (kind === 'image') {
        const anim = path.extname(f.originalname).toLowerCase() === '.gif' && ['gif', 'webp'].includes(target);
        await run(FFMPEG, ['-y', '-i', f.path, ...(anim ? [] : ['-frames:v', '1']), ...iargs(target, o), job.path]);
      } else if (kind === 'audio') {
        const info = await probe(f.path), s = o.trim ? Math.max(0, +o.start || 0) : 0, e = o.trim ? Math.min(info.dur || 1e9, +o.end || 1e9) : 0, len = o.trim ? e - s : info.dur;
        if (o.trim && len < 0.3) throw new Error('Trim end must be after the start.');
        if (o.trim) job.name = `${safe}_trim.${target}`;
        await run(FFMPEG, ['-y', '-progress', 'pipe:1', '-nostats', ...(o.trim ? ['-ss', String(s)] : []), '-i', f.path, ...(o.trim ? ['-t', String(len)] : []), ...aargs(target, o), job.path],
          t => { if (len) { job.pct = Math.min(99, Math.round(t / len * 100)); } });
      } else if (kind === 'video') await doVideo(f, target, o, job, id, safe);
      else if (kind === 'compress') await doCompress(f, o, job, id, safe);
      else throw new Error('Unknown tool');
      job.inSize = f.size; job.outSize = fs.statSync(job.path).size; job.state = 'done'; job.pct = 100; job.eta = 0;
    } catch (e) { job.state = 'error'; job.error = e.message; }
    finally { fs.unlink(f.path, () => {}); job.t = Date.now(); }
  })();
});
app.get('/api/config', (req, res) => res.json({ maxGB: MAX_GB }));
app.get('/api/status/:id', (req, res) => {
  const j = jobs[req.params.id]; if (!j) return res.status(404).json({ state: 'error', error: 'Job not found (server restarted?)' });
  const { state, pct, eta, note, error, name, inSize, outSize } = j; res.json({ state, pct, eta, note, error, name, inSize, outSize });
});
app.get('/api/download/:id', (req, res) => {
  const j = jobs[req.params.id]; if (!j || j.state !== 'done') return res.status(404).send('Not ready or expired');
  res.download(j.path, j.name);
});
app.get('/api/zip', (req, res) => { // download many results as one ZIP
  const list = String(req.query.ids || '').split(',').map(i => jobs[i]).filter(j => j && j.state === 'done');
  if (!list.length) return res.status(404).send('Nothing to download');
  res.attachment('convertify_files.zip'); const a = archiver('zip', { store: true }), seen = {};
  a.on('error', () => res.end()); a.pipe(res);
  for (const j of list) { let n = j.name; const e = path.extname(n); if (seen[n]) n = n.slice(0, n.length - e.length) + `_${seen[n]++}` + e; else seen[n] = 1; a.file(j.path, { name: n }); }
  a.finalize();
});
setInterval(() => { for (const [id, j] of Object.entries(jobs)) if (!['working', 'zipping'].includes(j.state) && Date.now() - j.t > 36e5) { fs.unlink(j.path, () => {}); delete jobs[id]; } }, 6e5);
app.use((err, req, res, next) => { console.error(err.message); res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${lim}.` : err.message || 'Server error' }); });
const DIST = path.resolve(__dirname, '../client/dist'); // when built, this one server also serves the website
if (fs.existsSync(DIST)) { app.use(express.static(DIST)); app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html'))); }
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Convertify running on http://localhost:${PORT} (max upload ${lim}${MAX_JOBS ? `, ${MAX_JOBS} job(s) at a time` : ''})`));
server.requestTimeout = 0; server.timeout = 0; server.headersTimeout = 0;
