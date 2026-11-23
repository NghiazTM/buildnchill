// /api/player-card/<tên>.png — ảnh thẻ hồ sơ người chơi 1200x630
import { getAdmin, siteUrl } from '../lib/common.js';
import { renderPlayerCard } from '../lib/playerCard.js';
import { PLAYER_NAME_RE } from '../lib/playerMeta.js';

const fallback = () => ({
  statusCode: 302,
  headers: { Location: `${siteUrl()}/og-image.jpg`, 'Cache-Control': 'public, max-age=300' },
  body: '',
});

export const handler = async (event) => {
  const fromPath = decodeURIComponent((String(event.path || '').match(/player-card\/([^/?#]+?)(?:\.png)?$/) || [])[1] || '');
  const name = String(event.queryStringParameters?.name || fromPath).trim();
  if (!PLAYER_NAME_RE.test(name)) return fallback();

  try {
    const sb = getAdmin();
    const [{ data: profile, error }, { data: settings }, clanRes] = await Promise.all([
      sb.rpc('bnc_player_profile', { p_name: name }),
      sb.from('site_settings').select('server_ip').eq('id', 1).maybeSingle(),
      sb.rpc('bnc_player_clan', { p_name: name }).then((r) => r, () => ({ data: null })),
    ]);
    if (error || !profile) return fallback();

    const png = await renderPlayerCard(profile, {
      serverIp: settings?.server_ip || 'buildnchill.id.vn',
      site: new URL(siteUrl()).host,
      clan: clanRes?.data || null,
    });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('[player-card]', e);
    return fallback();
  }
};
