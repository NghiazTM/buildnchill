import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BiRocket, BiGroup, BiBuildings, BiShieldQuarter, BiCopy, BiRightArrowAlt, BiCalendar, BiStore,
} from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { supabase } from '../supabaseClient';
import { Divider, SectionTitle, Seo, useCopy } from '../components/ui';
import { formatVnd, mcHead } from '../lib/api';
import { FEATURES, HOW_TO_JOIN } from '../data/siteContent';

const ICONS = { BiRocket, BiGroup, BiBuildings, BiShieldQuarter };
const FALLBACK_SLIDES = ['/og-image.jpg'];

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const Home = () => {
  const { news, serverStatus, siteSettings, carouselImages } = useData();
  const copy = useCopy();
  const [slide, setSlide] = useState(0);
  const [recent, setRecent] = useState([]);
  const [products, setProducts] = useState([]);

  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const title = siteSettings?.site_title || 'BuildnChill';
  const online = serverStatus?.status === 'Online';

  const slides = useMemo(() => {
    const imgs = (carouselImages || []).filter((i) => i.is_active !== false).map((i) => i.image_url).filter(Boolean);
    return imgs.length ? imgs : FALLBACK_SLIDES;
  }, [carouselImages]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('bnc_recent_purchases', { p_limit: 12 }).then(({ data }) => alive && data && setRecent(data));
    supabase
      .from('products')
      .select('id, name, price, image_url, description')
      .eq('active', true)
      .eq('is_deleted', false)
      .order('display_order')
      .limit(4)
      .then(({ data }) => alive && data && setProducts(data));
    return () => { alive = false; };
  }, []);

  const latestNews = (news || []).slice(0, 3);

  return (
    <>
      <Seo
        title="Server Minecraft Sinh Tồn Việt Nam"
        description="BuildnChill là máy chủ Minecraft Sinh Tồn Việt Nam: xây dựng, cày cuốc, chill cùng cộng đồng thân thiện. Gameplay mượt mà, cửa hàng giao vật phẩm tự động 24/7."
        path="/"
      />

      {/* ================= HERO ================= */}
      <section className="bnc-hero">
        <div className="container">
          <div className="row align-items-center g-5">
            <motion.div className="col-lg-7" initial="hidden" animate="show" variants={fadeUp}>
              <span className="bnc-pill">Minecraft Server Việt Nam</span>
              <h1>
                Tham gia <span className="highlight">{title}</span>: Hành trình <span className="highlight">sinh tồn</span> mới đang chờ bạn!
              </h1>
              <p className="lead-text">
                Khám phá thế giới rộng lớn, xây dựng cùng bạn bè và leo bảng xếp hạng trong máy chủ sinh tồn thân thiện nhất Việt Nam.
              </p>

              <div className="d-flex flex-wrap gap-3 mt-4">
                <button className="bnc-btn" onClick={() => copy(ip, `Đã sao chép IP: ${ip}`)}>
                  <span className="sq">■</span> Copy IP
                </button>
                <Link to="/shop" className="bnc-btn bnc-btn-ghost">
                  <span className="sq">■</span> Vào cửa hàng
                </Link>
                <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-discord">
                  <FaDiscord /> Discord
                </a>
              </div>

              <div className="bnc-ip-box">
                <span className="text-dim small fw-bold text-uppercase">IP</span>
                <code>{ip}</code>
                <button className="bnc-copy" onClick={() => copy(ip, 'Đã sao chép IP')} aria-label="Sao chép IP"><BiCopy /></button>
              </div>

              <div className="row g-3 mt-3">
                <div className="col-sm-4 col-12">
                  <div className="bnc-feature-box">
                    <p className="num"><span className={`dot ${online ? 'dot-green' : 'dot-red'}`} />{online ? (serverStatus?.players || 0) : 'Offline'}</p>
                    <p className="lbl">Đang online</p>
                  </div>
                </div>
                <div className="col-sm-4 col-6">
                  <div className="bnc-feature-box">
                    <p className="num"><span className="dot dot-orange" />{serverStatus?.version || siteSettings?.server_version || '1.21'}</p>
                    <p className="lbl">Phiên bản</p>
                  </div>
                </div>
                <div className="col-sm-4 col-6">
                  <div className="bnc-feature-box">
                    <p className="num"><span className="dot dot-yellow" />24/7</p>
                    <p className="lbl">Giao hàng tự động</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div className="col-lg-5 d-none d-lg-block" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
              <div className="bnc-hero-art">
                <div className="glow" />
                <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: '2rem', overflow: 'hidden', border: '2px solid rgba(var(--bnc-accent-rgb), .35)', boxShadow: '0 30px 60px rgba(0,0,0,.6)' }}>
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={slides[slide]}
                      src={slides[slide]}
                      alt={`${title} Minecraft`}
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7 }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                    />
                  </AnimatePresence>
                </div>
                <img src="/img/render-enderdragon.png" alt="" aria-hidden="true" style={{ position: 'absolute', width: 150, right: -30, bottom: -60, filter: 'drop-shadow(0 15px 25px rgba(0,0,0,.6))' }} />
                {slides.length > 1 && (
                  <div className="d-flex justify-content-center gap-2 mt-3">
                    {slides.map((s, i) => (
                      <button
                        key={s}
                        onClick={() => setSlide(i)}
                        aria-label={`Ảnh ${i + 1}`}
                        style={{ width: i === slide ? 28 : 10, height: 10, border: 0, background: i === slide ? 'var(--bnc-accent)' : 'var(--bnc-surface-3)', transition: 'all .25s' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
        <Divider />
      </section>

      {/* ================= RECENT PURCHASES TICKER ================= */}
      {recent.length > 0 && (
        <div className="bnc-ticker" aria-label="Giao dịch gần đây">
          <div className="bnc-ticker-track">
            {[...recent, ...recent].map((r, i) => (
              <span className="bnc-ticker-item" key={`${r.mc_username}-${i}`}>
                <img src={mcHead(r.mc_username, 32)} alt="" loading="lazy" />
                <b>{r.mc_username}</b> vừa mua <span className="text-accent fw-bold">{r.product}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ================= ABOUT ================= */}
      <section className="bnc-section" id="about-us">
        <div className="container">
          <div className="row align-items-center g-5 flex-lg-row-reverse">
            <div className="col-lg-4 text-center">
              <motion.img
                src="/img/render-villager.png"
                alt="BuildnChill villager"
                style={{ maxWidth: 260, width: '70%' }}
                animate={{ y: [0, -10, 0] }}
                transition={{ y: { repeat: Infinity, duration: 4, ease: 'easeInOut' } }}
              />
            </div>
            <motion.div className="col-lg-8" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <span className="bnc-pill">Về chúng tôi</span>
              <h2 className="bnc-heading">Xây dựng thế giới, <span className="highlight">tạo nên kỷ niệm</span></h2>
              <p className="text-soft fs-6 mb-4">
                Tại {title}, chúng tôi đam mê tạo ra những trải nghiệm gắn kết mọi người. Từ những chuyến phiêu lưu hoành tráng đến những
                khoảnh khắc chill bên bạn bè — mỗi ngày trên máy chủ đều là một câu chuyện mới. Hãy cùng chúng tôi viết tiếp hành trình ấy!
              </p>
              <div className="d-flex flex-wrap gap-3">
                <Link to="/about" className="bnc-btn bnc-btn-ghost">Tìm hiểu thêm <BiRightArrowAlt /></Link>
                <Link to="/rules" className="bnc-btn bnc-btn-dark">Luật máy chủ</Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="bnc-section bnc-section-alt">
        <div className="container">
          <SectionTitle pill="Vì sao chọn chúng tôi" title="Trải nghiệm" highlight="đỉnh cao" subtitle="Mọi thứ bạn cần cho một hành trình sinh tồn trọn vẹn." />
          <div className="row g-4">
            {FEATURES.map((f, i) => {
              const Icon = ICONS[f.icon] || BiRocket;
              return (
                <motion.div className="col-md-6 col-lg-3" key={f.title} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <div className="bnc-card bnc-card-hover bnc-card-pad h-100">
                    <div className="d-inline-flex p-3 mb-3" style={{ background: 'var(--bnc-accent-soft)', color: 'var(--bnc-accent)', borderRadius: '.8rem' }}>
                      <Icon size={30} />
                    </div>
                    <h3 className="h5 fw-black">{f.title}</h3>
                    <p className="text-soft mb-0 small">{f.text}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= HOW TO JOIN ================= */}
      <section className="bnc-section">
        <div className="container">
          <SectionTitle pill="Bắt đầu ngay" title="Vào máy chủ trong" highlight="3 bước" />
          <div className="row g-4">
            {HOW_TO_JOIN.map((s, i) => (
              <motion.div className="col-md-4" key={s.title} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                <div className="bnc-card bnc-card-hover bnc-card-pad h-100">
                  <div className="fw-black text-accent" style={{ fontSize: '2.6rem', lineHeight: 1 }}>0{i + 1}</div>
                  <h3 className="h5 fw-black mt-3">{s.title}</h3>
                  <p className="text-soft small mb-0">{s.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-5">
            <button className="bnc-btn bnc-btn-lg" onClick={() => copy(ip, `Đã sao chép IP: ${ip}`)}>
              <BiCopy /> {ip}
            </button>
          </div>
        </div>
      </section>

      {/* ================= SHOP HIGHLIGHT ================= */}
      {products.length > 0 && (
        <section className="bnc-section bnc-section-alt">
          <div className="container">
            <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-5">
              <div>
                <span className="bnc-pill">Cửa hàng</span>
                <h2 className="bnc-heading mb-0">Vật phẩm <span className="highlight">nổi bật</span></h2>
              </div>
              <Link to="/shop" className="bnc-btn bnc-btn-ghost"><BiStore /> Xem tất cả</Link>
            </div>
            <div className="row g-4">
              {products.map((p, i) => (
                <motion.div className="col-6 col-lg-3" key={p.id} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <Link to={`/shop?product=${p.id}`} className="bnc-card bnc-card-hover bnc-product text-white">
                    <div className="bnc-product-media">
                      <img src={p.image_url || '/img/logo.png'} alt={p.name} loading="lazy" />
                    </div>
                    <h3 className="text-truncate">{p.name}</h3>
                    <div className="bnc-price mt-auto">{formatVnd(p.price)}</div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= NEWS ================= */}
      <section className="bnc-section">
        <div className="container">
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-5">
            <div>
              <span className="bnc-pill">Tin tức</span>
              <h2 className="bnc-heading mb-0">Cập nhật & <span className="highlight">sự kiện</span></h2>
            </div>
            <Link to="/news" className="bnc-btn bnc-btn-ghost">Tất cả tin tức <BiRightArrowAlt /></Link>
          </div>
          {latestNews.length === 0 ? (
            <div className="bnc-card bnc-empty">Chưa có bài viết nào.</div>
          ) : (
            <div className="row g-4">
              {latestNews.map((post, i) => (
                <motion.div className="col-md-6 col-lg-4" key={post.id} custom={i} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <Link to={`/news/${post.slug || post.id}`} className="bnc-card bnc-card-hover bnc-post text-white">
                    <div className="bnc-post-img">
                      <img src={post.image || '/img/blog-cover.jpg'} alt={post.title} loading="lazy" />
                      <span className="bnc-post-date"><BiCalendar className="me-1" />{new Date(post.date || post.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                    <div className="bnc-post-body">
                      <h3>{post.title}</h3>
                      <p>{post.description}</p>
                      <span className="bnc-post-link text-accent">Đọc tiếp →</span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="bnc-section pt-0">
        <div className="container">
          <div className="bnc-cta">
            <div className="row align-items-center g-4">
              <div className="col-lg-8">
                <span className="bnc-pill">Cộng đồng</span>
                <h2 className="bnc-heading">Tham gia Discord <span className="highlight">{title}</span></h2>
                <p className="text-soft mb-0">Nhận thông báo sự kiện, giao lưu cùng hàng trăm người chơi và được hỗ trợ nhanh nhất từ đội ngũ quản trị.</p>
              </div>
              <div className="col-lg-4 text-lg-end">
                <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-lg bnc-btn-discord">
                  <FaDiscord size={20} /> Tham gia ngay
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
