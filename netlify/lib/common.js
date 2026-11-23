// Shared helpers for BuildnChill Netlify Functions (server side only).
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const env = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
};

let adminClient = null;
export const getAdmin = () => {
  if (adminClient) return adminClient;
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE trong biến môi trường Netlify');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
};

const baseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export const json = (statusCode, body) => ({ statusCode, headers: baseHeaders, body: JSON.stringify(body) });
export const ok = (body = {}) => json(200, { ok: true, ...body });
export const fail = (statusCode, error, extra = {}) => json(statusCode, { ok: false, error, ...extra });

export const parseBody = (event) => {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

export const header = (event, name) => {
  const h = event.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : '';
};

export const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

// Xác thực người dùng từ header Authorization: Bearer <supabase access token>
export const getUser = async (event) => {
  const auth = header(event, 'authorization');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const sb = getAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await sb.from('profiles').select('id, username, role').eq('id', data.user.id).maybeSingle();
  return { ...data.user, profile };
};

export const requireAdmin = async (event) => {
  const user = await getUser(event);
  if (!user || user.profile?.role !== 'admin') return null;
  return user;
};

// Tên nhân vật Minecraft (Java 3-16 ký tự; cho phép tiền tố "." / "*" của Bedrock/Floodgate)
export const isValidMcName = (name) => /^[.*]?[A-Za-z0-9_]{3,16}$/.test(String(name || ''));

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makePaymentCode = () => {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `BNC${s}`;
};

export const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export const bankInfo = () => {
  const bin = env('BANK_CODE', 'VITE_BANK_CODE') || 'MB';
  const account = env('BANK_ACCOUNT', 'VITE_BANK_ACCOUNT');
  const accountName = env('BANK_ACCOUNT_NAME', 'VITE_BANK_ACCOUNT_NAME');
  const bankName = env('BANK_NAME', 'VITE_BANK_NAME') || 'MB Bank';
  return { bin, account, accountName, bankName };
};

export const qrUrl = (amount, content, acc = null) => {
  const { bin, account, accountName } = acc || bankInfo();
  const params = new URLSearchParams({ amount: String(Math.round(amount)), addInfo: content, accountName: accountName || '' });
  return `https://img.vietqr.io/image/${encodeURIComponent(bin)}-${encodeURIComponent(account)}-compact2.png?${params.toString()}`;
};

/**
 * Danh sách tài khoản nhận tiền đang bật (bảng payment_accounts, admin quản lý).
 * Nếu bảng chưa có / trống -> dùng tài khoản trong biến môi trường (BANK_* / VITE_BANK_*).
 */
export const getBankAccounts = async (sb) => {
  try {
    const { data, error } = await sb
      .from('payment_accounts')
      .select('id, bank_code, bank_name, account_number, account_name, note')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error && data?.length) {
      return data.map((a) => ({
        id: a.id, bin: a.bank_code, bankName: a.bank_name, account: a.account_number, accountName: a.account_name, note: a.note || '',
      }));
    }
  } catch {
    /* bảng chưa tồn tại -> fallback */
  }
  const env1 = bankInfo();
  return env1.account ? [{ id: 'env', ...env1, note: '' }] : [];
};

/** Thông tin chuyển khoản trả về cho trình duyệt (mỗi tài khoản kèm QR riêng). */
export const bankPayload = (acc, amount, content) => ({
  id: acc.id,
  bank_code: acc.bin,
  bank_name: acc.bankName,
  account: acc.account,
  account_name: acc.accountName,
  note: acc.note || '',
  content,
  amount,
  qr_url: qrUrl(amount, content, acc),
});

export const siteUrl = () => env('URL', 'SITE_URL') || 'https://buildnchill.id.vn';

