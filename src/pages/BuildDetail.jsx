import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BiArrowBack, BiHeart, BiSolidHeart, BiLink, BiMap, BiTrash, BiCopy } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { Seo, Spinner, useCopy, useToast } from '../components/ui';
import { mcHead } from '../lib/api';
import { formatDate, timeAgo } from '../lib/playtime';
import { AdminBuildTools } from './Builds';
import '../styles/pages.css';

const UUID_RE = /^[0-9a-f-]{36}$/i;

const Comments = ({ build, onCount }) => {
  const { isAuthenticated, userProfile } = useData();
  const toast = useToast();
  const admin = userProfile?.role === 'admin';
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('build_comments').select('id,user_id,mc_username,content,hidden,created_at')
    .eq('build_id', build.id).order('created_at', { ascending: true }).limit(300)
    .then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, [build.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    const { error } = await supabase.from('build_comments').insert({ build_id: build.id, content });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setText('');
    load();
    onCount(1);
  };
  const remove = async (c) => {
    if (!window.confirm('Xoá bình luận này?')) return;
    const { error } = await supabase.from('build_comments').delete().eq('id', c.id);
    if (error) toast(error.message, 'error'); else { load(); onCount(-1); }
  };

  return (
    <div className="bnc-card bnc-card-pad mt-4">
      <h2 className="h6 mb-3">Bình luận {list ? `(${list.filter((c) => !c.hidden).length})` : ''}</h2>
      {list === null ? <Spinner /> : list.length === 0 ? <div className="small text-soft mb-3">Chưa có bình luận nào.</div> : (
        <ul className="bnc-comments">
          {list.map((c) => (
            <li key={c.id} className={c.hidden ? 'hid' : ''}>
              <img src={mcHead(c.mc_username.replace(/^[.*]/, ''), 48)} alt="" width="32" height="32" loading="lazy" />
              <div className="b">
                <div className="h">
                  <Link to={`/player/${encodeURIComponent(c.mc_username)}`} className="n">{c.mc_username}</Link>
                  {c.mc_username === build.mc_username && <span className="bnc-badge gold">Tác giả</span>}
                  <span className="t">{timeAgo(c.created_at)}</span>
                  {(admin || c.user_id === userProfile?.id) && (
                    <button type="button" className="del" onClick={() => remove(c)} aria-label="Xoá bình luận"><BiTrash /></button>
                  )}
                </div>
                <p>{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {isAuthenticated ? (
        <form className="bnc-comment-form" onSubmit={send}>
          <textarea className="bnc-input" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Viết bình luận…" aria-label="Viết bình luận" />
          <button type="submit" className="bnc-btn bnc-btn-sm" disabled={busy || !text.trim()}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
        </form>
      ) : (
        <div className="small text-soft"><Link to="/login">Đăng nhập</Link> để bình luận.</div>
      )}
    </div>
  );
};

const BuildDetail = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const copy = useCopy();
  const toast = useToast();
  const { isAuthenticated, userProfile } = useData();
  const admin = userProfile?.role === 'admin';
  const [b, setB] = useState(undefined);
  const [img, setImg] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const load = () => {
    if (!UUID_RE.test(id)) { setB(null); return; }
    supabase.from('builds').select('*').eq('id', id).maybeSingle().then(({ data }) => setB(data || null));
  };
  useEffect(() => { setB(undefined); setImg(0); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userProfile?.id || !UUID_RE.test(id)) { setLiked(false); return; }
    supabase.from('build_likes').select('build_id').eq('build_id', id).eq('user_id', userProfile.id).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [id, userProfile?.id]);

  if (b === undefined) return <div className="min-vh-100"><Spinner /></div>;
  if (!b) {
    return (
      <section className="bnc-section">
        <div className="container text-center" style={{ maxWidth: 560 }}>
          <h1 className="h4">Không tìm thấy công trình</h1>
          <p className="text-soft">Bài có thể đã bị xoá hoặc đường dẫn chưa đúng.</p>
          <Link to="/builds" className="bnc-btn bnc-btn-ghost"><BiArrowBack /> Về thư viện công trình</Link>
        </div>
      </section>
    );
  }

  const mine = b.user_id === userProfile?.id;
  const coords = [b.x, b.y, b.z].every((v) => v !== null && v !== undefined) ? `${b.x} ${b.y} ${b.z}` : null;

  const toggleLike = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setLikeBusy(true);
    const { error } = liked
      ? await supabase.from('build_likes').delete().eq('build_id', b.id).eq('user_id', userProfile.id)
      : await supabase.from('build_likes').insert({ build_id: b.id });
    setLikeBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setLiked(!liked);
    setB((s) => ({ ...s, likes_count: s.likes_count + (liked ? -1 : 1) }));
  };

  const remove = async () => {
    if (!window.confirm('Xoá công trình này? Không thể khôi phục.')) return;
    const { error } = await supabase.from('builds').delete().eq('id', b.id);
    if (error) { toast(error.message, 'error'); return; }
    // Xoá ảnh trong kho (bỏ qua lỗi)
    const paths = b.images.map((u) => u.split('/storage/v1/object/public/builds/')[1]).filter(Boolean);
    if (paths.length) await supabase.storage.from('builds').remove(paths);
    toast('Đã xoá công trình', 'success');
    navigate('/builds');
  };

  return (
    <>
      <Seo title={`${b.title} — công trình của ${b.mc_username}`} description={b.description?.slice(0, 150) || `Công trình “${b.title}” của ${b.mc_username} trên máy chủ Minecraft BuildnChill.`} path={`/builds/${b.id}`} />
      <section className="bnc-section pt-4">
        <div className="container" style={{ maxWidth: 1080 }}>
          <div className="bnc-crumbs mb-3">
            <Link to="/">Trang chủ</Link> / <Link to="/builds">Công trình</Link> / <span className="text-soft">{b.title}</span>
          </div>
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="bnc-build-gallery">
                <a href={b.images[img]} target="_blank" rel="noopener noreferrer" className="main"><img src={b.images[img]} alt={`${b.title} — ảnh ${img + 1}`} /></a>
                {b.images.length > 1 && (
                  <div className="thumbs">
                    {b.images.map((u, i) => (
                      <button key={u} type="button" className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`Ảnh ${i + 1}`}><img src={u} alt="" loading="lazy" /></button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-lg-4">
              <div className="bnc-card bnc-card-pad">
                {b.hidden && <div className="bnc-badge mb-2">Đang ẩn khỏi thư viện</div>}
                <h1 className="h3 mb-3">{b.title}</h1>
                <Link to={`/player/${encodeURIComponent(b.mc_username)}`} className="bnc-build-author">
                  <img src={mcHead(b.mc_username.replace(/^[.*]/, ''), 64)} alt="" width="40" height="40" />
                  <span><b>{b.mc_username}</b><span>Đăng {formatDate(b.created_at)}</span></span>
                </Link>
                {b.description && <p className="text-soft mt-3 mb-0" style={{ whiteSpace: 'pre-line' }}>{b.description}</p>}
                {(coords || b.world) && (
                  <div className="bnc-coords mt-3">
                    <BiMap />
                    <span>{b.world}{coords && <> · <code>{coords}</code></>}</span>
                    {coords && <button type="button" onClick={() => copy(coords, 'Đã sao chép toạ độ')} aria-label="Sao chép toạ độ"><BiCopy /></button>}
                  </div>
                )}
                <div className="d-flex flex-wrap gap-2 mt-4">
                  <button type="button" className={`bnc-btn ${liked ? '' : 'bnc-btn-ghost'}`} onClick={toggleLike} disabled={likeBusy} aria-pressed={liked}>
                    {liked ? <BiSolidHeart /> : <BiHeart />} {b.likes_count}
                  </button>
                  <button type="button" className="bnc-btn bnc-btn-ghost" onClick={() => copy(window.location.href, 'Đã sao chép link')}><BiLink /> Chia sẻ</button>
                  {(mine || admin) && <button type="button" className="bnc-btn bnc-btn-ghost text-danger" onClick={remove}><BiTrash /> Xoá</button>}
                </div>
                {admin && <AdminBuildTools b={b} onChanged={load} />}
              </div>
              <Comments build={b} onCount={(d) => setB((s) => ({ ...s, comments_count: s.comments_count + d }))} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default BuildDetail;
