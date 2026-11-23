// Chạy định kỳ (xem netlify.toml): nhắc người đã bật thông báo khi sự kiện sắp bắt đầu (trước ~30 phút).
import { getAdmin, siteUrl } from '../lib/common.js';
import { pushReady, pushToAll } from '../lib/push.js';

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

export const handler = async () => {
  if (!pushReady()) return { statusCode: 200, body: 'push not configured' };
  const sb = getAdmin();
  const now = Date.now();
  const { data: events, error } = await sb
    .from('server_events')
    .select('id,title,starts_at,location')
    .is('reminded_at', null)
    .gte('starts_at', new Date(now - 5 * 60000).toISOString())
    .lte('starts_at', new Date(now + 35 * 60000).toISOString())
    .order('starts_at')
    .limit(5);
  if (error) {
    console.error('[event-reminders]', error.message);
    return { statusCode: 500, body: error.message };
  }

  for (const ev of events || []) {
    // Đánh dấu trước để không nhắc 2 lần nếu lần chạy sau đến sớm
    const { data: claimed } = await sb.from('server_events').update({ reminded_at: new Date().toISOString() })
      .eq('id', ev.id).is('reminded_at', null).select('id');
    if (!claimed?.length) continue;
    const mins = Math.max(0, Math.round((new Date(ev.starts_at).getTime() - now) / 60000));
    const sent = await pushToAll(sb, {
      title: `Sắp diễn ra: ${ev.title}`,
      body: `${mins > 0 ? `Còn ${mins} phút` : 'Bắt đầu ngay bây giờ'} · ${fmtTime(ev.starts_at)}${ev.location ? ` · ${ev.location}` : ''}`,
      url: `${siteUrl()}/events#${ev.id}`,
      tag: `event-${ev.id}`,
    });
    console.log('[event-reminders]', ev.title, 'sent', sent);
  }
  return { statusCode: 200, body: 'ok' };
};
