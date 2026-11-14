// Club Manager - zero-dependency Node server.  Run:  node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PHOTOS = path.join(DATA, 'photos'), DBF = path.join(DATA, 'db.json'), PUB = path.join(__dirname, 'public');

// ---- Storage: Supabase cloud when SUPABASE_URL + SUPABASE_KEY are set, otherwise local files in ./data ----
const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''), SB_KEY = (process.env.SUPABASE_KEY || '').trim();
const CLOUD = !!(SB_URL && SB_KEY), BUCKET = process.env.SUPABASE_BUCKET || 'focus-club';
const sb = (method, p, body, type) => fetch(SB_URL + '/storage/v1/' + p, { method, body, headers: { Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY, ...(type ? { 'Content-Type': type, 'x-upsert': 'true' } : {}) } });
async function loadDb() {
  if (!CLOUD) { fs.mkdirSync(PHOTOS, { recursive: true }); return fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : null; }
  let r = await sb('GET', 'bucket/' + BUCKET);
  if (!r.ok) {
    r = await sb('POST', 'bucket', JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), 'application/json');
    if (!r.ok) throw new Error('Cannot open or create Supabase bucket (check URL and key): ' + r.status + ' ' + await r.text());
    return null;
  }
  r = await sb('GET', `object/${BUCKET}/db.json`);
  if (r.ok) return r.json();
  const t = await r.text();
  if (r.status === 404 || /not.?found/i.test(t)) return null;   // brand-new club
  throw new Error('Cannot read club data from Supabase: ' + r.status + ' ' + t); // never start empty over existing data
}

const hash = s => crypto.createHash('sha256').update('club:' + s).digest('hex');
const uid = p => p + crypto.randomBytes(6).toString('hex');
let db;
const freshDb = () => ({
  settings: { clubName: 'FOCUS CLUB', tagline: '', fee: 100, upi: '', pinHash: hash('1234') },
  secret: crypto.randomBytes(32).toString('hex'),
  seq: { member: 0, receipt: 0 }, members: [], payments: [], transactions: [], photos: []
});
let chain = Promise.resolve();
function save() {
  if (!CLOUD) { fs.writeFileSync(DBF + '.tmp', JSON.stringify(db)); fs.renameSync(DBF + '.tmp', DBF); return Promise.resolve(); }
  const snap = JSON.stringify(db);
  chain = chain.catch(() => {}).then(async () => {
    const r = await sb('POST', `object/${BUCKET}/db.json`, snap, 'application/json');
    if (!r.ok) throw new Error('Could not save to the cloud. Please try again.');
  });
  return chain;
}

const sign = o => { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', db.secret).update(b).digest('base64url'); };
const verify = t => {
  const [b, s] = String(t || '').split('.');
  if (!b || !s || crypto.createHmac('sha256', db.secret).update(b).digest('base64url') !== s) return null;
  try { const o = JSON.parse(Buffer.from(b, 'base64url')); return o.exp > Date.now() ? o : null; } catch { return null; }
};
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  const b = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > 12e6) { no(new Error('File too large')); req.destroy(); } else b.push(c); });
  req.on('end', () => { try { ok(b.length ? JSON.parse(Buffer.concat(b)) : {}); } catch { no(new Error('Bad request')); } });
});
const saveImage = async (dataUrl, prefix) => {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image');
  const name = uid(prefix) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  const buf = Buffer.from(m[2], 'base64');
  if (CLOUD) { const r = await sb('POST', `object/${BUCKET}/photos/${name}`, buf, 'image/' + m[1]); if (!r.ok) throw new Error('Photo upload failed. Please try again.'); }
  else fs.writeFileSync(path.join(PHOTOS, name), buf);
  return 'photos/' + name;
};
const delImage = p => {
  if (!p || !p.startsWith('photos/')) return;
  if (CLOUD) sb('DELETE', `object/${BUCKET}/photos/${path.basename(p)}`).catch(() => {});
  else fs.rm(path.join(PHOTOS, path.basename(p)), () => {});
};
const pubSettings = () => ({ clubName: db.settings.clubName, tagline: db.settings.tagline, fee: db.settings.fee, upi: db.settings.upi, storage: CLOUD ? 'cloud' : 'local' });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const phone10 = v => String(v || '').replace(/\D/g, '').slice(-10);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST
const bad = msg => Object.assign(new Error(msg), { code: 400 });

