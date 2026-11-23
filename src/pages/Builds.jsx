import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BiHeart, BiComment, BiPlus, BiX, BiImageAdd, BiStar } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner, useToast } from '../components/ui';
import { mcHead } from '../lib/api';
import { timeAgo } from '../lib/playtime';
import { compressImage } from '../lib/community';
import '../styles/pages.css';

const SORTS = [
  { id: 'new', label: 'Mới nhất' },
  { id: 'top', label: 'Nhiều tim nhất' },
  { id: 'featured', label: 'Nổi bật' },
];
const WORLDS = ['Thế giới chính', 'Nether', 'The End', 'Khác'];
const PAGE = 24;

export const uploadBuildImages = async (uid, files) => {
  const urls = [];
  const paths = [];
  try {
    for (const f of files) {
      const { blob, ext } = await compressImage(f);
      if (blob.size > 3 * 1024 * 1024) throw new Error(`Ảnh “${f.name}” vẫn quá 3MB sau khi nén`);
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('builds').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw new Error(/bucket/i.test(error.message) ? 'Kho ảnh chưa được tạo (chạy COMMUNITY_MIGRATION.sql)' : error.message);
      paths.push(path);
      urls.push(supabase.storage.from('builds').getPublicUrl(path).data.publicUrl);
    }
    return { urls, paths };
  } catch (e) {
    if (paths.length) await supabase.storage.from('builds').remove(paths);
    throw e;
  }
};

const PostModal = ({ onClose, onDone }) => {
  const toast = useToast();
  const { userProfile } = useData();
  const [form, setForm] = useState({ title: '', description: '', world: WORLDS[0], x: '', y: '', z: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const addFiles = (list) => {
    const imgs = Array.from(list || []).filter((f) => /^image\//.test(f.type) && f.size <= 20 * 1024 * 1024);
    setFiles((s) => [...s, ...imgs].slice(0, 6));
  };
  const coord = (v) => (/^-?\d{1,8}$/.test(String(v).trim()) ? Number(v) : null);

  const submit = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 3) { toast('Tên công trình cần ít nhất 3 ký tự', 'error'); return; }
    if (!files.length) { toast('Thêm ít nhất 1 ảnh nhé', 'error'); return; }
    setBusy(true);
    let uploaded = null;
    try {
      uploaded = await uploadBuildImages(userProfile.id, files);
      const { data, error } = await supabase.from('builds').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        world: form.world,
        x: coord(form.x), y: coord(form.y), z: coord(form.z),
        images: uploaded.urls,
      }).select('id').single();
      if (error) throw error;
      toast('Đã đăng công trình!', 'success');
      onDone(data.id);
    } catch (err) {
      if (uploaded?.paths?.length) await supabase.storage.from('builds').remove(uploaded.paths);
      toast(err.message || 'Đăng không thành công', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="bnc-overlay" onClick={() => !busy && onClose()}>
      <motion.div className="bnc-modal bnc-modal-lg" role="dialog" aria-modal="true" aria-labelledby="post-build-title"
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} onClick={(e) => e.stopPropagation()}>
        <div className="bnc-modal-head">
          <h3 id="post-build-title">Đăng công trình</h3>
          <button type="button" className="bnc-x" onClick={onClose} disabled={busy} aria-label="Đóng"><BiX size={20} /></button>
        </div>
        <form className="bnc-modal-body" onSubmit={submit}>
          <label className="bnc-label" htmlFor="b-title">Tên công trình</label>
          <input id="b-title" className="bnc-input mb-3" value={form.title} onChange={set('title')} maxLength={80} placeholder="VD: Lâu đài tuyết trên núi" required />

          <label className="bnc-label">Ảnh ({files.length}/6)</label>
          <div className="bnc-upload mb-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            {previews.map((p, i) => (
              <div key={p.url} className="th">
                <img src={p.url} alt="" />
                {i === 0 && <span className="cover">Ảnh bìa</span>}
                <button type="button" onClick={() => setFiles((s) => s.filter((x) => x !== p.f))} aria-label="Bỏ ảnh này"><BiX /></button>
              </div>
            ))}
            {files.length < 6 && (
              <button type="button" className="add" onClick={() => input.current?.click()}>
                <BiImageAdd size={26} /><span>Thêm ảnh</span>
              </button>
            )}
          </div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <div className="bnc-help mb-3">Ảnh đầu tiên làm ảnh bìa. Ảnh được tự thu nhỏ trước khi tải lên.</div>

          <label className="bnc-label" htmlFor="b-desc">Giới thiệu <span className="text-dim">(không bắt buộc)</span></label>
          <textarea id="b-desc" className="bnc-input mb-3" rows={3} value={form.description} onChange={set('description')} maxLength={1500} placeholder="Xây mất bao lâu, dùng những khối gì, có gì đặc biệt…" />

          <div className="row g-2 mb-1">
            <div className="col-12 col-sm-5">
              <label className="bnc-label" htmlFor="b-world">Thế giới</label>
              <select id="b-world" className="bnc-input" value={form.world} onChange={set('world')}>{WORLDS.map((w) => <option key={w}>{w}</option>)}</select>
            </div>
            {['x', 'y', 'z'].map((k) => (
              <div key={k} className="col-4 col-sm">
                <label className="bnc-label" htmlFor={`b-${k}`}>{k.toUpperCase()}</label>
                <input id={`b-${k}`} className="bnc-input" inputMode="numeric" value={form[k]} onChange={set(k)} placeholder="—" maxLength={9} />
              </div>
            ))}
          </div>
          <div className="bnc-help mb-4">Toạ độ để mọi người ghé thăm (gõ F3 trong game để xem). Có thể để trống.</div>

          <button type="submit" className="bnc-btn bnc-btn-block" disabled={busy}>{busy ? 'Đang tải lên…' : 'Đăng công trình'}</button>
        </form>
      </motion.div>
    </div>
  );
};

