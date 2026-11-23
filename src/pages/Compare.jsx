import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BiLink, BiTransfer } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { PageHero, Seo, Spinner, useCopy } from '../components/ui';
import PlayerSearch from '../components/PlayerSearch';
import { formatDuration, isMcName } from '../lib/playtime';
import { MILESTONES, milestoneProgress, fmtNum, km } from '../lib/gameStats';
import '../styles/pages.css';

const skin = (n) => `https://mc-heads.net/body/${encodeURIComponent(String(n).replace(/^[.*]/, ''))}/200`;

// better: 'high' = càng cao càng tốt, 'low' = càng thấp càng tốt, null = không tính điểm
const ROWS = [
  { k: 'Tổng giờ chơi', get: (p) => p.total_seconds, fmt: (v) => formatDuration(v, { coarse: true }), better: 'high' },
  { k: 'Giờ chơi tuần này', get: (p) => p.week_seconds, fmt: (v) => formatDuration(v), better: 'high' },
  { k: 'Hạng giờ chơi', get: (p) => p.rank_all, fmt: (v) => (v ? `#${v}` : '—'), better: 'low' },
  { k: 'Thành tựu', get: (p) => p.game?.adv_done, fmt: fmtNum, better: 'high', game: true },
  { k: 'Khối đã đào', get: (p) => p.game?.blocks_mined, fmt: fmtNum, better: 'high', game: true },
  { k: 'Quái đã hạ', get: (p) => p.game?.mob_kills, fmt: fmtNum, better: 'high', game: true },
  { k: 'Hạ người chơi (PvP)', get: (p) => p.game?.player_kills, fmt: fmtNum, better: 'high', game: true },
  { k: 'Số lần chết', get: (p) => p.game?.deaths, fmt: fmtNum, better: 'low', game: true },
  { k: 'Quãng đường', get: (p) => (p.game ? km(p.game.distance_cm) : null), fmt: (v) => `${fmtNum(v)} km`, better: 'high', game: true },
  { k: 'Cá đã câu', get: (p) => p.game?.fish_caught, fmt: fmtNum, better: 'high', game: true },
  { k: 'Nhân giống', get: (p) => p.game?.animals_bred, fmt: fmtNum, better: 'high', game: true },
  { k: 'Giao dịch dân làng', get: (p) => p.game?.traded, fmt: fmtNum, better: 'high', game: true },
  { k: 'Danh hiệu đã đạt', get: (p) => (p.game ? MILESTONES.reduce((s, m) => s + (milestoneProgress(m, p.game).level + 1), 0) : null), fmt: (v) => `${v} bậc`, better: 'high', game: true },
];

const useProfile = (name) => {
  const [p, setP] = useState(undefined);
  useEffect(() => {
    let alive = true;
    if (!isMcName(name)) { setP(null); return undefined; }
    setP(undefined);
    supabase.rpc('bnc_player_profile', { p_name: name }).then(({ data }) => { if (alive) setP(data || null); });
    return () => { alive = false; };
  }, [name]);
  return p;
};

const Side = ({ p, name, side }) => (
  <div className={`bnc-vs-side ${side}`}>
    {p === undefined ? <Spinner /> : (
      <>
        <img src={skin(p?.mc_username || 'MHF_Steve')} alt="" height="200" style={p ? undefined : { opacity: 0.35 }} />
        {p ? <Link to={`/player/${encodeURIComponent(p.mc_username)}`} className="nm">{p.mc_username}</Link>
          : <span className="nm text-dim">{name ? `Không có “${name}”` : 'Chọn người chơi'}</span>}
      </>
    )}
  </div>
);

