import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BiTime, BiTrendingUp, BiCrown } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner } from '../components/ui';
import { AreaChart, BarChart } from '../components/charts';
import PlayerSearch from '../components/PlayerSearch';
import { mcHead } from '../lib/api';
import { formatDuration, timeAgo } from '../lib/playtime';
import '../styles/pages.css';

const PERIODS = [
  { id: 'day', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'all', label: 'Mọi lúc' },
];
const RANGES = [
  { id: 24, label: '24 giờ' },
  { id: 168, label: '7 ngày' },
  { id: 720, label: '30 ngày' },
];

const fmtClock = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const fmtFull = (d) => new Date(d).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const playerUrl = (n) => `/player/${encodeURIComponent(n)}`;
const head = (n, s) => mcHead(String(n).replace(/^[.*]/, ''), s);

const Leaderboard = () => {
  const { serverStatus } = useData();
  const onlineSet = useMemo(() => new Set((serverStatus?.onlinePlayers || []).map((n) => n.toLowerCase())), [serverStatus?.onlinePlayers]);
  const [period, setPeriod] = useState('week');
  const [rows, setRows] = useState(null);
  const [range, setRange] = useState(24);
  const [history, setHistory] = useState(null);
  const [byHour, setByHour] = useState(null);
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    supabase.rpc('bnc_playtime_top', { p_period: period, p_limit: 50 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotReady(true);
      setRows(data || []);
    });
    return () => { alive = false; };
  }, [period]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('bnc_online_history', { p_hours: range }).then(({ data }) => { if (alive) setHistory(data || []); });
    return () => { alive = false; };
  }, [range]);

  useEffect(() => {
    supabase.rpc('bnc_online_by_hour', { p_days: 14 }).then(({ data }) => setByHour(data || []));
  }, []);

  const points = (history || []).map((h) => ({ x: h.ts, y: h.players }));
  const peak = points.reduce((m, p) => (p.y > (m?.y ?? -1) ? p : m), null);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const r = (byHour || []).find((x) => x.hour === h);
    return { key: h, label: `${h}h`, value: r ? Number(r.avg_players) : 0, tip: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59 · cao nhất ${r?.max_players ?? 0} người` };
  });
  const busiest = hours.reduce((m, b) => (b.value > m.value ? b : m), hours[0]);
  const nowHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })) % 24;

  const top = rows || [];
  const best = top[0]?.seconds || 1;
  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase();

  return (
    <>
      <Seo title="Bảng xếp hạng" description="Bảng xếp hạng thời gian chơi, biểu đồ người chơi online và giờ cao điểm của máy chủ Minecraft BuildnChill." path="/leaderboard" />
      <PageHero
        pill="Cộng đồng"
        title="Bảng xếp hạng"
        highlight="người chơi"
        subtitle="Ai cày nhiều nhất BuildnChill? Thời gian chơi được tính tự động mỗi 10 giây khi bạn ở trong máy chủ."
        crumbs={[{ label: 'Bảng xếp hạng' }]}
      >
        <PlayerSearch className="mt-4" />
      </PageHero>

      <section className="bnc-section pt-5">
        <div className="container">
          {notReady && (
            <div className="bnc-card bnc-card-pad mb-4 small text-soft">Hệ thống đang bắt đầu thu thập dữ liệu thời gian chơi — bảng xếp hạng sẽ có số liệu sau vài phút.</div>
          )}
          <div className="row g-4">
            {/* ---------- Bảng xếp hạng ---------- */}
            <div className="col-lg-7">
              <div className="bnc-card bnc-lb">
                <div className="bnc-lb-head">
                  <div>
                    <h2 className="h5 mb-1"><BiTime className="text-accent me-2" />Thời gian chơi</h2>
                    <div className="small text-dim">Top 50 người chơi {periodLabel}</div>
                  </div>
                  <div className="bnc-lb-tabs" role="tablist">
                    {PERIODS.map((p) => (
                      <button key={p.id} role="tab" aria-selected={period === p.id} className={`bnc-tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
                    ))}
                  </div>
                </div>

                {rows === null ? <Spinner /> : top.length === 0 ? (
                  <div className="bnc-empty">Chưa có ai chơi {periodLabel}. Vào game ngay để chiếm hạng 1!</div>
                ) : (
                  <>
                    <div className="bnc-podium">
                      {[1, 0, 2].map((i) => top[i] && (
                        <Link key={top[i].mc_username} to={playerUrl(top[i].mc_username)} className={`bnc-podium-item r${i + 1}`}>
                          <span className="rank">{i === 0 ? <BiCrown /> : i + 1}</span>
                          <img src={head(top[i].mc_username, 96)} alt="" width="64" height="64" />
                          <span className="name">{top[i].mc_username}</span>
                          <span className="time" title={formatDuration(top[i].seconds)}>{formatDuration(top[i].seconds, { coarse: true })}</span>
                          {onlineSet.has(top[i].mc_username.toLowerCase()) && <span className="live">Đang online</span>}
                        </Link>
                      ))}
                    </div>
                    <ol className="bnc-lb-list" start={4}>
                      {top.slice(3).map((r, i) => (
                        <li key={r.mc_username}>
                          <Link to={playerUrl(r.mc_username)}>
                            <span className="rank">{i + 4}</span>
                            <img src={head(r.mc_username, 32)} alt="" width="28" height="28" loading="lazy" />
                            <span className="who">
                              <span className="name">{r.mc_username}{onlineSet.has(r.mc_username.toLowerCase()) && <span className="dot dot-green ms-2" title="Đang online" />}</span>
                              <span className="bar"><span style={{ width: `${Math.max(3, (r.seconds / best) * 100)}%` }} /></span>
                            </span>
                            <span className="time">{formatDuration(r.seconds)}</span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </div>

            {/* ---------- Thống kê máy chủ ---------- */}
            <div className="col-lg-5 d-flex flex-column gap-4">
              <div className="bnc-card bnc-card-pad">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h2 className="h6 mb-1"><BiTrendingUp className="text-accent me-2" />Người chơi online</h2>
                    <div className="small text-dim">
                      {peak && peak.y > 0 ? <>Đông nhất <b className="text-white">{peak.y} người</b> · {fmtFull(peak.x)}</> : 'Chưa có dữ liệu'}
                    </div>
                  </div>
                  <div className="bnc-seg" role="tablist" aria-label="Khoảng thời gian">
                    {RANGES.map((r) => (
                      <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
                    ))}
                  </div>
                </div>
                {history === null ? <Spinner /> : points.length < 2 ? (
                  <div className="bnc-empty small py-4">Đang thu thập — biểu đồ sẽ hiện sau khoảng 20 phút.</div>
                ) : (
                  <AreaChart
                    points={points}
                    label={`Số người chơi online trong ${RANGES.find((r) => r.id === range).label} qua`}
                    formatX={range <= 24 ? fmtClock : fmtDay}
                    formatTip={fmtFull}
                  />
                )}
              </div>

              <div className="bnc-card bnc-card-pad">
                <h2 className="h6 mb-1">Giờ cao điểm</h2>
                <div className="small text-dim mb-3">
                  {busiest && busiest.value > 0
                    ? <>Đông vui nhất khoảng <b className="text-white">{busiest.key}:00</b> (trung bình {busiest.value} người) · 14 ngày qua</>
                    : 'Trung bình số người online theo giờ trong ngày'}
                </div>
                {byHour === null ? <Spinner /> : (
                  <BarChart
                    bars={hours}
                    label="Trung bình số người online theo từng giờ trong ngày"
                    labelEvery={3}
                    highlightKey={nowHour}
                    formatValue={(v, axis) => (axis ? v : `${v} người`)}
                  />
                )}
                <div className="small text-dim mt-2"><span className="bnc-legend-sq" /> Cột sáng: giờ hiện tại</div>
              </div>

              <div className="bnc-card bnc-card-pad small text-soft">
                Thời gian chơi được cộng tự động mỗi khi bạn ở trong máy chủ — không cần đăng ký.
                {' '}Bấm vào tên bất kỳ để xem hồ sơ chi tiết.
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Leaderboard;
