// POST /api/admin-orders   (chỉ admin, header Authorization: Bearer <access token>)
// body: { action: 'mark_paid' | 'redeliver' | 'cancel', order_id }
import {
  getAdmin, requireAdmin, ok, fail, parseBody, vnd,
  discordSend, orderEmbed, WEBHOOKS,
} from '../lib/common.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');
  const admin = await requireAdmin(event);
  if (!admin) return fail(403, 'Chỉ quản trị viên mới được thực hiện');

  const { action, order_id: orderId } = parseBody(event);
  if (!/^[0-9a-f-]{36}$/i.test(String(orderId || ''))) return fail(400, 'Mã đơn không hợp lệ');

  const sb = getAdmin();
  try {
    if (action === 'mark_paid') {
      const { data: r, error } = await sb.rpc('bnc_mark_order_paid', {
        p_order_id: orderId, p_amount: 0, p_txn: `MANUAL_${admin.profile?.username || admin.id}`, p_force: true,
      });
      if (error) throw error;
      if (!r?.success) return fail(400, `Không thể xác nhận: ${r?.reason}`);

      const msgId = await discordSend(WEBHOOKS.shop(), {
        content: `🛠️ Admin **${admin.profile?.username}** đã xác nhận thanh toán đơn **${r.product}** cho **${r.mc_username}** (${vnd(r.price)})`,
        embeds: [orderEmbed({ ...r, payment_method: r.payment_method || 'bank' }, 'paid')],
      });
      if (msgId) await sb.from('orders').update({ discord_message_id: msgId }).eq('id', orderId);
      return ok({ result: r });
    }

    if (action === 'redeliver') {
      const { data: r, error } = await sb.rpc('bnc_redeliver_order', { p_order_id: orderId });
      if (error) throw error;
      if (!r?.success) return fail(400, r?.reason === 'not_paid' ? 'Đơn chưa được thanh toán' : 'Không tìm thấy đơn');
      return ok({ result: r });
    }

    if (action === 'cancel') {
      const { data, error } = await sb
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .in('status', ['pending', 'expired', 'underpaid'])
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return fail(400, 'Chỉ huỷ được đơn chưa thanh toán');
      return ok();
    }

    return fail(400, 'Hành động không hợp lệ');
  } catch (e) {
    console.error('[admin-orders]', e);
    return fail(500, 'Lỗi hệ thống');
  }
};
