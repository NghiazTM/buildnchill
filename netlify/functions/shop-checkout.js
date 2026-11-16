// POST /api/shop-checkout
// body: { product_id, mc_username, method: 'bank' | 'wallet' }
// - bank:   tạo đơn chờ thanh toán với mã BNCxxxxxx + QR VietQR, SePay webhook tự xác nhận
// - wallet: trừ tiền ví (cần đăng nhập) và đưa ngay vào hàng đợi giao vật phẩm
import {
  getAdmin, getUser, ok, fail, parseBody, isValidMcName, makePaymentCode,
  getBankAccounts, bankPayload, discordSend, orderEmbed, WEBHOOKS,
} from '../lib/common.js';

const ORDER_TTL_MIN = 30;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

  try {
    const body = parseBody(event);
    const productId = String(body.product_id || '');
    const mcUsername = String(body.mc_username || '').trim();
    const method = body.method === 'wallet' ? 'wallet' : 'bank';

    if (!/^[0-9a-f-]{36}$/i.test(productId)) return fail(400, 'Sản phẩm không hợp lệ');
    if (!isValidMcName(mcUsername)) return fail(400, 'Tên nhân vật không hợp lệ (3-16 ký tự: chữ, số, dấu _)');

    const sb = getAdmin();
    const user = await getUser(event);

    const { data: product, error: pErr } = await sb
      .from('products')
      .select('id, name, price, command, category_id, active, is_deleted')
      .eq('id', productId)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!product || !product.active || product.is_deleted) return fail(404, 'Sản phẩm không tồn tại hoặc đã ngừng bán');
    const price = Math.round(Number(product.price || 0));
    if (price <= 0) return fail(400, 'Sản phẩm chưa có giá');

    // ---------------- Thanh toán bằng ví ----------------
    if (method === 'wallet') {
      if (!user) return fail(401, 'Vui lòng đăng nhập để thanh toán bằng ví');

      const { data: result, error } = await sb.rpc('bnc_wallet_purchase', {
        p_user_id: user.id,
        p_product_id: product.id,
        p_mc_username: mcUsername,
      });
      if (error) throw error;

      if (!result?.success) {
        const msg = {
          insufficient_balance: `Số dư không đủ. Cần ${price.toLocaleString('vi-VN')}đ, ví còn ${Number(result?.balance || 0).toLocaleString('vi-VN')}đ`,
          wallet_not_found: 'Không tìm thấy ví của bạn',
          product_not_found: 'Sản phẩm không tồn tại',
        }[result?.reason] || 'Không thể thanh toán bằng ví';
        return fail(400, msg, { reason: result?.reason });
      }

      const msgId = await discordSend(WEBHOOKS.shop(), {
        content: `🛒 **${mcUsername}** vừa mua **${product.name}** bằng số dư ví!`,
        embeds: [orderEmbed({ mc_username: mcUsername, product: product.name, price, payment_method: 'wallet' }, 'paid')],
      });
      if (msgId) await sb.from('orders').update({ discord_message_id: msgId }).eq('id', result.order_id);

      return ok({
        method: 'wallet',
        order: { id: result.order_id, status: 'paid', product: product.name, amount: price, mc_username: mcUsername },
        new_balance: result.new_balance,
      });
    }

    // ---------------- Chuyển khoản / QR ----------------
    const accounts = await getBankAccounts(sb);
    if (!accounts.length) return fail(500, 'Cửa hàng chưa cấu hình tài khoản nhận tiền');

    // Tái sử dụng đơn chờ thanh toán còn hạn của cùng người chơi + sản phẩm (tránh tạo trùng khi bấm nhiều lần)
    const nowIso = new Date().toISOString();
    const { data: existing } = await sb
      .from('orders')
      .select('id, payment_code, price, expires_at')
      .eq('product_id', product.id)
      .eq('mc_username', mcUsername)
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let order = existing && Math.round(Number(existing.price)) === price ? existing : null;

    if (!order) {
      const expiresAt = new Date(Date.now() + ORDER_TTL_MIN * 60 * 1000).toISOString();
      for (let i = 0; i < 4 && !order; i++) {
        const code = makePaymentCode();
        const { data, error } = await sb
          .from('orders')
          .insert({
            mc_username: mcUsername,
            user_id: user?.id || null,
            product: product.name,
            product_id: product.id,
            category_id: product.category_id,
            command: product.command,
            price,
            amount_paid: 0,
            status: 'pending',
            delivered: false,
            payment_method: 'bank',
            payment_code: code,
            expires_at: expiresAt,
            is_deleted: false,
          })
          .select('id, payment_code, price, expires_at')
          .single();
        if (!error) order = data;
        else if (!String(error.message).includes('duplicate')) throw error;
      }
      if (!order) throw new Error('Không tạo được mã đơn hàng');
    }

    return ok({
      method: 'bank',
      order: {
        id: order.id,
        code: order.payment_code,
        status: 'pending',
        product: product.name,
        amount: price,
        mc_username: mcUsername,
        expires_at: order.expires_at,
      },
      bank: bankPayload(accounts[0], price, order.payment_code),
      banks: accounts.map((a) => bankPayload(a, price, order.payment_code)),
    });
  } catch (e) {
    console.error('[shop-checkout]', e);
    return fail(500, 'Lỗi hệ thống, vui lòng thử lại sau');
  }
};
