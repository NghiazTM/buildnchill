// Vẽ ảnh thẻ hồ sơ người chơi 1200x630 (dùng làm ảnh xem trước khi chia sẻ link).
// satori: HTML/CSS -> SVG ; resvg-wasm: SVG -> PNG. Không dùng module native.
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

const W = 1200;
const H = 630;
const GOLD = '#d4af37';

// ---------- Tìm file đi kèm function (local / Netlify Lambda) ----------
const roots = () => [process.cwd(), process.env.LAMBDA_TASK_ROOT, '/var/task', path.resolve('.')].filter(Boolean);
const findFile = (rel) => {
  for (const r of roots()) {
    const p = path.join(r, rel);
    try { if (fs.existsSync(p)) return p; } catch { /* bỏ qua */ }
  }
  return null;
};
const fetchBuf = async (url, ms = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'BuildnChill-Card/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
};
const loadAsset = async (rel, fallbackUrl) => {
  const p = findFile(rel);
  if (p) return fs.readFileSync(p);
  if (!fallbackUrl) throw new Error(`Thiếu ${rel}`);
  return fetchBuf(fallbackUrl, 8000);
};

// ---------- Khởi tạo một lần mỗi container ----------
let ready = null;
const init = () => {
  if (ready) return ready;
  ready = (async () => {
    const wasm = await loadAsset('node_modules/@resvg/resvg-wasm/index_bg.wasm', 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
    await initWasm(wasm);
    const gf = 'https://github.com/google/fonts/raw/main/ofl/bevietnampro/';
    const [regular, semibold, bold, bg, logo] = await Promise.all([
      loadAsset('netlify/assets/fonts/BeVietnamPro-Regular.ttf', `${gf}BeVietnamPro-Regular.ttf`),
      loadAsset('netlify/assets/fonts/BeVietnamPro-SemiBold.ttf', `${gf}BeVietnamPro-SemiBold.ttf`),
      loadAsset('netlify/assets/fonts/BeVietnamPro-Bold.ttf', `${gf}BeVietnamPro-Bold.ttf`),
      loadAsset('netlify/assets/card-bg.jpg').catch(() => null),
      loadAsset('netlify/assets/logo-88.png').catch(() => null),
    ]);
    return {
      fonts: [
        { name: 'BVP', data: regular, weight: 400, style: 'normal' },
        { name: 'BVP', data: semibold, weight: 600, style: 'normal' },
        { name: 'BVP', data: bold, weight: 700, style: 'normal' },
      ],
      bg: bg ? `data:image/jpeg;base64,${bg.toString('base64')}` : null,
      logo: logo ? `data:image/png;base64,${logo.toString('base64')}` : null,
    };
  })().catch((e) => { ready = null; throw e; });
  return ready;
};

// ---------- Tiện ích ----------
const h = (type, style, ...children) => ({
  type,
  props: { style: type === 'div' ? { display: 'flex', ...style } : style, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) },
});
const img = (src, style) => ({ type: 'img', props: { src, style } });

export const hoursText = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  if (s < 3600) return `${Math.max(0, Math.floor(s / 60))} phút`;
  return `${Math.floor(s / 3600).toLocaleString('vi-VN')} giờ`;
};

const badgesFor = (p) => {
  const b = [];
  if (p.rank_all === 1) b.push('Số 1 giờ chơi');
  else if (p.rank_all && p.rank_all <= 3) b.push('Top 3 giờ chơi');
  else if (p.rank_all && p.rank_all <= 10) b.push('Top 10 giờ chơi');
  if (p.rank_week === 1) b.push('Quán quân tuần');
  if (p.donate_rank && p.donate_rank <= 10) b.push('Nhà tài trợ');
  if (p.total_seconds >= 100 * 3600) b.push('Lão làng 100 giờ');
  return b.slice(0, 3);
};

