import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('--- SEPAY WEBHOOK START ---');
  
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: 'SePay Webhook is Live (ESM)' };
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Env Vars');
      return { statusCode: 500, body: 'Config Error' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = JSON.parse(event.body || '{}');
    console.log('Payload Received:', JSON.stringify(payload));

    const {
      content = '',
      transferAmount = 0,
      amount_in = 0,
      id: transactionId,
      referenceCode = ''
    } = payload;

    const amount = parseInt(amount_in || transferAmount || 0);
    console.log(`Input: Content="${content}", Amount=${amount}, ID=${transactionId}`);

    // Gọi RPC xử lý
    const { data, error } = await supabase.rpc('process_sepay_webhook', {
      p_content: content,
      p_amount: amount,
      p_transaction_id: transactionId?.toString() || ('SEPAY_' + Date.now())
    });

    if (error) {
      console.error('Database RPC Error:', error);
      return { statusCode: 200, body: JSON.stringify({ success: false, error: error.message }) };
    }

    console.log('Database Result:', JSON.stringify(data));

    // Gửi thông báo Discord nếu xử lý thành công
    if (data && data.success) {
      try {
        const isRecharge = data.type === 'recharge';
        const WEBHOOK_URL = isRecharge ? process.env.VITE_DISCORD_BANK_WEBHOOK : process.env.VITE_DISCORD_SHOP_WEBHOOK;
        
        const embed = {
          title: isRecharge ? '⚡ THÔNG BÁO NẠP TIỀN TỰ ĐỘNG' : '🛒 THÔNG BÁO MUA HÀNG TỰ ĐỘNG',
          description: isRecharge 
            ? `Người chơi **${data.username || 'Không rõ'}** vừa nạp tiền thành công qua SePay!`
            : `Người chơi **${data.username || 'Không rõ'}** vừa mua **${data.product_name || 'vật phẩm'}** thành công!`,
          color: isRecharge ? 0x0ea5e9 : 0x10b981, // Sky Blue vs Emerald Green
          fields: [
            { name: '👤 Người chơi', value: data.username || 'Không rõ', inline: true },
            { name: '💰 Số tiền', value: `${amount.toLocaleString('vi-VN')} VNĐ`, inline: true },
            { name: '📝 Nội dung', value: `\`${content}\``, inline: false },
            { name: '🆔 Mã giao dịch', value: `\`${transactionId || referenceCode}\``, inline: true }
          ],
          footer: { text: `BuildnChill System • ${new Date().toLocaleString('vi-VN')}` },
          timestamp: new Date().toISOString()
        };

        if (!isRecharge && data.product_name) {
          embed.fields.push({ name: '📦 Sản phẩm', value: data.product_name, inline: true });
        }

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: isRecharge 
              ? `📢 **${data.username}** vừa nạp thành công **${amount.toLocaleString('vi-VN')}đ** vào ví! 🚀`
              : `📢 **${data.username}** vừa mua **${data.product_name}** (**${amount.toLocaleString('vi-VN')}đ**)! 🛒`,
            embeds: [embed]
          })
        });
      } catch (discordError) {
        console.error('Discord Log Error:', discordError);
      }
    }

    console.log(`Duration: ${Date.now() - startTime}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    console.error('Webhook Crash:', err);
    return { statusCode: 200, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
