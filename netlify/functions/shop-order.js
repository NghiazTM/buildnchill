// GET /api/shop-order?id=<order uuid>
// Trạng thái công khai tối thiểu của một đơn (dùng để trang thanh toán tự cập nhật).
import { getAdmin, ok, fail, bankInfo, qrUrl } from '../lib/common.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return fail(405, 'Method not allowed');
  const id = String(event.queryStringParameters?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, 'Mã đơn không hợp lệ');

  try {
    const sb = getAdmin();
    const { data: o, error } = await sb
      .from('orders')
      .select('id, status, delivered, product, price, amount_paid, payment_code, mc_username, expires_at, paid_at, delivered_at, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!o) return fail(404, 'Không tìm thấy đơn hàng');

    let status = o.status;
    if (status === 'pending' && o.expires_at && new Date(o.expires_at) < new Date()) status = 'expired';

    const { data: dl } = await sb
      .from('deliveries')
      .select('status, attempts, delivered_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const price = Math.round(Number(o.price || 0));
    const remaining = Math.max(0, price - Number(o.amount_paid || 0));
    const payable = ['pending', 'underpaid'].includes(status) && o.payment_code && remaining > 0;
    const bank = bankInfo();

    return ok({
      bank: payable ? {
        bank_name: bank.bankName,
        account: bank.account,
        account_name: bank.accountName,
        content: o.payment_code,
        amount: remaining,
        qr_url: qrUrl(remaining, o.payment_code),
      } : null,
      order: {
        id: o.id,
        status,
        delivered: !!o.delivered,
        product: o.product,
        amount: price,
        amount_paid: Number(o.amount_paid || 0),
        code: o.payment_code,
        mc_username: o.mc_username,
        expires_at: o.expires_at,
        paid_at: o.paid_at,
        delivered_at: o.delivered_at,
        created_at: o.created_at,
        delivery_status: dl?.status || null,
      },
    });
  } catch (e) {
    console.error('[shop-order]', e);
    return fail(500, 'Lỗi hệ thống');
  }
};
