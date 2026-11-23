import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BiPlus, BiX, BiGroup, BiCrown } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner, useToast } from '../components/ui';
import { formatDuration } from '../lib/playtime';
import { fmtNum } from '../lib/gameStats';
import '../styles/pages.css';

export const CLAN_COLORS = ['#d4af37', '#ef4444', '#f97316', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#e5e7eb'];

export const ClanTag = ({ tag, color, small }) => (
  <span className={`bnc-clan-tag ${small ? 'sm' : ''}`} style={{ '--c': color || '#d4af37' }}>[{tag}]</span>
);

/** Clan của người đang đăng nhập (null nếu chưa đăng nhập / chưa chạy SQL) */
export const useMyClan = () => {
  const { isAuthenticated } = useData();
  const [mine, setMine] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) { setMine(null); return; }
    supabase.rpc('bnc_my_clan').then(({ data }) => setMine(data || null));
  }, [isAuthenticated, tick]);
  return [mine, () => setTick((t) => t + 1)];
};

const CreateModal = ({ onClose }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', tag: '', description: '', color: CLAN_COLORS[0] });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: k === 'tag' ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('bnc_clan_create', { p_name: f.name, p_tag: f.tag, p_description: f.description, p_color: f.color });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Đã lập clan!', 'success');
    navigate(`/clans/${data}`);
  };
  return (
    <div className="bnc-overlay" onClick={() => !busy && onClose()}>
      <motion.div className="bnc-modal" role="dialog" aria-modal="true" aria-labelledby="clan-create-title"
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} onClick={(e) => e.stopPropagation()}>
        <div className="bnc-modal-head">
          <h3 id="clan-create-title">Lập clan mới</h3>
          <button type="button" className="bnc-x" onClick={onClose} aria-label="Đóng"><BiX size={20} /></button>
        </div>
        <form className="bnc-modal-body" onSubmit={submit}>
          <div className="row g-2">
            <div className="col-8">
              <label className="bnc-label" htmlFor="c-name">Tên clan</label>
              <input id="c-name" className="bnc-input" value={f.name} onChange={set('name')} minLength={3} maxLength={24} required placeholder="VD: Rồng Lửa" />
            </div>
            <div className="col-4">
              <label className="bnc-label" htmlFor="c-tag">Tag</label>
              <input id="c-tag" className="bnc-input" value={f.tag} onChange={set('tag')} minLength={2} maxLength={5} required placeholder="RL" />
            </div>
          </div>
          <div className="bnc-help mb-3">Tag 2–5 chữ cái/số, hiện trước tên thành viên trên web.</div>
          <label className="bnc-label" htmlFor="c-desc">Giới thiệu</label>
          <textarea id="c-desc" className="bnc-input mb-3" rows={3} maxLength={300} value={f.description} onChange={set('description')} placeholder="Clan bạn chơi theo phong cách nào, tuyển ai…" />
          <span className="bnc-label d-block">Màu clan</span>
          <div className="bnc-swatches mb-4" role="radiogroup" aria-label="Màu clan">
            {CLAN_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c} className={f.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setF((s) => ({ ...s, color: c }))} />
            ))}
          </div>
          <div className="mb-3">Xem trước: <ClanTag tag={f.tag || 'TAG'} color={f.color} /> <b>{f.name || 'Tên clan'}</b></div>
          <button type="submit" className="bnc-btn bnc-btn-block" disabled={busy}>{busy ? 'Đang tạo…' : 'Lập clan'}</button>
        </form>
      </motion.div>
    </div>
  );
};

const Clans = () => {
  const { isAuthenticated } = useData();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [notReady, setNotReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mine, refreshMine] = useMyClan();

  useEffect(() => {
    supabase.rpc('bnc_clan_list').then(({ data, error }) => { if (error) setNotReady(true); setList(data || []); });
  }, []);

  const pending = new Set(mine?.pending || []);
  const request = async (c) => {
    const { error } = pending.has(c.id)
      ? await supabase.rpc('bnc_clan_cancel', { p_clan: c.id })
      : await supabase.rpc('bnc_clan_request', { p_clan: c.id });
    if (error) toast(error.message, 'error');
    else { toast(pending.has(c.id) ? 'Đã huỷ đơn' : `Đã gửi đơn xin vào ${c.name}`, 'success'); refreshMine(); }
  };

  return (
    <>
      <Seo title="Clan" description="Các clan trên máy chủ Minecraft BuildnChill — bảng xếp hạng clan theo tổng giờ chơi, khối đã đào và thành tựu." path="/clans" />
      <PageHero pill="Cộng đồng" title="Clan" highlight="BuildnChill" subtitle="Lập clan với bạn bè, cùng cày để leo bảng xếp hạng clan. Mỗi người chỉ ở 1 clan, tối đa 30 thành viên." crumbs={[{ label: 'Clan' }]}>
        <div className="mt-4 d-flex flex-wrap gap-2 align-items-center">
          {!isAuthenticated ? <Link to="/login" className="bnc-btn"><BiPlus /> Đăng nhập để lập / vào clan</Link>
            : mine?.clan ? <Link to={`/clans/${mine.clan.tag}`} className="bnc-btn"><BiGroup /> Clan của tôi: {mine.clan.name}</Link>
              : <button type="button" className="bnc-btn" onClick={() => setCreating(true)} disabled={notReady}><BiPlus /> Lập clan</button>}
        </div>
      </PageHero>

      <section className="bnc-section pt-5">
        <div className="container">
          {notReady ? <div className="bnc-card bnc-empty">Tính năng đang được thiết lập, quay lại sau nhé!</div>
            : list === null ? <Spinner /> : list.length === 0 ? (
              <div className="bnc-card bnc-empty">Chưa có clan nào — lập clan đầu tiên của server!</div>
            ) : (
              <div className="bnc-card bnc-clan-table">
                <div className="row-h" aria-hidden="true">
                  <span>#</span><span>Clan</span><span>Thành viên</span><span>Tổng giờ chơi</span><span className="hide-sm">Khối đã đào</span><span className="hide-sm">Thành tựu</span><span />
                </div>
                <ol>
                  {list.map((c, i) => (
                    <li key={c.id}>
                      <span className={`rk r${i + 1}`}>{i === 0 ? <BiCrown /> : i + 1}</span>
                      <Link to={`/clans/${c.tag}`} className="nm">
                        <ClanTag tag={c.tag} color={c.color} /> <b>{c.name}</b>
                        {c.description && <span className="d">{c.description}</span>}
                      </Link>
                      <span className="num" data-label="Thành viên">{c.members}/30</span>
                      <span className="num" data-label="Giờ chơi">{formatDuration(c.play_seconds, { coarse: true })}</span>
                      <span className="num hide-sm">{fmtNum(c.blocks_mined)}</span>
                      <span className="num hide-sm">{fmtNum(c.adv_done)}</span>
                      <span className="act">
                        {isAuthenticated && mine && !mine.clan && c.members < 30 && (
                          <button type="button" className={`bnc-btn bnc-btn-sm ${pending.has(c.id) ? 'bnc-btn-ghost' : ''}`} onClick={() => request(c)}>
                            {pending.has(c.id) ? 'Huỷ đơn' : 'Xin vào'}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
        </div>
      </section>

      <AnimatePresence>{creating && <CreateModal onClose={() => setCreating(false)} />}</AnimatePresence>
    </>
  );
};

export default Clans;
