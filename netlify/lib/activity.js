// Báo các khoảnh khắc đáng chú ý trong game lên Discord (kênh hoạt động).
// Chỉ chạy khi có biến DISCORD_ACTIVITY_WEBHOOK.
import { WEBHOOKS, COLORS, embed, avatar, discordSend, siteUrl } from './common.js';

const STAT_LABEL = { play_seconds: 'Giờ chơi', blocks_mined: 'Đào khối', mob_kills: 'Hạ quái', adv_done: 'Thành tựu' };

const describe = (e) => {
  const who = `**${e.mc_username}**`;
  const d = e.data || {};
  switch (e.kind) {
    case 'first_join':
      return { title: '👋 Người chơi mới', text: `${who} lần đầu vào BuildnChill — chào mừng nhé!`, color: COLORS.green };
    case 'milestone':
      return { title: '🏅 Danh hiệu mới', text: `${who} đạt danh hiệu **${d.name} ${d.tier}**`, color: Number(d.level) >= 4 ? 0xa78bfa : 0x5eead4 };
    case 'top1':
      return { title: '👑 Đổi ngôi top 1', text: `${who} vừa vượt **${d.beaten}**, lên top 1 **${d.label || STAT_LABEL[d.stat] || d.stat}**`, color: COLORS.gold };
    case 'advancement':
      return { title: '🏆 Hoàn thành thử thách', text: `${who} hoàn thành thử thách **${d.title}**`, color: 0xa78bfa };
    default:
      return null;
  }
};

export const flushActivityToDiscord = async (sb) => {
  const hook = WEBHOOKS.activity();
  if (!hook) return 0;
  const { data, error } = await sb.rpc('bnc_take_discord_events', { p_limit: 10 });
  if (error || !data?.length) return 0;
  const site = siteUrl();
  const embeds = data.map((e) => {
    const m = describe(e);
    if (!m) return null;
    const x = embed({ title: m.title, description: m.text, color: m.color, thumbnail: avatar(String(e.mc_username).replace(/^[.*]/, '')), label: 'Hoạt động' });
    x.url = `${site}/player/${encodeURIComponent(e.mc_username)}`;
    return x;
  }).filter(Boolean);
  if (embeds.length) await discordSend(hook, { embeds: embeds.slice(0, 10) });
  return embeds.length;
};
