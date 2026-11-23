import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BiArrowBack, BiLink, BiTime, BiCalendar, BiLogIn, BiTrophy, BiShoppingBag, BiJoystick, BiMedal, BiTransfer, BiImages } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { Seo, Spinner, useCopy } from '../components/ui';
import { BarChart } from '../components/charts';
import PlayerSearch from '../components/PlayerSearch';
import SkinViewer3D from '../components/SkinViewer3D';
import ActivityCalendar from '../components/ActivityCalendar';
import { ClanTag } from './Clans';
import { formatDuration, formatDate, timeAgo, isMcName } from '../lib/playtime';
import { MILESTONES, TIERS, milestoneProgress, fmtNum, km } from '../lib/gameStats';
import '../styles/pages.css';

const skin = (n) => `https://mc-heads.net/body/${encodeURIComponent(String(n).replace(/^[.*]/, ''))}/240`;

const badgesFor = (p) => {
  const b = [];
  if (p.rank_all === 1) b.push({ t: 'Số 1 giờ chơi', cls: 'gold' });
  else if (p.rank_all && p.rank_all <= 10) b.push({ t: `Top ${p.rank_all <= 3 ? 3 : 10} giờ chơi`, cls: 'gold' });
  if (p.rank_week === 1) b.push({ t: 'Quán quân tuần', cls: 'gold' });
  if (p.donate_rank && p.donate_rank <= 10) b.push({ t: 'Nhà tài trợ', cls: 'violet' });
  if (p.total_seconds >= 100 * 3600) b.push({ t: 'Lão làng 100 giờ', cls: '' });
  const ranks = p.stat_ranks || {};
  const g = p.game || {};
  [['blocks_mined', 'Thợ mỏ số 1'], ['mob_kills', 'Thợ săn số 1'], ['player_kills', 'Vua PvP'], ['adv_done', 'Nhà thám hiểm số 1']]
    .forEach(([k, t]) => { if (ranks[k] === 1 && Number(g[k]) > 0) b.push({ t, cls: 'gold' }); });
  if (p.first_seen && Date.now() - new Date(p.first_seen).getTime() < 7 * 86400000) b.push({ t: 'Người mới', cls: 'green' });
  return b;
};

const smallScreen = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 575px)').matches;
const FRAME = { task: 'Thành tựu', goal: 'Mục tiêu', challenge: 'Thử thách' };

