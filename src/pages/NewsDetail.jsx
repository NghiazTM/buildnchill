import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BiArrowBack, BiCalendar, BiTime, BiLink, BiShareAlt } from 'react-icons/bi';
import { FaFacebookF } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner, useCopy } from '../components/ui';
import 'react-quill/dist/quill.snow.css';
import '../styles/pages.css';

const FALLBACK = '/img/blog-cover.jpg';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const onImgError = (e) => {
  if (!e.currentTarget.src.endsWith(FALLBACK)) e.currentTarget.src = FALLBACK;
};

const NewsDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { news } = useData();
  const copy = useCopy();
  const [post, setPost] = useState(null);

  useEffect(() => {
    const foundPost = news.find((p) => p.slug === slug || p.id.toString() === slug);
    if (foundPost) {
      setPost(foundPost);
    } else if (news.length > 0) {
      navigate('/news');
    }
  }, [slug, navigate, news]);

  const others = useMemo(() => news.filter((p) => p.id !== post?.id).slice(0, 4), [news, post]);
  const readMinutes = useMemo(() => Math.max(1, Math.round(plain(post?.content).split(' ').length / 220)), [post]);

  if (!post) {
    return <div className="min-vh-100"><Spinner label="Đang tải bài viết..." /></div>;
  }

  const url = typeof window !== 'undefined' ? window.location.href : `https://buildnchill.id.vn/news/${post.slug || post.id}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    copy(url, 'Đã sao chép liên kết bài viết');
  };

  return (
    <>
      <Seo title={post.title} description={post.description || plain(post.content).slice(0, 160)} path={`/news/${post.slug || post.id}`} />
      <PageHero
        pill="Tin tức"
        title={post.title}
        crumbs={[{ label: 'Tin tức', to: '/news' }, { label: 'Bài viết' }]}
      >
        <div className="bnc-meta mt-3">
          <span><BiCalendar /> {fmtDate(post.date)}</span>
          <span><BiTime /> {readMinutes} phút đọc</span>
        </div>
      </PageHero>

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4 g-lg-5">
            <motion.div className="col-lg-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="bnc-cover mb-4">
                <img src={post.image || FALLBACK} alt={post.title} onError={onImgError} />
              </div>

              <article className="bnc-card bnc-card-pad">
                {post.description && <p className="lead text-soft fw-semibold mb-4">{post.description}</p>}
                <div className="ql-snow">
                  <div className="ql-editor bnc-article" dangerouslySetInnerHTML={{ __html: post.content }} />
                </div>

                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-5 pt-4 border-top">
                  <Link to="/news" className="bnc-btn bnc-btn-dark bnc-btn-sm">
                    <BiArrowBack /> Tất cả tin tức
                  </Link>
                  <div className="d-flex flex-wrap gap-2">
                    <a
                      className="bnc-btn bnc-btn-discord bnc-btn-sm"
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FaFacebookF /> Facebook
                    </a>
                    <button className="bnc-btn bnc-btn-ghost bnc-btn-sm" onClick={() => copy(url, 'Đã sao chép liên kết bài viết')}>
                      <BiLink /> Copy link
                    </button>
                    <button className="bnc-btn bnc-btn-sm" onClick={share}>
                      <BiShareAlt /> Chia sẻ
                    </button>
                  </div>
                </div>
              </article>
            </motion.div>

            <aside className="col-lg-4">
              <div className="bnc-card bnc-card-pad mb-4" style={{ position: 'sticky', top: 100 }}>
                <h2 className="h6 fw-black text-uppercase tracking-wide mb-3">Bài viết khác</h2>
                {others.length === 0 && <div className="text-dim small">Chưa có bài viết khác.</div>}
                {others.map((p) => (
                  <Link key={p.id} to={`/news/${p.slug || p.id}`} className="bnc-side-post">
                    <img src={p.image || FALLBACK} alt="" loading="lazy" onError={onImgError} />
                    <span className="min-w-0">
                      <span className="t">{p.title}</span>
                      <span className="d-block text-dim small mt-1">{fmtDate(p.date)}</span>
                    </span>
                  </Link>
                ))}
                <div className="bnc-card-flat p-3 mt-4 text-center">
                  <div className="fw-black mb-1">Ủng hộ máy chủ</div>
                  <p className="text-soft small mb-3">Vật phẩm được giao tự động vào game chỉ trong vài giây.</p>
                  <Link to="/shop" className="bnc-btn bnc-btn-sm bnc-btn-block">Ghé cửa hàng</Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
};

export default NewsDetail;
