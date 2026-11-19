import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BiArrowBack, BiLink, BiTime, BiCalendar, BiLogIn, BiTrophy, BiShoppingBag } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { Seo, Spinner, useCopy } from '../components/ui';
import { BarChart } from '../components/charts';
import PlayerSearch from '../components/PlayerSearch';
import { formatDuration, formatDate, timeAgo, isMcName } from '../lib/playtime';
import '../styles/pages.css';

const skin = (n) => `https://mc-heads.net/body/${encodeURIComponent(String(n).replace(/^[.*]/, ''))}/240`;

const badgesFor = (p) => {
  const b = [];
  if (p.rank_all === 1) b.push({ t: 'Số 1 giờ chơi', cls: 'gold' });
  else if (p.rank_all && p.rank_all <= 10) b.push({ t: `Top ${p.rank_all <= 3 ? 3 : 10} giờ chơi`, cls: 'gold' });
  if (p.rank_week === 1) b.push({ t: 'Quán quân tuần', cls: 'gold' });
  if (p.donate_rank && p.donate_rank <= 10) b.push({ t: 'Nhà tài trợ', cls: 'violet' });
  if (p.total_seconds >= 100 * 3600) b.push({ t: 'Lão làng 100 giờ', cls: '' });
  if (p.first_seen && Date.now() - new Date(p.first_seen).getTime() < 7 * 86400000) b.push({ t: 'Người mới', cls: 'green' });
  return b;
};

const Player = () => {
  const { name = '' } = useParams();
  const { serverStatus } = useData();
  const copy = useCopy();
  const [p, setP] = useState(undefined);

  useEffect(() => {
    let alive = true;
    setP(undefined);
    if (!isMcName(name)) { setP(null); return undefined; }
    supabase.rpc('bnc_player_profile', { p_name: name }).then(({ data, error }) => {
      if (alive) setP(error ? null : data || null);
    });
    return () => { alive = false; };
  }, [name]);

  const online = useMemo(
    () => (serverStatus?.onlinePlayers || []).some((n) => n.toLowerCase() === name.toLowerCase()),
    [serverStatus?.onlinePlayers, name]
  );

  if (p === undefined) return <div className="min-vh-100"><Spinner /></div>;

  if (!p) {
    return (
      <section className="bnc-section">
        <Seo title={`Người chơi ${name}`} path={`/player/${encodeURIComponent(name)}`} />
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="bnc-card bnc-card-pad text-center">
            <img src={skin('Steve')} alt="" height="160" className="mb-3" style={{ opacity: 0.5 }} />
            <h1 className="h4">Chưa có dữ liệu về “{name}”</h1>
            <p className="text-soft">Người chơi này chưa từng vào máy chủ kể từ khi hệ thống bắt đầu ghi nhận, hoặc tên chưa đúng.</p>
            <PlayerSearch className="mx-auto mt-3" />
            <Link to="/leaderboard" className="d-inline-block mt-4 small"><BiArrowBack /> Về bảng xếp hạng</Link>
          </div>
        </div>
      </section>
    );
  }

  const display = p.mc_username;
  const badges = badgesFor(p);
  const days = (p.daily || []).map((d) => ({
    key: d.day,
    label: new Date(d.day).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    value: Math.round((d.seconds / 3600) * 10) / 10,
    tip: `${new Date(d.day).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · ${formatDuration(d.seconds)}`,
  }));
  const stats = [
    { icon: BiTime, k: 'Tổng thời gian chơi', v: formatDuration(p.total_seconds) },
    { icon: BiCalendar, k: 'Tuần này', v: formatDuration(p.week_seconds) },
    { icon: BiTime, k: 'Hôm nay', v: formatDuration(p.today_seconds) },
    { icon: BiTrophy, k: 'Hạng giờ chơi', v: p.rank_all ? `#${p.rank_all}` : '—', sub: p.rank_all ? `trên ${p.players_tracked} người chơi` : '' },
    { icon: BiLogIn, k: 'Số lần vào game', v: p.sessions.toLocaleString('vi-VN') },
    { icon: BiCalendar, k: 'Lần đầu ghi nhận', v: formatDate(p.first_seen) },
  ];

  return (
    <>
      <Seo
        title={`${display} — Hồ sơ người chơi`}
        description={`${display} đã chơi ${formatDuration(p.total_seconds)} trên máy chủ Minecraft BuildnChill.`}
        path={`/player/${encodeURIComponent(display)}`}
      />
      <section className="bnc-page-hero bnc-player-hero">
        <div className="container">
          <div className="bnc-crumbs mb-3">
            <Link to="/">Trang chủ</Link> / <Link to="/leaderboard">Bảng xếp hạng</Link> / <span className="text-soft">{display}</span>
          </div>
          <div className="bnc-player-top">
            <img className="skin" src={skin(display)} alt={`Skin của ${display}`} width="120" height="240" />
            <div className="min-w-0 flex-grow-1">
              <div className={`bnc-live ${online ? 'on' : 'off'} mb-2`}>{online ? 'Đang online' : p.last_seen ? `Online ${timeAgo(p.last_seen)}` : 'Offline'}</div>
              <h1 className="mb-2 text-break">{display}</h1>
              {badges.length > 0 && (
                <div className="bnc-badges">{badges.map((b) => <span key={b.t} className={`bnc-badge ${b.cls}`}>{b.t}</span>)}</div>
              )}
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => copy(window.location.href, 'Đã sao chép link hồ sơ')}>
                  <BiLink /> Chia sẻ hồ sơ
                </button>
                <Link to="/leaderboard" className="bnc-btn bnc-btn-sm bnc-btn-ghost"><BiTrophy /> Bảng xếp hạng</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bnc-section pt-5">
        <div className="container">
          <div className="bnc-player-stats">
            {stats.map((s) => (
              <div key={s.k} className="bnc-card">
                <span className="k"><s.icon /> {s.k}</span>
                <span className="v">{s.v}</span>
                {s.sub && <span className="s">{s.sub}</span>}
              </div>
            ))}
          </div>

          <div className="row g-4 mt-1">
            <div className="col-lg-8">
              <div className="bnc-card bnc-card-pad h-100">
                <h2 className="h6 mb-1">Hoạt động 14 ngày qua</h2>
                <div className="small text-dim mb-3">Số giờ chơi mỗi ngày (giờ Việt Nam)</div>
                <BarChart
                  bars={days}
                  label={`Số giờ chơi mỗi ngày của ${display} trong 14 ngày qua`}
                  labelEvery={days.length > 7 ? 2 : 1}
                  highlightKey={days[days.length - 1]?.key}
                  formatValue={(v, axis) => (axis ? `${v}h` : `${v} giờ`)}
                />
              </div>
            </div>
            <div className="col-lg-4">
              <div className="bnc-card bnc-card-pad h-100">
                <h2 className="h6 mb-3"><BiShoppingBag className="text-accent me-2" />Vật phẩm đã sở hữu</h2>
                {p.recent_purchases?.length ? (
                  <ul className="bnc-player-buys">
                    {p.recent_purchases.map((r, i) => (
                      <li key={`${r.product}-${i}`}><span>{r.product}</span><span className="when">{timeAgo(r.at)}</span></li>
                    ))}
                  </ul>
                ) : (
                  <div className="small text-soft">Chưa mua vật phẩm nào. <Link to="/shop">Ghé cửa hàng</Link></div>
                )}
                {p.purchases > 5 && <div className="small text-dim mt-2">và {p.purchases - 5} vật phẩm khác</div>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Player;