// ---------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------
export const WEBHOOKS = {
  shop: () => env('DISCORD_SHOP_WEBHOOK', 'VITE_DISCORD_SHOP_WEBHOOK'),
  bank: () => env('DISCORD_BANK_WEBHOOK', 'VITE_DISCORD_BANK_WEBHOOK'),
  contact: () => env('DISCORD_CONTACT_WEBHOOK', 'VITE_DISCORD_CONTACT_WEBHOOK'),
  delivery: () => env('DISCORD_DELIVERY_WEBHOOK', 'DISCORD_SHOP_WEBHOOK', 'VITE_DISCORD_SHOP_WEBHOOK'),
  news: () => env('DISCORD_NEWS_WEBHOOK'),
  activity: () => env('DISCORD_ACTIVITY_WEBHOOK'),
};

export const adminMention = () => env('DISCORD_ADMIN_MENTION') || '<@741299302495813662>';

export const COLORS = {
  gold: 0xd4af37,
  green: 0x36e826,
  yellow: 0xf0c000,
  red: 0xe5484d,
  blue: 0x5865f2,
  gray: 0x6b7280,
};

const footer = (label) => ({ text: `BuildnChill • ${label}`, icon_url: `${siteUrl()}/favicon.ico` });

export const embed = ({ title, description, color = COLORS.gold, fields = [], image, thumbnail, label = 'Hệ thống' }) => {
  const e = {
    title: String(title || '').slice(0, 256),
    description: description ? String(description).slice(0, 4000) : undefined,
    color,
    fields: fields
      .filter((f) => f && f.value !== undefined && f.value !== null && f.value !== '')
      .slice(0, 25)
      .map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline })),
    footer: footer(label),
    timestamp: new Date().toISOString(),
  };
  if (image) e.image = { url: image };
  if (thumbnail) e.thumbnail = { url: thumbnail };
  return e;
};

export const avatar = (name) => `https://mc-heads.net/avatar/${encodeURIComponent(name || 'Steve')}/64`;

// Gửi tin nhắn; trả về message id (nếu webhook hợp lệ) để có thể sửa sau
export const discordSend = async (webhookUrl, payload) => {
  if (!webhookUrl) return null;
  try {
    const sep = webhookUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${webhookUrl}${sep}wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_mentions: { parse: ['users', 'roles'] }, ...payload }),
    });
    if (!res.ok) {
      console.error('[discord] send failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.id || null;
  } catch (e) {
    console.error('[discord] send error', e.message);
    return null;
  }
};

export const discordEdit = async (webhookUrl, messageId, payload) => {
  if (!webhookUrl || !messageId) return false;
  try {
    const base = webhookUrl.split('?')[0];
    const res = await fetch(`${base}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    console.error('[discord] edit error', e.message);
    return false;
  }
};

// Embed trạng thái đơn hàng dùng chung (tạo mới / cập nhật màu theo trạng thái)
export const orderEmbed = (o, state) => {
  const states = {
    paid: { title: '🟡 ĐÃ THANH TOÁN • ĐANG CHỜ GIAO', color: COLORS.yellow },
    delivered: { title: '✅ ĐÃ GIAO VẬT PHẨM THÀNH CÔNG', color: COLORS.green },
    failed: { title: '❌ GIAO VẬT PHẨM THẤT BẠI', color: COLORS.red },
    underpaid: { title: '⚠️ CHUYỂN KHOẢN THIẾU', color: COLORS.red },
  };
  const s = states[state] || states.paid;
  const method = o.payment_method === 'wallet' ? 'Số dư ví' : 'Chuyển khoản (SePay)';
  return embed({
    title: s.title,
    color: s.color,
    description: `**${o.mc_username}** • ${o.product}`,
    thumbnail: avatar(o.mc_username),
    label: 'Cửa hàng',
    fields: [
      { name: '👤 Người chơi', value: o.mc_username, inline: true },
      { name: '📦 Vật phẩm', value: o.product, inline: true },
      { name: '💰 Giá', value: vnd(o.price), inline: true },
      { name: '💳 Thanh toán', value: method, inline: true },
      o.payment_code ? { name: '🧾 Mã đơn', value: `\`${o.payment_code}\``, inline: true } : null,
      o.paid !== undefined && o.paid !== o.price ? { name: '💵 Đã nhận', value: vnd(o.paid), inline: true } : null,
      o.error ? { name: '🛑 Lỗi', value: String(o.error).slice(0, 500) } : null,
    ],
  });
};