const skinData = async (name) => {
  const clean = String(name).replace(/^[.*]/, '');
  for (const n of [clean, 'MHF_Steve']) {
    try {
      const buf = await fetchBuf(`https://mc-heads.net/body/${encodeURIComponent(n)}/330`, 4500);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch { /* thử ảnh mặc định */ }
  }
  return null;
};

const stat = (label, value, sub) =>
  h('div', { display: 'flex', flexDirection: 'column', padding: '18px 26px', borderRadius: 16, backgroundColor: 'rgba(17,17,19,0.78)', border: '1px solid rgba(255,255,255,0.10)', marginRight: 16, minWidth: 190 },
    h('div', { fontSize: 20, color: '#a8a29e', fontWeight: 400 }, label),
    h('div', { fontSize: 40, fontWeight: 700, color: '#f5f5f4', marginTop: 4 }, value),
    sub ? h('div', { fontSize: 18, color: '#78716c', marginTop: 2 }, sub) : null);

/**
 * profile: kết quả RPC bnc_player_profile
 * opts: { serverIp, site }
 */
export const renderPlayerCard = async (profile, { serverIp = 'buildnchill.id.vn', site = 'buildnchill.id.vn' } = {}) => {
  const { fonts, bg, logo } = await init();
  const name = String(profile.mc_username || 'Player');
  const skin = await skinData(name);
  const badges = badgesFor(profile);
  const nameSize = name.length > 13 ? 76 : name.length > 10 ? 88 : 100;

  const tree = h('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: '#09090b', fontFamily: 'BVP', color: '#f5f5f4' },
    bg ? img(bg, { position: 'absolute', left: 0, top: 0, width: W, height: H }) : null,
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: 'linear-gradient(90deg, rgba(9,9,11,0.96) 0%, rgba(9,9,11,0.82) 55%, rgba(9,9,11,0.35) 100%)' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: 6, display: 'flex', backgroundColor: GOLD }),

    // Cột chữ
    h('div', { position: 'absolute', left: 72, top: 64, width: 820, display: 'flex', flexDirection: 'column' },
      h('div', { display: 'flex', alignItems: 'center' },
        logo ? img(logo, { width: 52, height: 52, borderRadius: 12, marginRight: 16 }) : null,
        h('div', { fontSize: 28, fontWeight: 700 }, 'BuildnChill'),
        h('div', { fontSize: 24, color: '#78716c', marginLeft: 14 }, '· Hồ sơ người chơi')),
      h('div', { fontSize: nameSize, fontWeight: 700, letterSpacing: -2, marginTop: 34, lineHeight: 1.05 }, name),
      badges.length
        ? h('div', { display: 'flex', marginTop: 22 },
          badges.map((b) => h('div', { fontSize: 22, fontWeight: 600, color: GOLD, padding: '8px 18px', borderRadius: 999, border: '1.5px solid rgba(212,175,55,0.55)', backgroundColor: 'rgba(212,175,55,0.10)', marginRight: 12 }, b)))
        : null,
      h('div', { display: 'flex', marginTop: badges.length ? 34 : 44 },
        stat('Tổng giờ chơi', hoursText(profile.total_seconds)),
        stat('Hạng giờ chơi', profile.rank_all ? `#${profile.rank_all}` : '—', profile.rank_all && profile.players_tracked ? `trên ${profile.players_tracked} người` : null),
        stat('Tuần này', hoursText(profile.week_seconds)))),

    // Chân thẻ
    h('div', { position: 'absolute', left: 72, bottom: 52, display: 'flex', alignItems: 'center', fontSize: 24 },
      h('div', { color: '#a8a29e' }, 'Vào chơi:'),
      h('div', { color: GOLD, fontWeight: 600, marginLeft: 10 }, serverIp),
      h('div', { color: '#57534e', marginLeft: 18, marginRight: 18 }, '•'),
      h('div', { color: '#a8a29e' }, site)),

    // Skin
    skin ? img(skin, { position: 'absolute', right: 84, bottom: 36, height: 540, width: 225 }) : null);

  const svg = await satori(tree, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return Buffer.from(png);
};
