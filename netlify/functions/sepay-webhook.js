// POST /.netlify/functions/sepay-webhook   (giữ nguyên URL cũ đã khai báo trên SePay)
// SePay gửi header:  Authorization: Apikey <SEPAY_API_KEY>
// Nội dung chuyển khoản được nhận diện:
//   - BNCxxxxxx      -> thanh toán đơn hàng cửa hàng
//   - NAP <username> -> nạp tiền vào ví
import {
  getAdmin, json, parseBody, header, safeEqual, env, vnd, avatar,
  discordSend, embed, orderEmbed, WEBHOOKS, COLORS, adminMention,
} from '../lib/common.js';

const reply = (body) => json(200, { success: true, ...body });

export const handler = async (event) => {
  if (event.httpMethod === 'GET') return json(200, { success: true, message: 'BuildnChill SePay webhook v2 is live' });
  if (event.httpMethod !== 'POST') return json(405, { success: false });

  // ---- Xác thực SePay ----
  const expected = env('SEPAY_API_KEY', 'SEPAY_WEBHOOK_KEY');
  if (!expected) {
    console.error('[sepay] Thiếu biến môi trường SEPAY_API_KEY - từ chối webhook');
    return json(500, { success: false, message: 'Webhook chưa được cấu hình' });
  }
  const auth = header(event, 'authorization').trim();
  const provided = auth.replace(/^(Apikey|Bearer)\s+/i, '');
  if (!safeEqual(provided, expected)) {
    console.warn('[sepay] Sai API key');
    return json(401, { success: false, message: 'Unauthorized' });
  }

  const p = parseBody(event);
  const txnId = String(p.id ?? p.referenceCode ?? '').trim();
  const amount = Math.round(Number(p.transferAmount ?? p.amount_in ?? 0));
  const content = String(p.content || p.description || '');
  const transferType = String(p.transferType || 'in').toLowerCase();

  if (!txnId) return json(400, { success: false, message: 'Thiếu mã giao dịch' });
  if (transferType !== 'in' || amount <= 0) return reply({ ignored: 'not_incoming' });

  const sb = getAdmin();

  // ---- Chống xử lý trùng ----
  const { data: logRow, error: logErr } = await sb
    .from('payment_transactions')
    .insert({ provider: 'sepay', provider_txn_id: txnId, amount, content: content.slice(0, 500) })
    .select('id')
    .single();
  if (logErr) {
    if (String(logErr.code) === '23505' || String(logErr.message).includes('duplicate')) {
      return reply({ duplicate: true });
    }
    console.error('[sepay] log insert error', logErr);
    return json(500, { success: false });
  }

  const finish = async (match_type, match_ref, result) => {
    await sb.from('payment_transactions').update({ match_type, match_ref, result }).eq('id', logRow.id);
  };

  const normalized = content.toUpperCase().replace(/[^A-Z0-9_ ]/g, ' ');
  const orderCode = (normalized.replace(/\s+/g, '').match(/BNC[A-Z0-9]{6}/) || [])[0];
  const napMatch = content.match(/\bNAP\s*([A-Za-z0-9_]{3,16})/i);

  try {
    // ================= Thanh toán đơn hàng =================
    if (orderCode) {
      const { data: order } = await sb.from('orders').select('id').eq('payment_code', orderCode).maybeSingle();
      if (order) {
        const { data: r, error } = await sb.rpc('bnc_mark_order_paid', {
          p_order_id: order.id, p_amount: amount, p_txn: txnId, p_force: false,
        });
        if (error) throw error;
        await finish('order', order.id, r);

        if (r?.success) {
          const msgId = await discordSend(WEBHOOKS.shop(), {
            content: `🛒 **${r.mc_username}** vừa thanh toán **${r.product}** (${vnd(r.price)}) qua chuyển khoản!`,
            embeds: [orderEmbed({ ...r, payment_method: 'bank' }, 'paid')],
          });
          if (msgId) await sb.from('orders').update({ discord_message_id: msgId }).eq('id', order.id);

          // Chuyển dư -> cộng vào ví nếu người mua có tài khoản
          if (r.overpaid > 0 && r.user_id) {
            await sb.rpc('admin_adjust_balance', {
              p_user_id: r.user_id, p_amount: r.overpaid, p_type: 'refund',
              p_note: `Tiền thừa đơn ${r.payment_code}`,
            });
          }
          return reply({ type: 'order', order_id: order.id });
        }

        if (r?.reason === 'underpaid') {
          await discordSend(WEBHOOKS.bank(), {
            content: `${adminMention()} ⚠️ Đơn **${orderCode}** chuyển thiếu tiền`,
            embeds: [orderEmbed({ ...r, price: r.price, paid: r.paid, payment_method: 'bank' }, 'underpaid')],
          });
          return reply({ type: 'order', underpaid: true });
        }

        // Đơn đã thanh toán/huỷ trước đó nhưng lại nhận thêm tiền -> báo admin xử lý
        await discordSend(WEBHOOKS.bank(), {
          content: `${adminMention()} ⚠️ Nhận tiền cho đơn **${orderCode}** nhưng đơn đang ở trạng thái \`${r?.reason}\``,
          embeds: [embed({
            title: '💸 GIAO DỊCH CẦN KIỂM TRA', color: COLORS.red, label: 'Ngân hàng',
            fields: [
              { name: '💰 Số tiền', value: vnd(amount), inline: true },
              { name: '🆔 Mã GD', value: `\`${txnId}\``, inline: true },
              { name: '📝 Nội dung', value: `\`${content.slice(0, 200)}\`` },
            ],
          })],
        });
        return reply({ type: 'order', note: r?.reason });
      }
    }

    // ================= Nạp ví =================
    if (napMatch) {
      const token = napMatch[1];
      const { data: r, error } = await sb.rpc('bnc_credit_recharge', { p_token: token, p_amount: amount, p_txn: txnId });
      if (error) throw error;
      await finish('recharge', r?.user_id || token, r);

      if (r?.success) {
        const msgId = await discordSend(WEBHOOKS.bank(), {
          content: `⚡ **${r.username}** vừa nạp **${vnd(amount)}** vào ví!`,
          embeds: [embed({
            title: '⚡ NẠP VÍ TỰ ĐỘNG THÀNH CÔNG',
            color: COLORS.green,
            thumbnail: avatar(r.username),
            label: 'Ngân hàng',
            fields: [
              { name: '👤 Tài khoản', value: r.username, inline: true },
              { name: '💰 Số tiền', value: vnd(amount), inline: true },
              { name: '👛 Số dư mới', value: vnd(r.new_balance), inline: true },
              { name: '🆔 Mã GD', value: `\`${txnId}\``, inline: true },
            ],
          })],
        });
        if (msgId) {
          await sb.from('recharges').update({ discord_message_id: msgId }).eq('sepay_transaction_id', txnId);
        }
        return reply({ type: 'recharge' });
      }
    }

    // ================= Không khớp =================
    await finish('none', null, { reason: 'no_match' });
    await discordSend(WEBHOOKS.bank(), {
      content: `${adminMention()} ❓ Có giao dịch chưa nhận diện được`,
      embeds: [embed({
        title: '❓ GIAO DỊCH KHÔNG KHỚP ĐƠN/TÀI KHOẢN',
        color: COLORS.gray,
        label: 'Ngân hàng',
        description: 'Vui lòng kiểm tra và xử lý thủ công trong trang quản trị.',
        fields: [
          { name: '💰 Số tiền', value: vnd(amount), inline: true },
          { name: '🆔 Mã GD', value: `\`${txnId}\``, inline: true },
          { name: '📝 Nội dung', value: `\`${content.slice(0, 200) || '(trống)'}\`` },
        ],
      })],
    });
    return reply({ matched: false });
  } catch (e) {
    console.error('[sepay] processing error', e);
    // Xoá log để SePay gửi lại có thể xử lý lại
    try { await sb.from('payment_transactions').delete().eq('id', logRow.id); } catch { /* ignore */ }
    return json(500, { success: false });
  }
};

