import { supabase } from '../supabaseClient';

// Gọi Netlify Functions qua /api/<name>. Tự gắn token đăng nhập (nếu có).
export async function api(name, { method = 'GET', body, query } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }

  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  let res;
  try {
    res = await fetch(`/api/${name}${qs}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `Lỗi ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Gửi thông báo Discord qua server (không chặn UI nếu lỗi)
export const notifyDiscord = (type, id) => api('discord-notify', { method: 'POST', body: { type, id } }).catch((e) => {
  console.warn('[discord-notify]', e.message);
});

export const formatVnd = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')}đ`;

export const mcHead = (name, size = 64) => `https://mc-heads.net/avatar/${encodeURIComponent(name || 'Steve')}/${size}`;
export const mcBust = (name) => `https://mc-heads.net/head/${encodeURIComponent(name || 'Steve')}/128`;

export const ORDER_STATUS = {
  pending: 'Chờ thanh toán',
  underpaid: 'Thiếu tiền',
  paid: 'Đang giao',
  delivered: 'Đã giao',
  failed: 'Giao lỗi',
  cancelled: 'Đã huỷ',
  expired: 'Hết hạn',
};

/** Strip HTML tags/entities from rich-text fields (e.g. product descriptions saved by the editor). */
export const plainText = (html) => {
  if (!html) return '';
  const s = String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '');
  const t = typeof document !== 'undefined' ? Object.assign(document.createElement('textarea'), { innerHTML: s }).value : s;
  return t.replace(/\s+/g, ' ').trim();
};
