// Thông báo trình duyệt (Web Push). Cần biến VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY trên Netlify.
import webpush from 'web-push';
import { env, siteUrl } from './common.js';

export const vapidPublic = () => env('VAPID_PUBLIC_KEY');

let configured = false;
export const pushReady = () => {
  const pub = vapidPublic();
  const priv = env('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(env('VAPID_SUBJECT') || siteUrl(), pub, priv);
    configured = true;
  }
  return true;
};

/** Gửi tới mọi trình duyệt đã đăng ký; tự xoá đăng ký đã hết hạn. Trả về số lần gửi thành công. */
export const pushToAll = async (sb, payload) => {
  if (!pushReady()) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').order('created_at').range(from, from + 499);
    if (error) throw error;
    if (!data?.length) break;
    const dead = [];
    const ok = [];
    await Promise.all(data.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
        sent += 1;
        ok.push(s.endpoint);
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
        else console.warn('[push] send', e.statusCode || e.message);
      }
    }));
    if (dead.length) await sb.from('push_subscriptions').delete().in('endpoint', dead);
    if (ok.length) await sb.from('push_subscriptions').update({ last_ok: new Date().toISOString() }).in('endpoint', ok);
    if (data.length < 500) break;
    from += 500 - dead.length;
  }
  return sent;
};
