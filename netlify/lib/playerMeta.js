// Gắn thẻ meta riêng (tiêu đề, mô tả, ảnh) cho trang /player/<tên> để
// Facebook / Zalo / Discord hiện thẻ xem trước của đúng người chơi.
import { hoursText } from './playerCard.js';

export const PLAYER_NAME_RE = /^[.*]?[A-Za-z0-9_]{2,16}$/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const setMeta = (html, key, value) => {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key.replace(/[:.]/g, '\\$&')}"\\s+content=")[^"]*(")`, 'i');
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html;
};

export const playerDescription = (p) => {
  if (!p) return null;
  const parts = [`${p.mc_username} đã chơi ${hoursText(p.total_seconds)} trên BuildnChill`];
  if (p.rank_all) parts[0] += ` — hạng #${p.rank_all} thời gian chơi`;
  if (p.week_seconds > 0) parts.push(`Tuần này: ${hoursText(p.week_seconds)}.`);
  parts.push('Xem hồ sơ và bảng xếp hạng máy chủ Minecraft sinh tồn Việt Nam.');
  return `${parts[0]}. ${parts.slice(1).join(' ')}`;
};

export const injectPlayerMeta = (html, { name, profile, site, version }) => {
  const display = profile?.mc_username || name;
  const url = `${site}/player/${encodeURIComponent(display)}`;
  const title = `${display} — Hồ sơ người chơi | BuildnChill`;
  const desc = playerDescription(profile) || `Hồ sơ người chơi ${display} trên máy chủ Minecraft BuildnChill.`;
  const image = profile ? `${site}/api/player-card/${encodeURIComponent(display)}.png?v=${version}` : null;

  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  out = out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(url)}$2`);
  out = setMeta(out, 'description', desc);
  out = setMeta(out, 'og:type', 'profile');
  out = setMeta(out, 'og:url', url);
  out = setMeta(out, 'og:title', title);
  out = setMeta(out, 'og:description', desc);
  out = setMeta(out, 'twitter:title', title);
  out = setMeta(out, 'twitter:description', desc);
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