async function memberFields(b, existing) {
  const name = str(b.name, 80), phone = phone10(b.phone);
  if (!name) throw bad('Name is required');
  if (phone.length !== 10) throw bad('Enter a 10-digit mobile number');
  if (db.members.some(m => m.phone === phone && m !== existing)) throw bad('This mobile number is already registered');
  const o = { name, phone, role: str(b.role, 30) || 'Member', address: str(b.address), blood: str(b.blood, 5), joined: /^\d{4}-\d{2}-\d{2}$/.test(b.joined) ? b.joined : today() };
  if (typeof b.photo === 'string' && b.photo.startsWith('data:')) { o.photo = await saveImage(b.photo, 'm_'); if (existing) delImage(existing.photo); }
  else if (b.photo === '' && existing) { delImage(existing.photo); o.photo = ''; }
  return o;
}

async function apiHandler(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, ''), M = req.method;
  if (p === 'public' && M === 'GET') return send(res, 200, { ...pubSettings(), defaultPin: db.settings.pinHash === hash('1234') });
  if (p === 'login' && M === 'POST') {
    const b = await readBody(req), exp = Date.now() + 90 * 864e5;
    if (b.role === 'admin') {
      if (hash(str(b.pin, 20)) !== db.settings.pinHash) { await new Promise(r => setTimeout(r, 800)); throw bad('Wrong PIN'); }
      return send(res, 200, { token: sign({ role: 'admin', exp }) });
    }
    const m = db.members.find(x => x.phone === phone10(b.phone));
    if (!m) throw bad('This mobile number is not registered. Please contact the club admin.');
    return send(res, 200, { token: sign({ role: 'member', id: m.id, exp }) });
  }
  const auth = verify(req.headers['x-club-token'] || (req.headers.authorization || '').replace('Bearer ', ''));
  if (!auth) return send(res, 401, { error: 'Please login again' });
  const admin = auth.role === 'admin';

  if (p === 'state' && M === 'GET') {
    if (admin) return send(res, 200, { role: 'admin', settings: pubSettings(), members: db.members, payments: db.payments, transactions: db.transactions, photos: db.photos });
    const me = db.members.find(m => m.id === auth.id);
    if (!me) return send(res, 401, { error: 'Membership not found' });
    return send(res, 200, { role: 'member', settings: pubSettings(), me, members: [me], payments: db.payments.filter(x => x.memberId === me.id), transactions: [], photos: db.photos });
  }
  if (!admin) return send(res, 403, { error: 'Admin only' });
  const b = ['POST', 'PUT'].includes(M) ? await readBody(req) : {};
  const [col, id] = p.split('/');

  if (col === 'members') {
    if (M === 'POST') { const m = { id: uid('m'), code: 'FC' + (100 + ++db.seq.member), photo: '', ...(await memberFields(b)) }; db.members.push(m); }
    else { const m = db.members.find(x => x.id === id); if (!m) throw bad('Member not found');
      if (M === 'PUT') Object.assign(m, await memberFields(b, m));
      if (M === 'DELETE') { delImage(m.photo); db.members = db.members.filter(x => x !== m); } }
  } else if (col === 'payments') {
    if (M === 'POST') {
      const m = db.members.find(x => x.id === b.memberId), amount = Math.round(Number(b.amount));
      if (!m) throw bad('Member not found');
      if (!/^\d{4}-\d{2}$/.test(b.month)) throw bad('Choose a month');
      if (!(amount > 0)) throw bad('Enter an amount');
      if (db.payments.some(x => x.memberId === m.id && x.month === b.month)) throw bad('Fee for this month is already recorded');
      const pay = { id: uid('p'), receiptNo: 'R' + String(++db.seq.receipt).padStart(4, '0'), memberId: m.id, memberName: m.name, memberCode: m.code, phone: m.phone, month: b.month, amount, mode: str(b.mode, 20) || 'Cash', date: today() };
      db.payments.push(pay); await save(); return send(res, 200, { ok: true, payment: pay });
    }
    if (M === 'DELETE') db.payments = db.payments.filter(x => x.id !== id);
  } else if (col === 'transactions') {
    if (M === 'POST') {
      const amount = Math.round(Number(b.amount));
      if (!(amount > 0)) throw bad('Enter an amount');
      if (!str(b.title)) throw bad('Enter a description');
      db.transactions.push({ id: uid('t'), type: b.type === 'income' ? 'income' : 'expense', amount, title: str(b.title, 100), category: str(b.category, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today() });
    }
    if (M === 'DELETE') db.transactions = db.transactions.filter(x => x.id !== id);
  } else if (col === 'photos') {
    if (M === 'POST') db.photos.unshift({ id: uid('ph'), src: await saveImage(b.image, 'g_'), caption: str(b.caption, 120), date: today() });
    if (M === 'DELETE') { const ph = db.photos.find(x => x.id === id); if (ph) { delImage(ph.src); db.photos = db.photos.filter(x => x !== ph); } }
  } else if (col === 'settings' && M === 'PUT') {
    if (!str(b.clubName)) throw bad('Club name is required');
    Object.assign(db.settings, { clubName: str(b.clubName, 60), tagline: str(b.tagline, 80), fee: Math.max(1, Math.round(Number(b.fee)) || 100), upi: str(b.upi, 80) });
    if (b.newPin) { if (!/^\d{4,8}$/.test(b.newPin)) throw bad('PIN must be 4 to 8 digits'); db.settings.pinHash = hash(b.newPin); }
  } else if (col === 'backup' && M === 'GET') {
    const { secret, ...rest } = db; return send(res, 200, { ...rest, settings: pubSettings() });
  } else return send(res, 404, { error: 'Not found' });
  await save(); send(res, 200, { ok: true });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return apiHandler(req, res, url).catch(e => send(res, e.code || 400, { error: e.message || 'Error' }));
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const isPhoto = rel.startsWith('/photos/');
  const file = isPhoto ? path.join(PHOTOS, path.basename(rel)) : path.join(PUB, path.normalize(rel));
  if (!isPhoto && !file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  if (isPhoto && CLOUD) return sb('GET', `object/${BUCKET}/photos/${path.basename(rel)}`).then(async r => {
    if (!r.ok) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000' });
    res.end(Buffer.from(await r.arrayBuffer()));
  }).catch(() => { res.writeHead(502); res.end(); });
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': isPhoto ? 'public, max-age=31536000' : 'no-cache' });
    res.end(buf);
  });
});
loadDb().then(async d => {
  db = d || freshDb();
  // one-time change of old IDs (M001 -> FC101)
  const fix = c => { const m = /^M(\d+)$/.exec(c || ''); return m ? 'FC' + (100 + +m[1]) : c; };
  let changed = !d;
  for (const x of db.members) if (fix(x.code) !== x.code) { x.code = fix(x.code); changed = true; }
  for (const x of db.payments) if (fix(x.memberCode) !== x.memberCode) { x.memberCode = fix(x.memberCode); changed = true; }
  if (changed) await save();
  server.listen(PORT, '0.0.0.0', () => console.log(`Club app running on port ${PORT} - storage: ${CLOUD ? 'Supabase cloud (' + BUCKET + ')' : 'local data folder'}`));
}).catch(e => { console.error('STARTUP FAILED: ' + e.message); process.exit(1); });
