import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiSearch, BiCalendar, BiRightArrowAlt } from 'react-icons/bi';
import { useData } from '../context/DataContext';
import { PageHero, Seo } from '../components/ui';
import '../styles/pages.css';

const PAGE_SIZE = 9;
const FALLBACK = '/img/blog-cover.jpg';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const onImgError = (e) => {
  if (!e.currentTarget.src.endsWith(FALLBACK)) e.currentTarget.src = FALLBACK;
};

const News = () => {
  const { news } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filteredNews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return news;
    return news.filter((post) =>
      (post.title || '').toLowerCase().includes(q) ||
      (post.description || '').toLowerCase().includes(q) ||
      plain(post.content).toLowerCase().includes(q)
    );
  }, [news, searchQuery]);

  const featuredPost = filteredNews[0];
  const olderPosts = filteredNews.slice(1, 1 + visible);
  const hasMore = filteredNews.length - 1 > visible;

  return (
    <>
      <Seo title="Tin tức & Sự kiện" description="Cập nhật tin tức, sự kiện, bản cập nhật mới nhất của máy chủ Minecraft BuildnChill." path="/news" />
      <PageHero
        pill="Tin tức"
        title="Tin tức &"
        highlight="Sự kiện"
        subtitle="Bản cập nhật, sự kiện cộng đồng và thông báo quan trọng từ đội ngũ BuildnChill."
        crumbs={[{ label: 'Tin tức' }]}
      />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row justify-content-between align-items-center g-3 mb-5">
            <div className="col-md-6">
              <div className="text-soft fw-bold small text-uppercase tracking-wide">
                {filteredNews.length} bài viết
              </div>
            </div>
            <div className="col-md-5">
              <div className="bnc-search">
                <BiSearch size={20} />
                <input
                  type="search"
                  className="bnc-input"
                  placeholder="Tìm kiếm bài viết..."
                  aria-label="Tìm kiếm bài viết"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                />
              </div>
            </div>
          </div>

          {featuredPost && (
            <motion.article
              className="bnc-card bnc-card-hover bnc-featured mb-5"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Link to={`/news/${featuredPost.slug || featuredPost.id}`} className="bnc-featured-img" aria-label={featuredPost.title}>
                <img src={featuredPost.image || FALLBACK} alt={featuredPost.title} onError={onImgError} />
                <span className="bnc-post-date">Nổi bật</span>
              </Link>
              <div className="bnc-featured-body">
                <div className="bnc-meta mb-3">
                  <span><BiCalendar /> {fmtDate(featuredPost.date)}</span>
                </div>
                <h2 className="mb-3">
                  <Link to={`/news/${featuredPost.slug || featuredPost.id}`} className="text-white">{featuredPost.title}</Link>
                </h2>
                <p className="mb-4">{featuredPost.description || plain(featuredPost.content).slice(0, 220)}</p>
                <div>
                  <Link to={`/news/${featuredPost.slug || featuredPost.id}`} className="bnc-btn">
                    Đọc bài viết <BiRightArrowAlt size={20} />
                  </Link>
                </div>
              </div>
            </motion.article>
          )}

          <div className="row g-4">
            {olderPosts.map((post, i) => (
              <motion.div
                key={post.id}
                className="col-md-6 col-lg-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.06 }}
              >
                <article className="bnc-card bnc-card-hover bnc-post">
                  <Link to={`/news/${post.slug || post.id}`} className="bnc-post-img" aria-label={post.title}>
                    <img src={post.image || FALLBACK} alt={post.title} loading="lazy" onError={onImgError} />
                    <span className="bnc-post-date">{fmtDate(post.date)}</span>
                  </Link>
                  <div className="bnc-post-body">
                    <h3>
                      <Link to={`/news/${post.slug || post.id}`} className="text-white">{post.title}</Link>
                    </h3>
                    <p>{post.description || plain(post.content).slice(0, 160)}</p>
                    <Link to={`/news/${post.slug || post.id}`} className="bnc-post-link">
                      Xem chi tiết <BiRightArrowAlt />
                    </Link>
                  </div>
                </article>
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-5">
              <button className="bnc-btn bnc-btn-ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Xem thêm bài viết
              </button>
            </div>
          )}

          {filteredNews.length === 0 && (
            <div className="bnc-card bnc-empty">
              {news.length === 0 ? 'Chưa có bài viết nào. Hãy quay lại sau nhé!' : `Không tìm thấy bài viết phù hợp với "${searchQuery}".`}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default News;
