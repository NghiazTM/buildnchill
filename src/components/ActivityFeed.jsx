import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { mcHead } from '../lib/api';
import { timeAgo } from '../lib/playtime';
import { describeEvent } from '../lib/community';

/** Dòng hoạt động: thành tựu, danh hiệu, top 1, người mới (tuỳ chọn: lượt vào game). Tự làm mới mỗi 60 giây. */
const ActivityFeed = ({ limit = 12, joins = false, compact = false, empty = 'Chưa có hoạt động nào — vào game để xuất hiện ở đây!' }) => {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => supabase.rpc('bnc_activity_feed', { p_limit: limit, p_joins: joins }).then(({ data }) => {
      if (alive) setRows(data || []);
    });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [limit, joins]);

  if (rows === null) return <div className={`bnc-feed ${compact ? 'compact' : ''}`} aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="bnc-feed-skel" />)}</div>;
  if (!rows.length) return <div className="small text-soft py-2">{empty}</div>;

  return (
    <ul className={`bnc-feed ${compact ? 'compact' : ''}`}>
      {rows.map((e) => {
        const m = describeEvent(e);
        const name = String(e.mc_username);
        return (
          <li key={e.id}>
            <Link to={`/player/${encodeURIComponent(name)}`} className="av" aria-hidden="true" tabIndex={-1}>
              <img src={mcHead(name.replace(/^[.*]/, ''), 48)} alt="" width="32" height="32" loading="lazy" />
            </Link>
            <div className="body">
              <div className="line"><Link to={`/player/${encodeURIComponent(name)}`} className="who">{name}</Link> {m.text}</div>
              <div className="meta">
                {m.label && <span className={`tag ${m.tone}`}>{m.label}</span>}
                <time dateTime={e.ts}>{timeAgo(e.ts)}</time>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default ActivityFeed;
