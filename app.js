const $ = s => document.querySelector(s), app = $('#app'), modal = $('#modal');
const store = { get() { try { return localStorage.getItem('clubToken') || ''; } catch { return ''; } }, set(v) { try { v ? localStorage.setItem('clubToken', v) : store.set(''); } catch {} } };
let token = store.get(), S = null, PUBLIC = { clubName: 'FOCUS CLUB' };
let tab = '', q = '', moneyMonth = '', loginRole = 'member', curCanvas = null, curName = '', formPhoto;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const curMonth = () => today().slice(0, 7);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mLabel = m => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const dLabel = d => +d.slice(8, 10) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
const sum = a => a.reduce((t, x) => t + x.amount, 0);
const initials = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = (m, cls = '') => m.photo ? `<img class="av ${cls}" src="${esc(m.photo)}" alt="">` : `<div class="av ${cls}">${esc(initials(m.name))}</div>`;
const wa = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
const ph = m => m.cc ? `+${m.cc} ${m.phone.slice(m.cc.length)}` : '+' + m.phone;
const COUNTRIES = [['91', 'India'], ['971', 'UAE'], ['966', 'Saudi Arabia'], ['974', 'Qatar'], ['965', 'Kuwait'], ['968', 'Oman'], ['973', 'Bahrain'], ['60', 'Malaysia'], ['65', 'Singapore'], ['94', 'Sri Lanka'], ['44', 'UK'], ['1', 'USA / Canada'], ['61', 'Australia'], ['64', 'New Zealand'], ['49', 'Germany'], ['33', 'France'], ['39', 'Italy'], ['353', 'Ireland'], ['31', 'Netherlands'], ['41', 'Switzerland'], ['81', 'Japan'], ['82', 'South Korea'], ['86', 'China'], ['27', 'South Africa']];
function pickCc(sel) { if (sel.value !== 'other') return; const c = (prompt('Enter the country code, numbers only (for example 20 for Egypt)') || '').replace(/\D/g, ''); if (c) { const o = new Option('+' + c, c); sel.add(o, sel.options.length - 1); sel.value = c; } else sel.value = '91'; }
const val = id => ($('#' + id)?.value ?? '').trim();

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
function showModal(title, html) { modal.innerHTML = `<div class="sheet"><h2><span>${esc(title)}</span><button class="x" onclick="closeModal()" aria-label="Close">✕</button></h2>${html}</div>`; modal.classList.add('show'); }
function closeModal() { modal.classList.remove('show'); modal.innerHTML = ''; }
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

