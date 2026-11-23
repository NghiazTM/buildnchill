// /api/push — đăng ký / huỷ nhận thông báo sự kiện trên trình duyệt
//   GET                         -> { ok, publicKey }   (publicKey rỗng = chưa cấu hình)
//   POST { subscription }       -> đăng ký
//   POST { unsubscribe: endpoint } -> huỷ
import { getAdmin, ok, fail, parseBody } from '../lib/common.js';
import { vapidPublic } from '../lib/push.js';

const isPushUrl = (u) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && String(u).length <= 1000;
  } catch {
    return false;
  }
};

export const handler = async (event) => {
  if (event.httpMethod === 'GET') return ok({ publicKey: vapidPublic() });
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

  const body = parseBody(event);
  const sb = getAdmin();
  try {
    if (body.unsubscribe) {
      if (!isPushUrl(body.unsubscribe)) return fail(400, 'Endpoint không hợp lệ');
      await sb.from('push_subscriptions').delete().eq('endpoint', body.unsubscribe);
      return ok();
    }
    const s = body.subscription;
    const p256dh = s?.keys?.p256dh;
    const auth = s?.keys?.auth;
    if (!isPushUrl(s?.endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh || '') || !/^[A-Za-z0-9_-]{8,100}$/.test(auth || '')) {
      return fail(400, 'Đăng ký không hợp lệ');
    }
    const { error } = await sb.from('push_subscriptions').upsert({ endpoint: s.endpoint, p256dh, auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    return ok();
  } catch (e) {
    console.error('[push]', e.message);
    return fail(500, /push_subscriptions/.test(e.message || '') ? 'Chưa chạy COMMUNITY_MIGRATION.sql' : 'Lỗi máy chủ');
  }
};
