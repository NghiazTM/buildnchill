import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BiArrowBack, BiCrown, BiLink, BiLogOut, BiCheck, BiX, BiEdit } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { Seo, Spinner, useCopy, useToast } from '../components/ui';
import { mcHead } from '../lib/api';
import { formatDate, formatDuration, timeAgo } from '../lib/playtime';
import { fmtNum } from '../lib/gameStats';
import { ClanTag, CLAN_COLORS, useMyClan } from './Clans';
import '../styles/pages.css';

const ClanDetail = () => {
  const { tag = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const copy = useCopy();
  const { isAuthenticated, userProfile } = useData();
  const admin = userProfile?.role === 'admin';
  const [c, setC] = useState(undefined);
  const [mine, refreshMine] = useMyClan();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ description: '', color: '' });

  const load = () => supabase.rpc('bnc_clan_detail', { p_tag: tag }).then(({ data }) => setC(data || null));
  useEffect(() => { setC(undefined); load(); }, [tag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (c === undefined) return <div className="min-vh-100"><Spinner /></div>;
  if (!c) {
    return (
      <section className="bnc-section">
        <div className="container text-center" style={{ maxWidth: 560 }}>
          <h1 className="h4">Không tìm thấy clan [{tag}]</h1>
          <Link to="/clans" className="bnc-btn bnc-btn-ghost mt-3"><BiArrowBack /> Về danh sách clan</Link>
        </div>
      </section>
    );
  }

  const myRole = mine?.clan?.id === c.id ? mine.clan.role : null;
  const owner = myRole === 'owner';
  const requested = (mine?.pending || []).includes(c.id);
  const totals = c.members.reduce((s, m) => ({
    play: s.play + Number(m.play_seconds), blocks: s.blocks + Number(m.blocks_mined), mobs: s.mobs + Number(m.mob_kills), adv: s.adv + Number(m.adv_done),
  }), { play: 0, blocks: 0, mobs: 0, adv: 0 });

  const rpc = async (fn, args, msg, after) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) { toast(error.message, 'error'); return false; }
    if (msg) toast(msg, 'success');
    refreshMine();
    if (after) after(); else load();
    return true;
  };

  return (
    <>
      <Seo title={`[${c.tag}] ${c.name} — Clan`} description={c.description || `Clan ${c.name} trên máy chủ Minecraft BuildnChill với ${c.members.length} thành viên.`} path={`/clans/${c.tag}`} />
      <section className="bnc-page-hero bnc-clan-hero" style={{ '--c': c.color }}>
        <div className="container">
          <div className="bnc-crumbs mb-3">
            <Link to="/">Trang chủ</Link> / <Link to="/clans">Clan</Link> / <span className="text-soft">{c.name}</span>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-3">
            <div className="bnc-clan-emblem" aria-hidden="true">{c.tag}</div>
            <div className="min-w-0 flex-grow-1">
              <div className="small text-dim mb-1">{c.rank ? `Hạng #${c.rank} clan` : 'Clan'} · lập {formatDate(c.created_at)}</div>
              <h1 className="mb-2 text-break"><ClanTag tag={c.tag} color={c.color} /> {c.name}</h1>
              {editing ? (
                <form className="bnc-clan-edit" onSubmit={async (e) => { e.preventDefault(); if (await rpc('bnc_clan_update', { p_description: form.description, p_color: form.color }, 'Đã lưu')) setEditing(false); }}>
                  <textarea className="bnc-input" rows={2} maxLength={300} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} aria-label="Giới thiệu clan" />
                  <div className="bnc-swatches my-2" role="radiogroup" aria-label="Màu clan">
                    {CLAN_COLORS.map((col) => <button key={col} type="button" role="radio" aria-checked={form.color === col} aria-label={col} className={form.color === col ? 'on' : ''} style={{ background: col }} onClick={() => setForm((s) => ({ ...s, color: col }))} />)}
                  </div>
                  <div className="d-flex gap-2"><button type="submit" className="bnc-btn bnc-btn-sm">Lưu</button><button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => setEditing(false)}>Huỷ</button></div>
                </form>
              ) : (
                c.description && <p className="text-soft mb-0" style={{ maxWidth: 680 }}>{c.description}</p>
              )}
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => copy(window.location.href, 'Đã sao chép link clan')}><BiLink /> Chia sẻ</button>
                {owner && !editing && <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => { setForm({ description: c.description, color: c.color }); setEditing(true); }}><BiEdit /> Sửa</button>}
                {myRole && (
                  <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => window.confirm(owner && c.members.length > 1 ? 'Rời clan? Quyền chủ clan sẽ chuyển cho thành viên lâu nhất.' : owner ? 'Rời clan? Clan sẽ bị giải tán vì không còn ai.' : 'Rời clan?')
                    && rpc('bnc_clan_leave', {}, 'Đã rời clan', () => (owner && c.members.length <= 1 ? navigate('/clans') : load()))}>
                    <BiLogOut /> Rời clan
                  </button>
                )}
                {!myRole && isAuthenticated && mine && !mine.clan && c.members.length < 30 && (
                  <button type="button" className={`bnc-btn bnc-btn-sm ${requested ? 'bnc-btn-ghost' : ''}`}
                    onClick={() => rpc(requested ? 'bnc_clan_cancel' : 'bnc_clan_request', { p_clan: c.id }, requested ? 'Đã huỷ đơn' : 'Đã gửi đơn, chờ chủ clan duyệt nhé')}>
                    {requested ? 'Huỷ đơn xin vào' : 'Xin vào clan'}
                  </button>
                )}
                {!isAuthenticated && <Link to="/login" className="bnc-btn bnc-btn-sm">Đăng nhập để xin vào</Link>}
                {admin && !owner && (
                  <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost text-danger" onClick={() => window.confirm(`Giải tán clan ${c.name}?`) && rpc('bnc_clan_disband', { p_clan: c.id }, 'Đã giải tán clan', () => navigate('/clans'))}>Giải tán (admin)</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bnc-section pt-5">
        <div className="container">
          <div className="bnc-totals four mb-4">
            {[['Thành viên', `${c.members.length}/30`], ['Tổng giờ chơi', formatDuration(totals.play, { coarse: true })], ['Khối đã đào', fmtNum(totals.blocks)], ['Thành tựu', fmtNum(totals.adv)]].map(([k, v]) => (
              <div key={k} className="bnc-card"><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>

          {owner && mine?.requests?.length > 0 && (
            <div className="bnc-card bnc-card-pad mb-4">
              <h2 className="h6 mb-3">Đơn xin vào ({mine.requests.length})</h2>
              <ul className="bnc-req">
                {mine.requests.map((r) => (
                  <li key={r.user_id}>
                    <img src={mcHead(r.mc_username.replace(/^[.*]/, ''), 32)} alt="" width="28" height="28" />
                    <Link to={`/player/${encodeURIComponent(r.mc_username)}`}>{r.mc_username}</Link>
                    <span className="small text-dim">{timeAgo(r.at)}</span>
                    <span className="ms-auto d-flex gap-2">
                      <button type="button" className="bnc-btn bnc-btn-sm" onClick={() => rpc('bnc_clan_respond', { p_user: r.user_id, p_accept: true }, `Đã nhận ${r.mc_username}`)}><BiCheck /> Nhận</button>
                      <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => rpc('bnc_clan_respond', { p_user: r.user_id, p_accept: false }, 'Đã từ chối')}><BiX /> Từ chối</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bnc-card bnc-lb">
            <div className="bnc-lb-head"><h2 className="h6 mb-0">Thành viên</h2></div>
            <ol className="bnc-clan-members">
              {c.members.map((m) => (
                <li key={m.user_id}>
                  <img src={mcHead(m.mc_username.replace(/^[.*]/, ''), 48)} alt="" width="32" height="32" loading="lazy" />
                  <div className="who">
                    <Link to={`/player/${encodeURIComponent(m.mc_username)}`} className="n">{m.mc_username}</Link>
                    {m.role === 'owner' && <span className="bnc-badge gold"><BiCrown /> Chủ clan</span>}
                    <span className="s">{m.last_seen ? `Online ${timeAgo(m.last_seen)}` : `Vào clan ${formatDate(m.joined_at)}`}</span>
                  </div>
                  <span className="st"><b>{formatDuration(m.play_seconds, { coarse: true })}</b><span>giờ chơi</span></span>
                  <span className="st hide-sm"><b>{fmtNum(m.blocks_mined)}</b><span>khối</span></span>
                  <span className="st hide-sm"><b>{fmtNum(m.adv_done)}</b><span>thành tựu</span></span>
                  {owner && m.role !== 'owner' && (
                    <button type="button" className="kick" onClick={() => window.confirm(`Mời ${m.mc_username} ra khỏi clan?`) && rpc('bnc_clan_kick', { p_user: m.user_id }, 'Đã mời ra khỏi clan')} aria-label={`Mời ${m.mc_username} ra khỏi clan`}><BiX /></button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
};

export default ClanDetail;
