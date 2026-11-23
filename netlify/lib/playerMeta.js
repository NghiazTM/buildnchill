// Gắn thẻ meta riêng (tiêu đề, mô tả, ảnh) cho trang /player/<tên> để
// Facebook / Zalo / Discord hiện thẻ xem trước của đúng người chơi.
import { hoursText, topMilestone } from './playerCard.js';

export const PLAYER_NAME_RE = /^[.*]?[A-Za-z0-9_]{2,16}$/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const setMeta = (html, key, value) => {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key.replace(/[:.]/g, '\\$&')}"\\s+content=")[^"]*(")`, 'i');
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html;
};

const num = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');

export const playerDescription = (p, clan) => {
  if (!p) return null;
  const facts = [`⏱ ${hoursText(p.total_seconds)} chơi`];
  if (p.rank_all) facts.push(`🥇 Hạng #${p.rank_all}${p.players_tracked ? `/${p.players_tracked}` : ''}`);
  const g = p.game;
  if (g && Number(g.adv_done) > 0) facts.push(`🏆 ${num(g.adv_done)}${g.adv_total ? `/${g.adv_total}` : ''} thành tựu`);
  if (g && Number(g.blocks_mined) > 0) facts.push(`⛏ ${num(g.blocks_mined)} khối`);
  const top = topMilestone(g);
  const extra = [];
  if (clan?.name) extra.push(`Clan [${clan.tag}] ${clan.name}.`);
  if (top) extra.push(`Danh hiệu: ${top}.`);
  return `${facts.join(' · ')}. ${extra.join(' ')}${extra.length ? ' ' : ''}Xem hồ sơ đầy đủ trên BuildnChill — máy chủ Minecraft sinh tồn Việt Nam.`;
};

const insertHead = (html, tags) => html.replace(/<\/head>/i, `${tags}
  </head>`);

export const injectPlayerMeta = (html, { name, profile, clan, site, version }) => {
  const display = profile?.mc_username || name;
  const url = `${site}/player/${encodeURIComponent(display)}`;
  const title = `${display}${clan?.tag ? ` [${clan.tag}]` : ''} — Hồ sơ người chơi | BuildnChill`;
  const desc = playerDescription(profile, clan) || `Hồ sơ người chơi ${display} trên máy chủ Minecraft BuildnChill.`;
  // "c2" = phiên bản thiết kế thẻ: đổi khi sửa ảnh để Discord/Facebook/Zalo tải lại ảnh mới
  const image = profile ? `${site}/api/player-card/${encodeURIComponent(display)}.png?v=c2-${version}` : null;

  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  out = out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(url)}$2`);
  out = setMeta(out, 'description', desc);
  out = setMeta(out, 'og:type', 'profile');
  out = setMeta(out, 'og:url', url);
  out = setMeta(out, 'og:title', title);
  out = setMeta(out, 'og:description', desc);
  out = setMeta(out, 'twitter:title', title);
  out = setMeta(out, 'twitter:description', desc);
  out = insertHead(out, `  <meta property="profile:username" content="${esc(display)}" />`);
  if (image) {
    const alt = `Thẻ hồ sơ ${display} — BuildnChill`;
    out = setMeta(out, 'og:image', image);
    out = setMeta(out, 'og:image:secure_url', image);
    out = setMeta(out, 'og:image:type', 'image/png');
    out = setMeta(out, 'og:image:alt', alt);
    out = setMeta(out, 'twitter:image', image);
    out = setMeta(out, 'twitter:image:alt', alt);
  }
  return out;
};