export const BuildCard = ({ b, admin, onChanged }) => (
  <article className="bnc-card bnc-build">
    <Link to={`/builds/${b.id}`} className="cover">
      <img src={b.images[0]} alt={b.title} loading="lazy" />
      {b.featured && <span className="feat"><BiStar /> Nổi bật</span>}
      {b.images.length > 1 && <span className="count">{b.images.length} ảnh</span>}
    </Link>
    <div className="body">
      <Link to={`/builds/${b.id}`} className="t">{b.title}</Link>
      <div className="meta">
        <Link to={`/builds?by=${encodeURIComponent(b.mc_username)}`} className="by">
          <img src={mcHead(b.mc_username.replace(/^[.*]/, ''), 32)} alt="" width="20" height="20" />{b.mc_username}
        </Link>
        <span className="stat" title="Lượt thích"><BiHeart /> {b.likes_count}</span>
        <span className="stat" title="Bình luận"><BiComment /> {b.comments_count}</span>
      </div>
      <div className="when">{timeAgo(b.created_at)}{b.hidden && <span className="hid"> · Đang ẩn</span>}</div>
      {admin && <AdminBuildTools b={b} onChanged={onChanged} />}
    </div>
  </article>
);

export const AdminBuildTools = ({ b, onChanged }) => {
  const toast = useToast();
  const upd = async (patch, msg) => {
    const { error } = await supabase.from('builds').update(patch).eq('id', b.id);
    if (error) toast(error.message, 'error'); else { toast(msg, 'success'); onChanged?.(); }
  };
  return (
    <div className="bnc-admin-row">
      <button type="button" onClick={() => upd({ featured: !b.featured }, b.featured ? 'Đã bỏ nổi bật' : 'Đã gắn nổi bật')}>{b.featured ? 'Bỏ nổi bật' : 'Gắn nổi bật'}</button>
      <button type="button" onClick={() => upd({ hidden: !b.hidden }, b.hidden ? 'Đã hiện lại' : 'Đã ẩn bài')}>{b.hidden ? 'Hiện lại' : 'Ẩn bài'}</button>
    </div>
  );
};