async function api(method, url, body) {
  const r = await fetch('api/' + url, { method, headers: { 'Content-Type': 'application/json', 'X-Club-Token': token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { const had = !!S; logout(); throw new Error(had ? 'Session ended. Please login again.' : 'Login did not work. Please try again.'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
async function run(fn) { try { return await fn(); } catch (e) { toast(e.message); } }
async function load() { S = await api('GET', 'state'); document.title = S.settings.clubName; render(); }
function logout() { token = ''; S = null; store.set(''); closeModal(); render(); }
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

const CAN_SHARE = typeof navigator.canShare === 'function';

/* ---------- Login ---------- */
function renderLogin() {
  const a = loginRole === 'admin';
  app.innerHTML = `<div class="login">
    <img class="biglogo" src="logo.png" alt=""><h1>${esc(PUBLIC.clubName)}</h1><p class="tag">${esc(PUBLIC.tagline || 'Members & accounts')}</p>
    <div class="box">
      <div class="seg"><button class="${a ? '' : 'on'}" onclick="loginRole='member';renderLogin()">Member</button><button class="${a ? 'on' : ''}" onclick="loginRole='admin';renderLogin()">Admin</button></div>
      <form onsubmit="doLogin(event)">
      ${a ? `<label for="pin">Admin PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Enter PIN">`
          : `<label for="ph">Your registered mobile number</label><input id="ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="Mobile number">`}
      <button class="btn block" style="margin-top:14px">Login</button></form>
      ${a && PUBLIC.defaultPin ? '<p class="hint">First time? The PIN is <b>1234</b>. Change it in Settings after login.</p>' : ''}
      ${a ? '' : '<p class="hint">Login to download your membership card and see your payment receipts. Members outside India: if it asks, type your number with the country code.</p>'}
    </div>
    <p class="hint w">Install as app — Android: Chrome menu ⋮ → Add to Home screen. iPhone: Safari Share → Add to Home Screen.</p>
  </div>`;
}
function doLogin(e) {
  e.preventDefault();
  run(async () => {
    const j = await api('POST', 'login', loginRole === 'admin' ? { role: 'admin', pin: val('pin') } : { role: 'member', phone: val('ph') });
    token = j.token; store.set(token); tab = ''; await load();
  });
}

/* ---------- Shell ---------- */
function render() {
  if (!token || !S) return renderLogin();
  const admin = S.role === 'admin';
  const tabs = admin ? [['home', '🏠', 'Home'], ['members', '👥', 'Members'], ['money', '💰', 'Accounts'], ['photos', '📸', 'Moments'], ['settings', '⚙️', 'Settings']]
                     : [['card', '🪪', 'My Card'], ['pay', '🧾', 'Payments'], ['photos', '📸', 'Moments']];
  if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
  app.innerHTML = `<header><img class="hlogo" src="logo.png" alt=""><h1>${esc(S.settings.clubName)}<small>${admin ? 'Admin' : esc(S.me.name)}</small></h1>${admin ? '' : '<button onclick="logout()">Logout</button>'}</header>
    <main>${VIEWS[tab]()}</main>
    <nav>${tabs.map(t => `<button class="${t[0] === tab ? 'on' : ''}" onclick="go('${t[0]}')"><span>${t[1]}</span>${t[2]}</button>`).join('')}</nav>`;
  if (tab === 'card') drawMyCard();
}

const totals = () => { const fees = sum(S.payments), inc = fees + sum(S.transactions.filter(t => t.type === 'income')), exp = sum(S.transactions.filter(t => t.type === 'expense')); return { fees, inc, exp, bal: inc - exp }; };
const paidSet = m => new Set(S.payments.filter(p => p.month === m).map(p => p.memberId));
const remindText = m => `Hello ${m.name}, this is a reminder from *${S.settings.clubName}*. Your monthly membership fee of ${fmt(S.settings.fee)} for ${mLabel(curMonth())} is pending. Thank you!`;

const VIEWS = {
  home() {
    const t = totals(), m = curMonth(), paid = paidSet(m), pending = S.members.filter(x => !paid.has(x.id));
    return `<div class="card hero"><div class="lbl">Club balance</div><div class="big">${fmt(t.bal)}</div>
      <div class="split"><div><small>Total income</small>${fmt(t.inc)}</div><div><small>Total expenses</small>${fmt(t.exp)}</div></div></div>
      <div class="stats"><div class="card"><b>${S.members.length}</b><small>Members</small></div><div class="card"><b>${paid.size}</b><small>Paid ${mLabel(m)}</small></div><div class="card"><b>${pending.length}</b><small>Pending</small></div></div>
      <div class="card"><h2>Fee pending — ${mLabel(m)}</h2>
      ${!S.members.length ? `<div class="empty">No members yet.<br><br><button class="btn" onclick="go('members');openMemberForm()">+ Add first member</button></div>`
        : !pending.length ? '<div class="empty">Everyone has paid this month 🎉</div>'
        : pending.map(x => `<div class="row">${avatar(x)}<div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${x.code} · ${ph(x)}</div></div>
          <a class="btn sm ghost" target="_blank" rel="noopener" href="${wa(x.phone, remindText(x))}">Remind</a><button class="btn sm" onclick="openPay('${x.id}')">Collect</button></div>`).join('')}</div>`;
  },
  members() {
    return `<div class="btns" style="margin-bottom:12px"><input type="search" placeholder="Search name, ID or mobile" value="${esc(q)}" oninput="q=this.value;$('#mlist').innerHTML=memberList()" style="flex:3" aria-label="Search members"><button class="btn" onclick="openMemberForm()">+ Add</button></div>
      <div class="card" id="mlist">${memberList()}</div>`;
  },
  money() {
    const rows = [...S.payments.map(p => ({ k: 'p', id: p.id, date: p.date, type: 'income', title: 'Membership fee — ' + p.memberName, sub: `${mLabel(p.month)} · ${p.receiptNo} · ${p.mode}`, amount: p.amount })),
                  ...S.transactions.map(t => ({ k: 't', id: t.id, date: t.date, type: t.type, title: t.title, sub: t.category || (t.type === 'income' ? 'Income' : 'Expense'), amount: t.amount }))]
      .filter(r => !moneyMonth || r.date.startsWith(moneyMonth)).sort((a, b) => b.date.localeCompare(a.date));
    const inc = sum(rows.filter(r => r.type === 'income')), exp = sum(rows.filter(r => r.type === 'expense'));
    return `<div class="btns" style="margin-bottom:12px"><button class="btn" style="background:var(--ok)" onclick="openTx('income')">+ Income</button><button class="btn" style="background:var(--bad)" onclick="openTx('expense')">+ Expense</button></div>
      <div class="card"><div class="btns" style="align-items:center"><input type="month" value="${moneyMonth}" onchange="moneyMonth=this.value;render()" aria-label="Filter by month" style="flex:3"><button class="btn sm ghost" onclick="moneyMonth='';render()">All time</button></div>
      <div class="kv" style="margin-top:8px"><span>Income</span><b class="in">${fmt(inc)}</b></div><div class="kv"><span>Expenses</span><b class="out">${fmt(exp)}</b></div><div class="kv"><span>Balance (${moneyMonth ? mLabel(moneyMonth) : 'all time'})</span><b>${fmt(inc - exp)}</b></div></div>
      <div class="card"><h2 style="display:flex;justify-content:space-between;align-items:center">Entries <button class="btn sm ghost" onclick="exportCsv()">Download CSV</button></h2>
      ${rows.length ? rows.map(r => `<div class="row tap" onclick="${r.k === 'p' ? `openReceipt('${r.id}')` : `openEntry('${r.id}')`}"><div class="grow"><div class="t">${esc(r.title)}</div><div class="s">${dLabel(r.date)} · ${esc(r.sub)}</div></div><div class="amt ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '−'}${fmt(r.amount)}</div></div>`).join('') : '<div class="empty">No entries yet.</div>'}</div>`;
  },
  photos() {
    const admin = S.role === 'admin';
    return `${admin ? `<label class="btn block" style="margin:0 0 12px;color:#fff;font-size:16px">📷 Add photos<input type="file" accept="image/*" multiple hidden onchange="uploadPhotos(this.files)"></label>` : ''}
      ${S.photos.length ? `<div class="grid">${S.photos.map(p => `<img loading="lazy" src="${esc(p.src)}" alt="${esc(p.caption || 'Club photo')}" onclick="openPhoto('${p.id}')">`).join('')}</div>` : `<div class="card empty">No club moments yet.${admin ? ' Tap “Add photos” to upload.' : ''}</div>`}`;
  },
  settings() {
    const s = S.settings;
    return `<div class="card"><h2>Club details</h2>
      <label for="s_name">Club name</label><input id="s_name" value="${esc(s.clubName)}">
      <label for="s_tag">Tagline / place (shown on card)</label><input id="s_tag" value="${esc(s.tagline)}" placeholder="e.g. Chennai · Estd. 2015">
      <div class="two"><div><label for="s_fee">Monthly fee (₹)</label><input id="s_fee" type="number" inputmode="numeric" value="${s.fee}"></div><div><label for="s_upi">UPI ID (optional)</label><input id="s_upi" value="${esc(s.upi)}" placeholder="name@bank"></div></div>
      <label for="s_pin">New admin PIN (leave blank to keep)</label><input id="s_pin" type="password" inputmode="numeric" placeholder="4 to 8 digits" autocomplete="new-password">
      <button class="btn block" style="margin-top:14px" onclick="saveSettings()">Save</button></div>
      <div class="card"><h2>Data</h2><div class="btns"><button class="btn ghost" onclick="backup()">Download backup</button><button class="btn red" onclick="logout()">Logout</button></div>
      <p class="hint">Data is saved in: <b>${s.storage === 'cloud' ? 'Supabase cloud ☁️' : 'this server (not cloud yet)'}</b></p><p class="hint">Members log in with their registered mobile number to get their card and receipts.</p></div>`;
  },
  card() {
    const m = S.me;
    return `<div class="card"><div id="cardbox" class="empty">Preparing your card…</div>
      <div class="btns"><button class="btn" onclick="saveCanvas()">⬇ Download card</button>${CAN_SHARE ? '<button class="btn ghost" onclick="shareCanvas()">Share</button>' : ''}</div></div>
      <div class="card"><h2>My details</h2><div class="kv"><span>Member ID</span><b>${m.code}</b></div><div class="kv"><span>Role</span><b>${esc(m.role || 'Member')}</b></div><div class="kv"><span>Mobile</span><b>${ph(m)}</b></div>
      <div class="kv"><span>Blood group</span><b>${esc(m.blood || '—')}</b></div><div class="kv"><span>Member since</span><b>${dLabel(m.joined)}</b></div><div class="kv"><span>Address</span><b>${esc(m.address || '—')}</b></div></div>`;
  },
  pay() {
    const s = S.settings, m = curMonth(), paid = S.payments.some(p => p.month === m);
    const upi = s.upi ? `upi://pay?pa=${encodeURIComponent(s.upi)}&pn=${encodeURIComponent(s.clubName)}&am=${s.fee}&cu=INR&tn=${encodeURIComponent('Membership ' + mLabel(m) + ' ' + S.me.code)}` : '';
    return `<div class="card"><div class="row"><div class="grow"><div class="t">${mLabel(m)} membership</div><div class="s">Monthly fee ${fmt(s.fee)}</div></div><span class="pill ${paid ? 'ok' : 'due'}">${paid ? 'Paid' : 'Pending'}</span></div>
      ${paid ? '' : upi ? `<a class="btn block" href="${upi}" style="margin-top:10px">Pay ${fmt(s.fee)} by UPI</a><p class="hint">After paying, the admin will confirm it and your receipt will appear here.</p>` : '<p class="hint">Pay the club admin. Your receipt will appear here once it is recorded.</p>'}</div>
      <div class="card"><h2>My receipts</h2>${payRows(S.payments) || '<div class="empty">No payments yet.</div>'}</div>`;
  }
};
const payRows = list => [...list].sort((a, b) => b.month.localeCompare(a.month)).map(p => `<div class="row tap" onclick="openReceipt('${p.id}')"><div class="grow"><div class="t">${mLabel(p.month)}</div><div class="s">${p.receiptNo} · ${dLabel(p.date)} · ${esc(p.mode)}</div></div><div class="amt in">${fmt(p.amount)}</div><span class="btn sm ghost">Receipt</span></div>`).join('');

function memberList() {
  const paid = paidSet(curMonth()), k = q.toLowerCase().trim();
  const list = S.members.filter(m => !k || (m.name + ' ' + m.code + ' ' + m.phone).toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name));
  return list.length ? list.map(m => `<div class="row tap" onclick="openMember('${m.id}')">${avatar(m)}<div class="grow"><div class="t">${esc(m.name)}</div><div class="s">${m.code} · ${ph(m)}${m.role && m.role !== 'Member' ? ' · ' + esc(m.role) : ''}</div></div><span class="pill ${paid.has(m.id) ? 'ok' : 'due'}">${paid.has(m.id) ? 'Paid' : 'Due'}</span></div>`).join('')
    : `<div class="empty">${S.members.length ? 'No member matches your search.' : 'No members yet. Tap “+ Add”.'}</div>`;
}

/* ---------- Members ---------- */
function openMember(id) {
  const m = S.members.find(x => x.id === id); if (!m) return;
  const pays = S.payments.filter(p => p.memberId === id);
  showModal('Member', `<div style="display:flex;gap:14px;align-items:center;margin:6px 0 12px">${avatar(m, 'lg')}<div><div style="font-size:19px;font-weight:700">${esc(m.name)}</div><div style="color:var(--p2);font-weight:600">${esc(m.role || 'Member')}</div><div class="s" style="color:var(--mut)">${m.code} · <a href="tel:+${m.phone}">${ph(m)}</a></div></div></div>
    <div class="kv"><span>Blood group</span><b>${esc(m.blood || '—')}</b></div><div class="kv"><span>Member since</span><b>${dLabel(m.joined)}</b></div><div class="kv"><span>Address</span><b>${esc(m.address || '—')}</b></div><div class="kv"><span>Total paid</span><b>${fmt(sum(pays))}</b></div>
    <div class="btns" style="margin:14px 0 8px"><button class="btn" onclick="openPay('${id}')">Collect fee</button><button class="btn ghost" onclick="openCard('${id}')">Membership card</button></div>
    <div class="btns"><button class="btn ghost" onclick="openMemberForm('${id}')">Edit</button><button class="btn red" onclick="delMember('${id}')">Delete</button></div>
    <h2 style="margin-top:16px;font-size:15px">Payments</h2>${payRows(pays) || '<div class="empty">No payments yet.</div>'}`);
}
function openMemberForm(id) {
  const m = S.members.find(x => x.id === id) || { name: '', cc: '91', phone: '', role: 'Member', address: '', blood: '', joined: today() };
  const cc = m.cc || '91';
  formPhoto = undefined;
  showModal(id ? 'Edit member' : 'Add member', `<form onsubmit="saveMember(event,'${id || ''}')">
    <label for="f_name">Full name</label><input id="f_name" value="${esc(m.name)}" autocomplete="off" required>
    <label for="f_phone">WhatsApp / mobile number</label><div class="two"><div style="flex:0 0 42%"><select id="f_cc" aria-label="Country code" onchange="pickCc(this)">${(COUNTRIES.some(c => c[0] === cc) ? COUNTRIES : [[cc, 'Other'], ...COUNTRIES]).map(c => `<option value="${c[0]}" ${c[0] === cc ? 'selected' : ''}>${c[1]} +${c[0]}</option>`).join('')}<option value="other">Other country…</option></select></div><div><input id="f_phone" type="tel" inputmode="numeric" value="${esc(m.phone.slice(m.phone && m.cc ? m.cc.length : 0))}" placeholder="Number without country code" required></div></div>
    <label for="f_role">Role in club</label><input id="f_role" list="roles" value="${esc(m.role || 'Member')}" autocomplete="off" placeholder="Choose or type a role">
    <datalist id="roles">${['President', 'Vice President', 'Secretary', 'Joint Secretary', 'Treasurer', 'Committee Member', 'Coach', 'Captain', 'Player', 'Member'].map(r => `<option value="${r}">`).join('')}</datalist>
    <div class="two"><div><label for="f_blood">Blood group</label><select id="f_blood">${['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(b => `<option ${b === m.blood ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    <div><label for="f_joined">Joining date</label><input id="f_joined" type="date" value="${m.joined}"></div></div>
    <label for="f_addr">Address</label><input id="f_addr" value="${esc(m.address)}" autocomplete="off">
    <label for="f_photo">Photo (for membership card)</label><input id="f_photo" type="file" accept="image/*" onchange="pickPhoto(this)">
    <button class="btn block" style="margin-top:16px">Save member</button></form>`);
}
async function pickPhoto(inp) { if (inp.files[0]) formPhoto = await run(() => resizeImage(inp.files[0], 400, .85, true)); }
function saveMember(e, id) {
  e.preventDefault();
  run(async () => {
    const body = { name: val('f_name'), cc: val('f_cc'), phone: val('f_phone'), role: val('f_role'), blood: val('f_blood'), joined: val('f_joined'), address: val('f_addr'), photo: formPhoto };
    await api(id ? 'PUT' : 'POST', 'members' + (id ? '/' + id : ''), body);
    closeModal(); await load(); toast('Member saved'); if (id) openMember(id);
  });
}
function delMember(id) { if (confirm('Delete this member? Their past payments stay in the accounts.')) run(async () => { await api('DELETE', 'members/' + id); closeModal(); await load(); toast('Member deleted'); }); }

/* ---------- Fee & receipts ---------- */
function openPay(id) {
  const m = S.members.find(x => x.id === id);
  showModal('Collect fee', `<p style="margin:4px 0 0"><b>${esc(m.name)}</b> · ${m.code}</p><form onsubmit="savePay(event,'${id}')">
    <div class="two"><div><label for="p_month">For month</label><input id="p_month" type="month" value="${curMonth()}" required></div><div><label for="p_amt">Amount (₹)</label><input id="p_amt" type="number" inputmode="numeric" value="${S.settings.fee}" required></div></div>
    <label for="p_mode">Paid by</label><select id="p_mode"><option>Cash</option><option>UPI</option><option>Bank transfer</option></select>
    <button class="btn block" style="margin-top:16px">Save & create receipt</button></form>`);
}
function savePay(e, id) {
  e.preventDefault();
  run(async () => { const j = await api('POST', 'payments', { memberId: id, month: val('p_month'), amount: val('p_amt'), mode: val('p_mode') }); await load(); openReceipt(j.payment.id); });
}
const receiptText = p => `*${S.settings.clubName}*\nPAYMENT RECEIPT\n\nReceipt No: ${p.receiptNo}\nDate: ${dLabel(p.date)}\nMember: ${p.memberName} (${p.memberCode})\nFor: Monthly membership - ${mLabel(p.month)}\nAmount: ${fmt(p.amount)}\nPaid by: ${p.mode}\n\nThank you! 🙏`;
async function openReceipt(pid) {
  const p = S.payments.find(x => x.id === pid); if (!p) return;
  curCanvas = makeReceipt(p, await loadImg('logo.png')); curName = `Receipt-${p.receiptNo}.png`;
  const admin = S.role === 'admin';
  showModal('Receipt ' + p.receiptNo, `<img class="full" style="border:1px solid var(--line)" src="${curCanvas.toDataURL('image/png')}" alt="Receipt ${p.receiptNo} for ${esc(p.memberName)}, ${fmt(p.amount)}">
    <a class="btn wa block" target="_blank" rel="noopener" href="${admin ? wa(p.phone, receiptText(p)) : 'https://wa.me/?text=' + encodeURIComponent(receiptText(p))}">${admin ? 'Send receipt on WhatsApp' : 'Share on WhatsApp'}</a>
    <div class="btns" style="margin-top:8px"><button class="btn ghost" onclick="saveCanvas()">⬇ Download</button>${CAN_SHARE ? '<button class="btn ghost" onclick="shareCanvas()">Share image</button>' : ''}${admin ? `<button class="btn red" onclick="delPay('${pid}')">Delete</button>` : ''}</div>`);
}
function delPay(id) { if (confirm('Delete this payment and its receipt?')) run(async () => { await api('DELETE', 'payments/' + id); closeModal(); await load(); }); }

/* ---------- Income / expense ---------- */
function openTx(type) {
  const cats = type === 'income' ? ['Donation', 'Sponsorship', 'Event', 'Other'] : ['Event', 'Rent', 'Food', 'Equipment', 'Travel', 'Maintenance', 'Other'];
  showModal(type === 'income' ? 'Add income' : 'Add expense', `<form onsubmit="saveTx(event,'${type}')">
    <label for="t_title">Description</label><input id="t_title" autocomplete="off" required placeholder="${type === 'income' ? 'e.g. Donation from sponsor' : 'e.g. Hall rent'}">
    <div class="two"><div><label for="t_amt">Amount (₹)</label><input id="t_amt" type="number" inputmode="numeric" required></div><div><label for="t_date">Date</label><input id="t_date" type="date" value="${today()}"></div></div>
    <label for="t_cat">Category</label><select id="t_cat">${cats.map(c => `<option>${c}</option>`).join('')}</select>
    <button class="btn block" style="margin-top:16px">Save</button></form>`);
}
function saveTx(e, type) { e.preventDefault(); run(async () => { await api('POST', 'transactions', { type, title: val('t_title'), amount: val('t_amt'), date: val('t_date'), category: val('t_cat') }); closeModal(); await load(); toast('Saved'); }); }
function openEntry(id) {
  const t = S.transactions.find(x => x.id === id); if (!t) return;
  showModal(t.type === 'income' ? 'Income' : 'Expense', `<div class="kv"><span>Description</span><b>${esc(t.title)}</b></div><div class="kv"><span>Amount</span><b>${fmt(t.amount)}</b></div><div class="kv"><span>Date</span><b>${dLabel(t.date)}</b></div><div class="kv"><span>Category</span><b>${esc(t.category || '—')}</b></div>
    <button class="btn red block" style="margin-top:14px" onclick="delTx('${id}')">Delete entry</button>`);
}
function delTx(id) { if (confirm('Delete this entry?')) run(async () => { await api('DELETE', 'transactions/' + id); closeModal(); await load(); }); }
function exportCsv() {
  const c = v => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount'],
    ...S.payments.map(p => [p.date, 'Income', `Membership fee ${mLabel(p.month)} - ${p.memberName} (${p.receiptNo})`, 'Membership', p.amount]),
    ...S.transactions.map(t => [t.date, t.type === 'income' ? 'Income' : 'Expense', t.title, t.category, t.amount])]
    .filter((r, i) => !i || !moneyMonth || r[0].startsWith(moneyMonth));
  download(URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(c).join(',')).join('\n')], { type: 'text/csv' })), `club-accounts-${moneyMonth || 'all'}.csv`);
}

/* ---------- Photos ---------- */
async function uploadPhotos(files) {
  const caption = files.length ? (prompt('Caption for these photos (optional)') || '') : '';
  let n = 0;
  for (const f of files) { toast(`Uploading ${++n} of ${files.length}…`); const ok = await run(async () => { await api('POST', 'photos', { image: await resizeImage(f, 1600, .82), caption }); return 1; }); if (!ok) break; }
  await run(load);
}
function openPhoto(id) {
  const p = S.photos.find(x => x.id === id); if (!p) return;
  showModal(p.caption || 'Club moment', `<img class="full" src="${esc(p.src)}" alt="${esc(p.caption || 'Club photo')}"><p class="hint" style="margin:0 0 10px">Added ${dLabel(p.date)}</p>
    <div class="btns"><a class="btn ghost" href="${esc(p.src)}" download="club-photo.jpg">⬇ Download</a>${S.role === 'admin' ? `<button class="btn red" onclick="delPhoto('${id}')">Delete</button>` : ''}</div>`);
}
function delPhoto(id) { if (confirm('Delete this photo?')) run(async () => { await api('DELETE', 'photos/' + id); closeModal(); await load(); }); }

/* ---------- Settings ---------- */
function saveSettings() { run(async () => { await api('PUT', 'settings', { clubName: val('s_name'), tagline: val('s_tag'), fee: val('s_fee'), upi: val('s_upi'), newPin: val('s_pin') }); await load(); toast('Settings saved'); }); }
function backup() { run(async () => { const j = await api('GET', 'backup'); download(URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' })), `club-backup-${today()}.json`); }); }

/* ---------- Images / canvas ---------- */
const loadImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
async function resizeImage(file, max, quality, square) {
  const url = URL.createObjectURL(file), img = await loadImg(url); URL.revokeObjectURL(url);
  if (!img) throw new Error('Could not read that image');
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (square) { const s = Math.min(img.width, img.height); c.width = c.height = Math.min(max, s); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height); }
  else { const k = Math.min(1, max / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); x.drawImage(img, 0, 0, c.width, c.height); }
  return c.toDataURL('image/jpeg', quality);
}
function rr(x, l, t, w, h, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
function fit(x, text, l, t, maxW, size, weight = '700') { do { x.font = `${weight} ${size}px ${FONT}`; size -= 2; } while (x.measureText(text).width > maxW && size > 14); x.fillText(text, l, t); }

async function makeCard(m) {
  const logo = await loadImg('logo.png');
  const W = 1012, H = 638, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#243f73'); g.addColorStop(1, '#3f8fcf');
  rr(x, 0, 0, W, H, 44); x.fillStyle = g; x.fill();
  x.save(); x.clip(); x.globalAlpha = .08; x.fillStyle = '#fff';
  x.beginPath(); x.arc(930, 60, 230, 0, 7); x.fill(); x.beginPath(); x.arc(760, 700, 200, 0, 7); x.fill(); x.restore();
  x.textBaseline = 'top'; x.fillStyle = '#fff'; fit(x, S.settings.clubName, 56, 46, 730, 54);
  if (logo) { x.save(); x.beginPath(); x.arc(892, 100, 68, 0, 7); x.fillStyle = '#fff'; x.fill(); x.clip(); x.drawImage(logo, 892 - 62, 100 - 62, 124, 124); x.restore(); }
  x.fillStyle = '#ffd166'; x.font = `600 24px ${FONT}`; x.fillText('M E M B E R S H I P   C A R D', 56, 118);
  const px = 56, py = 196, ps = 260, img = m.photo ? await loadImg(m.photo) : null;
  x.save(); rr(x, px, py, ps, ps, 30); x.clip();
  if (img) { const s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, px, py, ps, ps); }
  else { x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(px, py, ps, ps); x.fillStyle = '#fff'; x.font = `700 110px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(initials(m.name), px + ps / 2, py + ps / 2 + 6); }
  x.restore(); x.textAlign = 'left'; x.textBaseline = 'top';
  x.fillStyle = '#fff'; fit(x, m.name, 356, 192, 600, 50);
  x.fillStyle = '#ffd166'; fit(x, (m.role || 'Member').toUpperCase(), 356, 250, 600, 28, '700');
  [['MEMBER ID', m.code, 356, 306], ['MOBILE', ph(m), 620, 306], ['BLOOD GROUP', m.blood || '—', 356, 396], ['MEMBER SINCE', dLabel(m.joined), 620, 396]].forEach(([k, v, l, t]) => {
    x.fillStyle = 'rgba(255,255,255,.72)'; x.font = `600 20px ${FONT}`; x.fillText(k, l, t);
    x.fillStyle = '#fff'; fit(x, v, l, t + 28, 336, 34);
  });
  x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(56, 518, W - 112, 2);
  x.fillStyle = 'rgba(255,255,255,.85)'; fit(x, S.settings.tagline || 'Valid while monthly membership is active', 56, 546, 900, 24, '500');
  return c;
}
function makeReceipt(p, logo) {
  const W = 800, H = 880, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#243f73'); g.addColorStop(1, '#3f8fcf'); x.fillStyle = g; x.fillRect(0, 0, W, 170);
  x.textBaseline = 'top'; x.fillStyle = '#fff'; fit(x, S.settings.clubName, 50, 42, 540, 46);
  if (logo) { x.save(); x.beginPath(); x.arc(685, 85, 62, 0, 7); x.fillStyle = '#fff'; x.fill(); x.clip(); x.drawImage(logo, 685 - 57, 85 - 57, 114, 114); x.restore(); }
  x.font = `600 22px ${FONT}`; x.fillStyle = '#ffd166'; x.fillText('PAYMENT RECEIPT', 50, 108);
  let y = 215;
  [['Receipt No', p.receiptNo], ['Date', dLabel(p.date)], ['Member', p.memberName], ['Member ID', p.memberCode], ['Towards', 'Monthly membership — ' + mLabel(p.month)], ['Paid by', p.mode]].forEach(([k, v]) => {
    x.fillStyle = '#6b7686'; x.font = `500 24px ${FONT}`; x.textAlign = 'left'; x.fillText(k, 50, y);
    x.fillStyle = '#17202e'; x.textAlign = 'right'; fit(x, v, 750, y, 480, 26, '600');
    x.fillStyle = '#e3e7ee'; x.fillRect(50, y + 48, 700, 2); y += 74;
  });
  rr(x, 50, y + 12, 700, 110, 18); x.fillStyle = '#e9f6f0'; x.fill();
  x.fillStyle = '#12805c'; x.textAlign = 'left'; x.font = `600 26px ${FONT}`; x.fillText('Amount received', 80, y + 52);
  x.textAlign = 'right'; x.font = `700 50px ${FONT}`; x.fillText(fmt(p.amount), 720, y + 40);
  x.textAlign = 'center'; x.fillStyle = '#6b7686'; x.font = `500 21px ${FONT}`; x.fillText('Thank you for your support. This is a computer-generated receipt.', W / 2, H - 56);
  return c;
}
async function drawMyCard() { curCanvas = await makeCard(S.me); curName = `Membership-Card-${S.me.code}.png`; const b = $('#cardbox'); if (b) { b.className = ''; b.innerHTML = `<img class="full" style="margin-top:0" src="${curCanvas.toDataURL('image/png')}" alt="Membership card of ${esc(S.me.name)}, ID ${S.me.code}">`; } }
async function openCard(id) {
  const m = S.members.find(x => x.id === id); curCanvas = await makeCard(m); curName = `Membership-Card-${m.code}.png`;
  showModal('Membership card', `<img class="full" src="${curCanvas.toDataURL('image/png')}" alt="Membership card of ${esc(m.name)}">
    <div class="btns"><button class="btn" onclick="saveCanvas()">⬇ Download</button>${CAN_SHARE ? '<button class="btn ghost" onclick="shareCanvas()">Share</button>' : ''}</div>
    <p class="hint">${esc(m.name)} can also download this card by logging in with mobile number ${ph(m)}.</p>`);
}
function download(href, name) { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
function saveCanvas() { if (curCanvas) download(curCanvas.toDataURL('image/png'), curName); }
function shareCanvas() {
  if (!curCanvas) return;
  curCanvas.toBlob(async b => { const f = new File([b], curName, { type: 'image/png' }); try { if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: S.settings.clubName }); else saveCanvas(); } catch (e) { if (e.name !== 'AbortError') saveCanvas(); } });
}

/* ---------- Start ---------- */
(async () => {
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
  try { PUBLIC = await (await fetch('api/public')).json(); document.title = PUBLIC.clubName; } catch {}
  if (token) { try { await load(); } catch {} }
  if (!S) render();
})();
