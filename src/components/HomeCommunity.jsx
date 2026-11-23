import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BiRightArrowAlt, BiCalendarEvent, BiPulse } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import ActivityFeed from './ActivityFeed';
import { Countdown, useNow } from '../lib/community';

const QUICK = [
  { to: '/leaderboard', t: 'Bảng xếp hạng', d: 'Giờ chơi, thành tựu, đào khối' },
  { to: '/builds', t: 'Công trình', d: 'Khoe tác phẩm, thả tim' },
  { to: '/clans', t: 'Clan', d: 'Lập clan, leo hạng cùng bạn bè' },
  { to: '/stats', t: 'Thống kê server', d: 'Thành tựu hiếm, đại sảnh danh vọng' },
];

/** Trang chủ: hoạt động trong game + sự kiện sắp tới + lối tắt cộng đồng */
const HomeCommunity = ({ Eyebrow }) => {
  const now = useNow();
  const [next, setNext] = useState(undefined);

  useEffect(() => {
    supabase.from('server_events').select('id,title,starts_at,location')
      .gte('starts_at', new Date().toISOString()).order('starts_at').limit(1).maybeSingle()
      .then(({ data }) => setNext(data || null));
  }, []);

  return (
    <section className="bnc-section bnc-section-line">
      <div className="container">
        <div className="bnc-section-head">
          <div>
            <Eyebrow>Cộng đồng</Eyebrow>
            <h2 className="bnc-heading mb-0">Đang diễn ra trong game</h2>
          </div>
          <Link to="/stats" className="bnc-btn bnc-btn-ghost">Xem tất cả <BiRightArrowAlt /></Link>
        </div>
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="bnc-card bnc-card-pad h-100">
              <div className="small text-dim mb-3"><BiPulse className="text-accent me-1" /> Thành tựu, danh hiệu và người chơi mới — cập nhật mỗi phút</div>
              <ActivityFeed limit={7} compact />
            </div>
          </div>
          <div className="col-lg-5 d-flex flex-column gap-4">
            {next && new Date(next.starts_at).getTime() > now && (
              <Link to={`/events#${next.id}`} className="bnc-card bnc-card-pad bnc-home-event">
                <div className="small text-dim mb-1"><BiCalendarEvent className="text-accent me-1" /> Sự kiện sắp tới</div>
                <div className="h5 text-white mb-3">{next.title}</div>
                <Countdown to={next.starts_at} now={now} />
              </Link>
            )}
            <div className="bnc-home-quick">
              {QUICK.map((q) => (
                <Link key={q.to} to={q.to} className="bnc-card">
                  <span className="t">{q.t}</span>
                  <span className="d">{q.d}</span>
                  <BiRightArrowAlt className="ar" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeCommunity;