const Builds = () => {
  const navigate = useNavigate();
  const { isAuthenticated, userProfile } = useData();
  const admin = userProfile?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const sort = SORTS.some((s) => s.id === params.get('sort')) ? params.get('sort') : 'new';
  const by = params.get('by') || '';
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [posting, setPosting] = useState(false);
  const [tick, setTick] = useState(0);
  const [notReady, setNotReady] = useState(false);

  const load = async (offset = 0) => {
    let q = supabase.from('builds').select('id,title,images,mc_username,likes_count,comments_count,featured,hidden,created_at');
    if (by) q = q.ilike('mc_username', by.replace(/[%_]/g, (m) => `\\${m}`));
    if (sort === 'featured') q = q.eq('featured', true);
    q = sort === 'top' ? q.order('likes_count', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) { setNotReady(true); return []; }
    setMore((data || []).length === PAGE);
    return data || [];
  };

  useEffect(() => {
    let alive = true;
    setItems(null);
    load(0).then((d) => { if (alive) setItems(d); });
    return () => { alive = false; };
  }, [sort, by, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSort = (s) => { const p = new URLSearchParams(params); p.set('sort', s); if (s === 'new') p.delete('sort'); setParams(p); };

  return (
    <>
      <Seo title="Công trình" description="Thư viện công trình của người chơi BuildnChill — khoe công trình, thả tim và bình luận." path="/builds" />
      <PageHero pill="Cộng đồng" title="Thư viện" highlight="công trình" subtitle="Khoe công trình bạn đã xây, ghé thăm toạ độ của người khác, thả tim cho tác phẩm bạn thích." crumbs={[{ label: 'Công trình' }]}>
        <div className="mt-4">
          {isAuthenticated
            ? <button type="button" className="bnc-btn" onClick={() => setPosting(true)}><BiPlus /> Đăng công trình</button>
            : <Link to="/login" className="bnc-btn"><BiPlus /> Đăng nhập để đăng công trình</Link>}
        </div>
      </PageHero>

      <section className="bnc-section pt-5">
        <div className="container">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
            <div className="bnc-lb-tabs" role="tablist" aria-label="Sắp xếp">
              {SORTS.map((s) => <button key={s.id} role="tab" aria-selected={sort === s.id} className={`bnc-tab ${sort === s.id ? 'active' : ''}`} onClick={() => setSort(s.id)}>{s.label}</button>)}
            </div>
            {by && (
              <div className="bnc-filter-chip">
                Của <b>{by}</b>
                <button type="button" onClick={() => { const p = new URLSearchParams(params); p.delete('by'); setParams(p); }} aria-label="Bỏ lọc"><BiX /></button>
              </div>
            )}
          </div>

          {notReady ? <div className="bnc-card bnc-empty">Tính năng đang được thiết lập, quay lại sau nhé!</div>
            : items === null ? <Spinner /> : items.length === 0 ? (
              <div className="bnc-card bnc-empty">{by ? `${by} chưa đăng công trình nào.` : 'Chưa có công trình nào — hãy là người đầu tiên khoe tác phẩm!'}</div>
            ) : (
              <>
                <div className="bnc-builds">
                  {items.map((b) => <BuildCard key={b.id} b={b} admin={admin} onChanged={() => setTick((t) => t + 1)} />)}
                </div>
                {more && (
                  <div className="text-center mt-4">
                    <button type="button" className="bnc-btn bnc-btn-ghost" onClick={async () => { const d = await load(items.length); setItems((s) => [...s, ...d]); }}>Xem thêm</button>
                  </div>
                )}
              </>
            )}
        </div>
      </section>

      <AnimatePresence>
        {posting && <PostModal onClose={() => setPosting(false)} onDone={(id) => { setPosting(false); navigate(`/builds/${id}`); }} />}
      </AnimatePresence>
    </>
  );
};

export default Builds;
