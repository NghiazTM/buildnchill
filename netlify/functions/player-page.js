// /player/<tên> — trả về trang web bình thường nhưng kèm thẻ meta riêng của người chơi
// (để chia sẻ link lên Facebook / Zalo / Discord hiện đúng ảnh + thông tin).
import { getAdmin, siteUrl } from '../lib/common.js';
import { injectPlayerMeta, PLAYER_NAME_RE } from '../lib/playerMeta.js';

let cache = { html: null, at: 0 };
const getIndexHtml = async () => {
  if (cache.html && Date.now() - cache.at < 5 * 60 * 1000) return cache.html;
  const base = process.env.DEPLOY_URL || process.env.URL || siteUrl();
  const res = await fetch(`${base}/`, { headers: { 'User-Agent': 'BuildnChill-PlayerPage/1.0' } });
  if (!res.ok) throw new Error(`index ${res.status}`);
  cache = { html: await res.text(), at: Date.now() };
  return cache.html;
};

const vnDate = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

export const handler = async (event) => {
  const fromPath = decodeURIComponent((String(event.path || '').match(/\/player\/([^/?#]+)/) || [])[1] || '');
  const name = String(event.queryStringParameters?.name || fromPath).trim();

  let html;
  try {
    html = await getIndexHtml();
  } catch (e) {
    console.error('[player-page] index', e);
    return { statusCode: 302, headers: { Location: '/leaderboard' }, body: '' };
  }

  let profile = null;
  let clan = null;
  if (PLAYER_NAME_RE.test(name)) {
    try {
      const sb = getAdmin();
      const [p, c] = await Promise.all([
        sb.rpc('bnc_player_profile', { p_name: name }),
        sb.rpc('bnc_player_clan', { p_name: name }).then((r) => r, () => ({ data: null })),
      ]);
      profile = p.data || null;
      clan = c?.data || null;
    } catch (e) {
      console.warn('[player-page] profile', e.message);
    }
  }

  const body = PLAYER_NAME_RE.test(name)
    ? injectPlayerMeta(html, { name, profile, clan, site: siteUrl(), version: vnDate() })
    : html;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
    body,
  };
};
