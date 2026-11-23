import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BiStats, BiTrophy, BiCrown, BiPulse, BiUserPlus } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { PageHero, Seo, Spinner } from '../components/ui';
import { BarChart } from '../components/charts';
import ActivityFeed from '../components/ActivityFeed';
import { mcHead } from '../lib/api';
import { formatDuration, formatDate } from '../lib/playtime';
import { fmtNum, km } from '../lib/gameStats';
import '../styles/pages.css';

const FRAME = { task: 'Thành tựu', goal: 'Mục tiêu', challenge: 'Thử thách' };
const head = (n, s) => mcHead(String(n).replace(/^[.*]/, ''), s);
const fmtFull = (d) => new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const Stats = () => {
  const [t, setT] = useState(null);
  const [rare, setRare] = useState(null);
  const [hall, setHall] = useState(null);
  const [joins, setJoins] = useState(false);

  useEffect(() => {
    supabase.rpc('bnc_server_totals').then(({ data }) => setT(data || {}));
    supabase.rpc('bnc_rare_advancements', { p_limit: 20 }).then(({ data }) => setRare(data || []));
    supabase.rpc('bnc_hall_of_fame').then(({ data }) => setHall(data || []));
  }, []);

  const tiles = t ? [
    { k: 'Người chơi đã ghi nhận', v: fmtNum(t.players) },
    { k: 'Tổng giờ chơi', v: formatDuration(t.play_seconds, { coarse: true }) },
    { k: 'Khối đã đào', v: fmtNum(t.blocks_mined) },
    { k: 'Quái đã hạ', v: fmtNum(t.mob_kills) },
    { k: 'Quãng đường', v: `${fmtNum(km(t.distance_cm))} km` },
    { k: 'Thành tựu đã mở', v: fmtNum(t.adv_done) },
    { k: 'Số lần “bay màu”', v: fmtNum(t.deaths) },
    { k: 'Cá đã câu', v: fmtNum(t.fish_caught) },
    { k: 'Chơi hôm nay', v: `${fmtNum(t.active_today)} người`, s: `${fmtNum(t.active_week)} người trong 7 ngày` },
    { k: 'Đông nhất', v: t.peak_online ? `${fmtNum(t.peak_online)} người` : '—', s: t.peak_at ? fmtFull(t.peak_at) : '' },
  ] : [];

  const newBars = (t?.new_players || []).map((d) => ({
    key: d.day,
    label: new Date(d.day).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    value: d.count,
    tip: `${new Date(d.day).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} · ${d.count} người mới`,
  }));

  // Gom đại sảnh danh vọng theo mùa
  const seasons = [];
  (hall || []).forEach((r) => {
    let s = seasons.find((x) => x.id === r.season_id);
    if (!s) { s = { id: r.season_id, name: r.season_name, from: r.starts_on, to: r.ends_on, top: [] }; seasons.push(s); }
    s.top.push(r);
  });

  return (
    <>
      <Seo title="Thống kê máy chủ" description="Số liệu toàn máy chủ Minecraft BuildnChill: tổng giờ chơi, khối đã đào, người chơi mới, thành tựu hiếm và đại sảnh danh vọng các mùa." path="/stats" />
      <PageHero
        pill="Cộng đồng"
        title="Thống kê"
        highlight="máy chủ"
        subtitle="Cả server đã cùng nhau đào bao nhiêu khối, đi bao xa, mở được những thành tựu hiếm nào? Số liệu đồng bộ trực tiếp từ trong game."
        crumbs={[{ label: 'Thống kê' }]}
      />

      <section className="bnc-section pt-5">
        <div className="container">
          {t === null ? <Spinner /> : (
            <div className="bnc-totals">
              {tiles.map((x) => (
                <div key={x.k} className="bnc-card">
                  <span className="k">{x.k}</span>
                  <span className="v">{x.v}</span>
                  {x.s && <span className="s">{x.s}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="row g-4 mt-1">
            <div className="col-lg-7">
              <div className="bnc-card bnc-card-pad h-100">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h2 className="h6 mb-1"><BiPulse className="text-accent me-2" />Đang diễn ra trong game</h2>
                    <div className="small text-dim">Thành tựu, danh hiệu, đổi ngôi top 1, người chơi mới</div>
                  </div>
                  <label className="bnc-check small">
                    <input type="checkbox" checked={joins} onChange={(e) => setJoins(e.target.checked)} /> Hiện lượt vào game
                  </label>
                </div>
                <ActivityFeed limit={20} joins={joins} />
              </div>
            </div>
            <div className="col-lg-5">
              <div className="bnc-card bnc-card-pad h-100">
                <h2 className="h6 mb-1"><BiUserPlus className="text-accent me-2" />Người chơi mới</h2>
                <div className="small text-dim mb-3">
                  {t?.new_players_30d ? <><b className="text-white">{fmtNum(t.new_players_30d)}</b> người lần đầu vào server trong 30 ngày qua</> : 'Số người lần đầu vào server mỗi ngày (30 ngày)'}
                </div>
                {t === null ? <Spinner /> : (
                  <BarChart
                    bars={newBars}
                    label="Số người chơi mới mỗi ngày trong 30 ngày qua"
                    labelEvery={7}
                    highlightKey={newBars[newBars.length - 1]?.key}
                    formatValue={(v, axis) => (axis ? v : `${v} người`)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="row g-4 mt-1">
            <div className="col-lg-7">
              <div className="bnc-card bnc-card-pad h-100">
                <h2 className="h6 mb-1"><BiTrophy className="text-accent me-2" />Thành tựu hiếm nhất</h2>
                <div className="small text-dim mb-3">Ít người mở khoá nhất — bạn có nằm trong số đó?</div>
                {rare === null ? <Spinner /> : rare.length === 0 ? <div className="small text-soft">Chưa có dữ liệu thành tựu.</div> : (
                  <ul className="bnc-rare">
                    {rare.map((a) => (
                      <li key={a.adv_key} className={a.frame}>
                        <span className="ic" aria-hidden="true" />
                        <div className="main">
                          <div className="t">{a.title}<span className="f">{FRAME[a.frame] || 'Thành tựu'}</span></div>
                          <div className="who">
                            {a.names.map((n) => (
                              <Link key={n} to={`/player/${encodeURIComponent(n)}`} title={n}><img src={head(n, 32)} alt={n} width="22" height="22" loading="lazy" /></Link>
                            ))}
                            {a.holders > a.names.length && <span className="more">+{a.holders - a.names.length}</span>}
                          </div>
                        </div>
                        <div className="pct">
                          <b>{a.holders}</b>/{a.total}
                          <span>{a.total ? `${Math.max(0.1, (a.holders / a.total) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="col-lg-5">
              <div className="bnc-card bnc-card-pad h-100">
                <h2 className="h6 mb-1"><BiCrown className="text-accent me-2" />Đại sảnh danh vọng</h2>
                <div className="small text-dim mb-3">Top 3 giờ chơi của các mùa đã kết thúc</div>
                {hall === null ? <Spinner /> : seasons.length === 0 ? (
                  <div className="small text-soft">Chưa có mùa nào kết thúc. Xem bảng xếp hạng mùa hiện tại ở <Link to="/leaderboard">Bảng xếp hạng</Link>.</div>
                ) : (
                  <div className="bnc-hof">
                    {seasons.map((s) => (
                      <div key={s.id} className="season">
                        <div className="name">{s.name}<span>{formatDate(s.from)} – {formatDate(s.to)}</span></div>
                        <ol>
                          {s.top.map((r) => (
                            <li key={r.place} className={`p${r.place}`}>
                              <span className="pl">{r.place}</span>
                              <img src={head(r.mc_username, 32)} alt="" width="24" height="24" loading="lazy" />
                              <Link to={`/player/${encodeURIComponent(r.mc_username)}`}>{r.mc_username}</Link>
                              <span className="sec">{formatDuration(r.seconds, { coarse: true })}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-center mt-4">
            <Link to="/leaderboard" className="bnc-btn bnc-btn-ghost"><BiStats /> Xem bảng xếp hạng người chơi</Link>
          </div>
        </div>
      </section>
    </>
  );
};

export default Stats;
