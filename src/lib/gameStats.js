// Chỉ số lấy thẳng từ trong game (plugin 2.3+): định dạng, mục xếp hạng, danh hiệu.
import { formatDuration } from './playtime.js';

const n = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');
const compact = (v) => {
  const x = Number(v) || 0;
  if (x >= 1e6) return `${(x / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (x >= 1e4) return `${(x / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} N`;
  return n(x);
};
export const km = (cm) => (Number(cm) || 0) / 100000;
const fmtKm = (cm, short) => {
  const k = km(cm);
  return `${k.toLocaleString('vi-VN', { maximumFractionDigits: k >= 100 || short ? 0 : 1 })} km`;
};

/** Các mục xếp hạng theo chỉ số trong game */
export const STAT_CATEGORIES = [
  { id: 'adv_done', label: 'Thành tựu', title: 'Thành tựu Minecraft', unit: 'thành tựu', desc: 'Số thành tựu (advancement) đã mở khoá' },
  { id: 'blocks_mined', label: 'Đào khối', title: 'Thợ mỏ chăm chỉ', unit: 'khối', desc: 'Tổng số khối đã đào/phá' },
  { id: 'mob_kills', label: 'Hạ quái', title: 'Thợ săn quái vật', unit: 'con', desc: 'Số sinh vật đã hạ gục' },
  { id: 'player_kills', label: 'PvP', title: 'Chiến binh PvP', unit: 'mạng', desc: 'Số lần hạ gục người chơi khác' },
  { id: 'distance_cm', label: 'Quãng đường', title: 'Lữ khách', desc: 'Tổng quãng đường đã đi (bộ, bơi, bay, cưỡi…)', fmt: (v, short) => fmtKm(v, short) },
  { id: 'fish_caught', label: 'Câu cá', title: 'Ngư dân', unit: 'con cá', desc: 'Số cá đã câu được' },
  { id: 'deaths', label: 'Số lần chết', title: 'Hay “bay màu” nhất', unit: 'lần', desc: 'Ai chết nhiều nhất server?' },
];

export const formatStat = (cat, v, { short = false } = {}) => {
  if (cat.fmt) return cat.fmt(v, short);
  if (short) return compact(v);
  return cat.unit ? `${n(v)} ${cat.unit}` : n(v);
};

/** Danh hiệu theo mốc: Đồng → Bạc → Vàng → Kim cương → Netherite */
export const TIERS = ['Đồng', 'Bạc', 'Vàng', 'Kim cương', 'Netherite'];
export const MILESTONES = [
  { id: 'play', name: 'Cày cuốc', what: 'giờ chơi', get: (g) => (Number(g.play_seconds) || 0) / 3600, steps: [10, 50, 100, 250, 500] },
  { id: 'mine', name: 'Thợ mỏ', what: 'khối đã đào', get: (g) => g.blocks_mined, steps: [1000, 10000, 50000, 100000, 500000] },
  { id: 'hunt', name: 'Thợ săn', what: 'quái đã hạ', get: (g) => g.mob_kills, steps: [100, 1000, 5000, 10000, 50000] },
  { id: 'pvp', name: 'Chiến binh', what: 'lần hạ người chơi', get: (g) => g.player_kills, steps: [10, 50, 100, 500, 1000] },
  { id: 'walk', name: 'Lữ khách', what: 'km đã đi', get: (g) => km(g.distance_cm), steps: [10, 100, 500, 1000, 5000] },
  { id: 'fish', name: 'Ngư dân', what: 'cá đã câu', get: (g) => g.fish_caught, steps: [10, 100, 500, 1000, 5000] },
  { id: 'farm', name: 'Nông dân', what: 'lần nhân giống', get: (g) => g.animals_bred, steps: [10, 100, 500, 1000, 5000] },
  { id: 'trade', name: 'Thương nhân', what: 'lần giao dịch dân làng', get: (g) => g.traded, steps: [10, 100, 500, 1000, 5000] },
  { id: 'explore', name: 'Nhà thám hiểm', what: 'thành tựu', get: (g) => g.adv_done, steps: [10, 25, 50, 80, 110] },
];

/** { level: -1..4, tier, value, next, pct } */
export const milestoneProgress = (m, g) => {
  const value = Math.max(0, Number(m.get(g)) || 0);
  let level = -1;
  m.steps.forEach((s, i) => { if (value >= s) level = i; });
  const next = m.steps[level + 1] ?? null;
  const prev = level >= 0 ? m.steps[level] : 0;
  const pct = next == null ? 100 : Math.min(100, Math.max(0, ((value - prev) / (next - prev)) * 100));
  return { level, tier: level >= 0 ? TIERS[level] : null, value, next, pct };
};

export const fmtNum = n;
export const fmtCompact = compact;
export const playText = (sec) => formatDuration(sec);
