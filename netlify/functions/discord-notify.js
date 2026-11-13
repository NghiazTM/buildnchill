// POST /api/discord-notify
// Gửi thông báo Discord từ phía server (không lộ webhook URL ra trình duyệt).
// body: { type, id }
//   contact_new     — công khai; chỉ gửi cho liên hệ vừa tạo (< 15 phút) và chưa gửi lần nào
//   contact_status  — admin; cập nhật lại tin nhắn Discord theo trạng thái xử lý
//   news_published  — admin; thông báo bài viết mới (cần DISCORD_NEWS_WEBHOOK)
import {
  getAdmin, requireAdmin, ok, fail, parseBody, siteUrl, avatar, env,
  discordSend, discordEdit, embed, WEBHOOKS, COLORS, adminMention,
} from '../lib/common.js';

const CATEGORY = {
  report: 'Báo cáo (Report)',
  bug: 'Báo lỗi (Bug)',
  help: 'Trợ giúp (Help)',
  suggestion: 'Đề xuất (Suggestion)',
  payment: 'Thanh toán / Nạp tiền',
};
const STATUS = {
  pending: { label: 'Đã nhận', emoji: '🔴', color: COLORS.red },
  processing: { label: 'Đang kiểm tra', emoji: '🟡', color: COLORS.yellow },
  resolved: { label: 'Đã giải quyết', emoji: '🟢', color: COLORS.green },
};

const contactPayload = (c) => {
  const st = STATUS[c.status] || STATUS.pending;
  const cat = CATEGORY[c.category] || 'Khác';
  const e = embed({
    title: `${st.emoji} ${st.label} | LIÊN HỆ: ${cat}`,
    description: c.subject ? `**${c.subject}**` : '🔔 Yêu cầu hỗ trợ từ Website',
    color: st.color,
    thumbnail: avatar(c.ign),
    label: 'Hỗ trợ',
    fields: [
      { name: '👤 Người chơi', value: c.ign || 'Không rõ', inline: true },
      { name: '📂 Danh mục', value: cat, inline: true },
      c.email ? { name: '📧 Email', value: c.email, inline: true } : null,
      c.phone ? { name: '📞 SĐT', value: c.phone, inline: true } : null,
      { name: '💬 Nội dung', value: c.message || '(trống)' },
    ],
    image: c.image_url || undefined,
  });
  return {
    content: `🔔 ${adminMention()} **${c.status === 'pending' ? 'CÓ LIÊN HỆ MỚI!' : `CẬP NHẬT LIÊN HỆ [${st.label.toUpperCase()}]`}**`,
    embeds: [e],
  };
};

const stripHtml = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');
  const { type, id } = parseBody(event);
  if (!id || String(id).length > 64) return fail(400, 'Thiếu id');
  const sb = getAdmin();

  try {
    if (type === 'contact_new') {
      const { data: c } = await sb.from('contacts').select('*').eq('id', id).maybeSingle();
      if (!c) return fail(404, 'Không tìm thấy');
      if (c.discord_message_id) return ok({ skipped: 'already_sent' });
      if (Date.now() - new Date(c.created_at).getTime() > 15 * 60 * 1000) return ok({ skipped: 'too_old' });

      const msgId = await discordSend(WEBHOOKS.contact(), contactPayload(c));
      if (msgId) await sb.from('contacts').update({ discord_message_id: msgId }).eq('id', c.id);
      return ok({ sent: !!msgId });
    }

    if (type === 'contact_status') {
      if (!(await requireAdmin(event))) return fail(403, 'Forbidden');
      const { data: c } = await sb.from('contacts').select('*').eq('id', id).maybeSingle();
      if (!c) return fail(404, 'Không tìm thấy');
      if (c.discord_message_id) {
        await discordEdit(WEBHOOKS.contact(), c.discord_message_id, contactPayload(c));
      } else {
        const msgId = await discordSend(WEBHOOKS.contact(), contactPayload(c));
        if (msgId) await sb.from('contacts').update({ discord_message_id: msgId }).eq('id', c.id);
      }
      return ok();
    }

    if (type === 'news_published') {
      if (!(await requireAdmin(event))) return fail(403, 'Forbidden');
      if (!WEBHOOKS.news()) return ok({ skipped: 'no_webhook' });
      const { data: n } = await sb.from('news').select('*').eq('id', id).maybeSingle();
      if (!n) return fail(404, 'Không tìm thấy');
      const url = `${siteUrl()}/news/${n.slug || n.id}`;
      await discordSend(WEBHOOKS.news(), {
        content: `📰 **BẢN TIN MỚI TỪ BUILDNCHILL!** ${env('DISCORD_NEWS_MENTION')}`.trim(),
        allowed_mentions: { parse: ['everyone', 'roles', 'users'] },
        embeds: [{
          ...embed({
            title: n.title,
            description: `${(n.description || stripHtml(n.content)).slice(0, 300)}\n\n👉 [Đọc tiếp trên website](${url})`,
            color: COLORS.gold,
            image: n.image || undefined,
            label: 'Tin tức',
          }),
          url,
        }],
      });
      return ok();
    }

    return fail(400, 'type không hợp lệ');
  } catch (e) {
    console.error('[discord-notify]', e);
    return fail(500, 'Lỗi hệ thống');
  }
};