const Compare = () => {
  const params = useParams();
  const a = params.a === '_' ? '' : params.a || '';
  const b = params.b || '';
  const navigate = useNavigate();
  const copy = useCopy();
  const pa = useProfile(a);
  const pb = useProfile(b);

  const go = (x, y) => {
    const e = encodeURIComponent;
    navigate(x && y ? `/compare/${e(x)}/${e(y)}` : x ? `/compare/${e(x)}` : y ? `/compare/_/${e(y)}` : '/compare');
  };
  const ready = pa && pb;
  const hasGame = ready && pa.game && pb.game;

  let scoreA = 0;
  let scoreB = 0;
  const rows = ready ? ROWS.filter((r) => !r.game || hasGame).map((r) => {
    const va = r.get(pa);
    const vb = r.get(pb);
    let win = null;
    if (r.better && va != null && vb != null && va !== vb) {
      const aBetter = r.better === 'high' ? va > vb : va < vb;
      win = aBetter ? 'a' : 'b';
      if (aBetter) scoreA += 1; else scoreB += 1;
    }
    const max = Math.max(Number(va) || 0, Number(vb) || 0) || 1;
    return { ...r, va, vb, win, wa: ((Number(va) || 0) / max) * 100, wb: ((Number(vb) || 0) / max) * 100 };
  }) : [];

  const title = ready ? `${pa.mc_username} vs ${pb.mc_username}` : 'So sánh người chơi';

  return (
    <>
      <Seo
        title={title}
        description={ready ? `So sánh giờ chơi, thành tựu, khối đã đào… giữa ${pa.mc_username} và ${pb.mc_username} trên BuildnChill.` : 'Đặt hai người chơi BuildnChill cạnh nhau: giờ chơi, thành tựu, khối đã đào, PvP, danh hiệu.'}
        path={a && b ? `/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}` : '/compare'}
      />
      <PageHero pill="Cộng đồng" title="So sánh" highlight="người chơi" subtitle="Ai cày hơn ai? Chọn hai người chơi để đặt cạnh nhau." crumbs={[{ label: 'So sánh' }]}>
        <div className="bnc-vs-pick mt-4">
          <PlayerSearch key={`a-${a}`} initial={a} onPick={(n) => go(n, b)} placeholder="Người chơi thứ nhất…" buttonLabel="Chọn" label="Người chơi thứ nhất" />
          <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost swap" onClick={() => go(b, a)} aria-label="Đổi chỗ hai người chơi" disabled={!a && !b}><BiTransfer /></button>
          <PlayerSearch key={`b-${b}`} initial={b} onPick={(n) => go(a, n)} placeholder="Người chơi thứ hai…" buttonLabel="Chọn" label="Người chơi thứ hai" />
        </div>
      </PageHero>

      <section className="bnc-section pt-5">
        <div className="container" style={{ maxWidth: 920 }}>
          <div className="bnc-card bnc-vs">
            <div className="bnc-vs-head">
              <Side p={pa} name={a} side="a" />
              <div className="bnc-vs-score">
                {ready ? (
                  <>
                    <div className="sc"><span className={scoreA >= scoreB ? 'win' : ''}>{scoreA}</span><i>–</i><span className={scoreB >= scoreA ? 'win' : ''}>{scoreB}</span></div>
                    <div className="small text-dim">{scoreA === scoreB ? 'Ngang tài ngang sức!' : `${scoreA > scoreB ? pa.mc_username : pb.mc_username} nhỉnh hơn`}</div>
                  </>
                ) : <div className="sc vs">VS</div>}
              </div>
              <Side p={pb} name={b} side="b" />
            </div>

            {ready ? (
              <ul className="bnc-vs-rows">
                {rows.map((r) => (
                  <li key={r.k}>
                    <div className={`v a ${r.win === 'a' ? 'win' : ''}`}>{r.va == null ? '—' : r.fmt(r.va)}</div>
                    <div className="mid">
                      <span className="bar a"><span style={{ width: `${r.better === 'low' ? 0 : r.wa}%` }} /></span>
                      <span className="lbl">{r.k}</span>
                      <span className="bar b"><span style={{ width: `${r.better === 'low' ? 0 : r.wb}%` }} /></span>
                    </div>
                    <div className={`v b ${r.win === 'b' ? 'win' : ''}`}>{r.vb == null ? '—' : r.fmt(r.vb)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="bnc-empty">{pa === undefined || pb === undefined ? '' : 'Chọn đủ hai người chơi ở ô phía trên để bắt đầu so sánh.'}</div>
            )}
            {ready && !hasGame && <div className="small text-dim px-4 pb-3">Một trong hai người chưa có chỉ số trong game nên chỉ so sánh giờ chơi.</div>}
          </div>

          {ready && (
            <div className="text-center mt-4">
              <button type="button" className="bnc-btn bnc-btn-ghost" onClick={() => copy(window.location.href, 'Đã sao chép link so sánh')}><BiLink /> Chia sẻ kết quả</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Compare;