const GameStats = ({ g, ranks = {} }) => {
  const kd = g.deaths > 0 ? (g.player_kills / g.deaths) : g.player_kills;
  const items = [
    { k: 'Khối đã đào', v: fmtNum(g.blocks_mined), r: ranks.blocks_mined },
    { k: 'Quái đã hạ', v: fmtNum(g.mob_kills), r: ranks.mob_kills },
    { k: 'Hạ người chơi', v: fmtNum(g.player_kills), r: ranks.player_kills },
    { k: 'Số lần chết', v: fmtNum(g.deaths) },
    { k: 'K/D (PvP)', v: `${fmtNum(g.player_kills)}/${fmtNum(g.deaths)}`, s: `tỉ lệ ${kd.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}` },
    { k: 'Quãng đường', v: `${km(g.distance_cm).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`, r: ranks.distance_cm },
    { k: 'Cá đã câu', v: fmtNum(g.fish_caught) },
    { k: 'Nhân giống', v: fmtNum(g.animals_bred) },
    { k: 'Giao dịch dân làng', v: fmtNum(g.traded) },
    { k: 'Số lần nhảy', v: fmtNum(g.jumps) },
    g.level != null && { k: 'Cấp độ XP', v: fmtNum(g.level) },
  ].filter(Boolean);
  const extra = Object.entries(g.extra || {});
  return (
    <div className="bnc-card bnc-card-pad mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
        <h2 className="h6 mb-0"><BiJoystick className="text-accent me-2" />Chỉ số trong game</h2>
        {g.updated_at && <span className="small text-dim">Đồng bộ từ máy chủ · {timeAgo(g.updated_at)}</span>}
      </div>
      {extra.length > 0 && (
        <div className="bnc-game-extra">
          {extra.map(([key, e]) => (
            <div key={key}><span className="k">{e.label}</span><span className="v">{e.value}</span></div>
          ))}
        </div>
      )}
      <div className="bnc-game-grid">
        {items.map((it) => (
          <div key={it.k}>
            <span className="k">{it.k}</span>
            <span className="v">{it.v}</span>
            {it.r && it.r <= 10 ? <span className="s gold">Hạng #{it.r} server</span> : it.s ? <span className="s">{it.s}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const Milestones = ({ g }) => (
  <div className="bnc-card bnc-card-pad h-100">
    <h2 className="h6 mb-1"><BiMedal className="text-accent me-2" />Danh hiệu</h2>
    <div className="small text-dim mb-3">Đồng → Bạc → Vàng → Kim cương → Netherite</div>
    <ul className="bnc-ms">
      {MILESTONES.map((m) => {
        const pr = milestoneProgress(m, g);
        return (
          <li key={m.id}>
            <div className="top">
              <span className="name">{m.name}</span>
              <span className={`tier t${pr.level}`}>{pr.tier || 'Chưa đạt'}</span>
            </div>
            <div className="bar" role="progressbar" aria-label={`${m.name}: tiến độ lên hạng tiếp theo`} aria-valuenow={Math.round(pr.pct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.max(2, pr.pct)}%` }} />
            </div>
            <div className="sub">
              {fmtNum(pr.value)} {m.what}
              {pr.next != null ? <> · còn {fmtNum(Math.ceil(pr.next - pr.value))} để lên {TIERS[pr.level + 1]}</> : ' · Đã đạt hạng cao nhất'}
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

const Advancements = ({ list = [], done = 0, total = 0 }) => {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 10);
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="bnc-card bnc-card-pad h-100">
      <div className="d-flex justify-content-between align-items-baseline gap-2 mb-2">
        <h2 className="h6 mb-0"><BiTrophy className="text-accent me-2" />Thành tựu Minecraft</h2>
        <span className="small text-soft"><b className="text-white">{fmtNum(done)}</b>{total > 0 && ` / ${fmtNum(total)}`}</span>
      </div>
      {total > 0 && (
        <div className="bnc-adv-bar" role="progressbar" aria-label="Tỉ lệ thành tựu đã mở khoá" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {list.length === 0 ? <div className="small text-soft mt-3">Chưa mở khoá thành tựu nào.</div> : (
        <ul className="bnc-adv">
          {shown.map((a) => (
            <li key={a.key} className={a.frame}>
              <span className="ic" aria-hidden="true" />
              <span className="t">{a.title}<span className="f">{FRAME[a.frame] || 'Thành tựu'}</span></span>
              {a.at && <span className="when">{formatDate(a.at)}</span>}
            </li>
          ))}
        </ul>
      )}
      {list.length > 10 && (
        <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost mt-3" onClick={() => setAll((v) => !v)}>
          {all ? 'Thu gọn' : `Xem tất cả ${list.length} thành tựu`}
        </button>
      )}
    </div>
  );
};

const Player = () => {
  const { name = '' } = useParams();
  const { serverStatus } = useData();
  const copy = useCopy();
  const [p, setP] = useState(undefined);
  const [clan, setClan] = useState(null);
  const [cal, setCal] = useState(null);

  useEffect(() => {
    let alive = true;
    setP(undefined);
    if (!isMcName(name)) { setP(null); return undefined; }
    supabase.rpc('bnc_player_profile', { p_name: name }).then(({ data, error }) => {
      if (alive) setP(error ? null : data || null);
    });
    supabase.rpc('bnc_player_clan', { p_name: name }).then(({ data }) => { if (alive) setClan(data || null); });
    supabase.rpc('bnc_player_calendar', { p_name: name }).then(({ data, error }) => { if (alive) setCal(error ? null : data || []); });
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
    { icon: BiTime, k: 'Tổng thời gian chơi', v: formatDuration(p.total_seconds), sub: p.game ? 'theo thống kê trong game' : '' },
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
        description={`${display} đã chơi ${formatDuration(p.total_seconds)}${p.game ? `, mở khoá ${p.game.adv_done} thành tựu` : ''} trên máy chủ Minecraft BuildnChill.`}
        path={`/player/${encodeURIComponent(display)}`}
      />
      <section className="bnc-page-hero bnc-player-hero">
        <div className="container">
          <div className="bnc-crumbs mb-3">
            <Link to="/">Trang chủ</Link> / <Link to="/leaderboard">Bảng xếp hạng</Link> / <span className="text-soft">{display}</span>
          </div>
          <div className="bnc-player-top">
            <SkinViewer3D name={display} width={smallScreen ? 96 : 150} height={smallScreen ? 180 : 280} alt={`Skin của ${display}`} />
            <div className="min-w-0 flex-grow-1">
              <div className={`bnc-live ${online ? 'on' : 'off'} mb-2`}>{online ? 'Đang online' : p.last_seen ? `Online ${timeAgo(p.last_seen)}` : 'Offline'}</div>
              <h1 className="mb-2 text-break">{display}</h1>
              {clan && <Link to={`/clans/${clan.tag}`} className="bnc-player-clan"><ClanTag tag={clan.tag} color={clan.color} small /> {clan.name}</Link>}
              {badges.length > 0 && (
                <div className="bnc-badges">{badges.map((b) => <span key={b.t} className={`bnc-badge ${b.cls}`}>{b.t}</span>)}</div>
              )}
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => copy(window.location.href, 'Đã sao chép link hồ sơ')}>
                  <BiLink /> Chia sẻ hồ sơ
                </button>
                <Link to={`/compare/${encodeURIComponent(display)}`} className="bnc-btn bnc-btn-sm bnc-btn-ghost"><BiTransfer /> So sánh</Link>
                <Link to={`/builds?by=${encodeURIComponent(display)}`} className="bnc-btn bnc-btn-sm bnc-btn-ghost"><BiImages /> Công trình</Link>
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

          {p.game && <GameStats g={p.game} ranks={p.stat_ranks || {}} />}

          {p.game && (
            <div className="row g-4 mt-1">
              <div className="col-lg-6"><Milestones g={p.game} /></div>
              <div className="col-lg-6"><Advancements list={p.advancements || []} done={p.game.adv_done} total={p.game.adv_total} /></div>
            </div>
          )}

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
          {cal && (
            <div className="bnc-card bnc-card-pad mt-4">
              <h2 className="h6 mb-1"><BiCalendar className="text-accent me-2" />Lịch hoạt động</h2>
              <ActivityCalendar days={cal} name={display} />
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Player;
