// /api/plugin-bridge  — cầu nối giữa plugin Minecraft (BuildnChillShop v2) và hàng đợi giao vật phẩm
// Header bắt buộc: X-Plugin-Secret: <PLUGIN_SECRET>
//   GET  ?ping=1                 -> { ok: true }
//   GET  ?online=Steve,Alex      -> { ok: true, deliveries: [...] }   (đánh dấu processing)
//   POST { results: [{ id, success, message }] }                       (báo kết quả giao)
//   POST { stats: [...], backfill }                                     (thống kê game, plugin 2.3+)
import {
  getAdmin, ok, fail, parseBody, header, safeEqual, env, vnd,
  discordSend, discordEdit, orderEmbed, WEBHOOKS, adminMention,
} from '../lib/common.js';

export const handler = async (event) => {
  const secret = env('PLUGIN_SECRET');
  if (!secret) return fail(500, 'PLUGIN_SECRET chưa được cấu hình trên Netlify');
  if (!safeEqual(header(event, 'x-plugin-secret'), secret)) return fail(401, 'Unauthorized');

  const sb = getAdmin();

  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (q.ping) return ok({ server_time: new Date().toISOString() });

      const names = String(q.online || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[.*]?[A-Za-z0-9_]{1,16}$/.test(s))
        .slice(0, 500);

      // Nhịp tim: mỗi lần plugin gọi = máy chủ đang chạy -> cập nhật trạng thái Online trên web
      const toInt = (v) => (/^\d{1,6}$/.test(String(v ?? '')) ? Number(v) : null);
      // Người đang vanish (plugin 2.2+ gửi ?hidden=) không hiện trên web, nhưng vẫn được giao hàng
      const hidden = new Set(String(q.hidden || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
      const visible = names.filter((n) => !hidden.has(n.toLowerCase()));
      const total = toInt(q.count) ?? names.length;
      const hb = {
        p_players: Math.max(0, total - (names.length - visible.length)),
        p_max: toInt(q.max),
        p_version: q.version ? String(q.version).slice(0, 32) : null,
      };
      let { error: hbErr } = await sb.rpc('bnc_server_heartbeat', { ...hb, p_names: visible });
      if (hbErr && /p_names|function|schema cache/i.test(hbErr.message || '')) {
        // Chưa chạy ONLINE_PLAYERS_MIGRATION.sql -> dùng bản cũ (không có danh sách tên)
        ({ error: hbErr } = await sb.rpc('bnc_server_heartbeat', hb));
      }
      if (hbErr) console.warn('[plugin-bridge] heartbeat', hbErr.message);

      if (names.length === 0) return ok({ deliveries: [] });

      const { data, error } = await sb.rpc('bnc_claim_deliveries', { p_names: names, p_limit: 25 });
      if (error) throw error;

      return ok({
        deliveries: (data || []).map((d) => ({
          id: d.id,
          order_id: d.order_id,
          mc_username: d.mc_username,
          product_name: d.product_name || 'Vật phẩm',
          commands: Array.isArray(d.commands) ? d.commands : [],
        })),
      });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);

      // Plugin 2.3+: thống kê & thành tựu lấy thẳng từ game
      if (Array.isArray(body.stats)) {
        const rows = body.stats.filter((r) => r && typeof r === 'object').slice(0, 200);
        const { data, error } = await sb.rpc('bnc_ingest_stats', { p_rows: rows, p_backfill: !!body.backfill });
        if (error) {
          console.error('[plugin-bridge] stats', error.message);
          return fail(500, /bnc_ingest_stats|schema cache/i.test(error.message || '')
            ? 'Chưa chạy GAME_STATS_MIGRATION.sql trên Supabase' : 'Lỗi lưu thống kê');
        }
        return ok({ saved: data ?? 0 });
      }

      const { results } = body;
      if (!Array.isArray(results)) return fail(400, 'results phải là mảng');

      for (const r of results.slice(0, 100)) {
        if (!r?.id || !/^[0-9a-f-]{36}$/i.test(String(r.id))) continue;
        const { data: out, error } = await sb.rpc('bnc_complete_delivery', {
          p_id: r.id,
          p_success: !!r.success,
          p_message: r.message ? String(r.message).slice(0, 500) : null,
        });
        if (error) {
          console.error('[plugin-bridge] complete error', error);
          continue;
        }

        if (out?.event === 'delivered' && out.order_done) {
          const info = {
            mc_username: out.mc_username,
            product: out.product,
            price: Math.round(Number(out.price || 0)),
            payment_method: out.payment_method,
            payment_code: out.payment_code,
          };
          const edited = await discordEdit(WEBHOOKS.shop(), out.discord_message_id, {
            content: `✅ Đã giao **${out.product}** cho **${out.mc_username}**`,
            embeds: [orderEmbed(info, 'delivered')],
          });
          // Kênh giao hàng riêng (nếu có) hoặc khi không sửa được tin cũ
          if (!edited || (env('DISCORD_DELIVERY_WEBHOOK') && WEBHOOKS.delivery() !== WEBHOOKS.shop())) {
            await discordSend(WEBHOOKS.delivery(), {
              content: `📦 Đã giao **${out.product}** cho **${out.mc_username}** (${vnd(info.price)})`,
              embeds: [orderEmbed(info, 'delivered')],
            });
          }
        } else if (out?.event === 'failed') {
          await discordSend(WEBHOOKS.delivery(), {
            content: `${adminMention()} ❌ Giao **${out.product}** cho **${out.mc_username}** thất bại sau 3 lần thử`,
            embeds: [orderEmbed({ mc_username: out.mc_username, product: out.product, price: 0, error: out.error }, 'failed')],
          });
        }
      }
      return ok();
    }

    return fail(405, 'Method not allowed');
  } catch (e) {
    console.error('[plugin-bridge]', e);
    return fail(500, 'Lỗi hệ thống');
  }
};
