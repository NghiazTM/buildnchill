import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BiRocket, BiGroup, BiBuildings, BiShieldQuarter, BiCopy, BiRightArrowAlt, BiStore, BiCheck,
} from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { supabase } from '../supabaseClient';
import { Seo, useCopy } from '../components/ui';
import { formatVnd, mcHead, plainText } from '../lib/api';
import { FEATURES, HOW_TO_JOIN } from '../data/siteContent';

const ICONS = { BiRocket, BiGroup, BiBuildings, BiShieldQuarter };

const reveal = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut', delay: i * 0.06 } }),
};
const inView = { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-60px' }, variants: reveal };

const timeAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
};

const Eyebrow = ({ index, children }) => (
  <div className="bnc-eyebrow">{index && <span className="idx">{index}</span>}{children}</div>
);

const Home = () => {
  const { news, serverStatus, siteSettings, carouselImages } = useData();
  const copy = useCopy();
  const [recent, setRecent] = useState([]);
  const [products, setProducts] = useState([]);
  const [copied, setCopied] = useState(false);

  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const title = siteSettings?.site_title || 'BuildnChill';
  const online = serverStatus?.status === 'Online';
  const version = serverStatus?.version || siteSettings?.server_version || '1.21';
  const players = Number(serverStatus?.players || 0);
  const maxPlayers = Number(serverStatus?.maxPlayers || serverStatus?.max_players || 0);
  const discord = siteSettings?.discord_url || 'https://discord.gg/buildnchill';
  const gallery = (carouselImages || []).filter((i) => i.is_active !== false && i.image_url);

  useEffect(() => {
    let alive = true;
    supabase.rpc('bnc_recent_purchases', { p_limit: 5 }).then(({ data }) => alive && data && setRecent(data));
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

  const copyIp = () => {
    copy(ip, `Đã sao chép IP: ${ip}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

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
            <motion.div className="col-lg-6" initial="hidden" animate="show" variants={reveal}>
              <Eyebrow>Máy chủ Minecraft sinh tồn · Việt Nam</Eyebrow>
              <h1>
                Sinh tồn cùng bạn bè.
                <span className="muted"> Xây nên những điều đáng nhớ.</span>
              </h1>
              <p className="lead-text">
                {title} là thế giới sinh tồn ổn định, công bằng và thân thiện — nơi bạn dựng nhà, lập làng
                và cùng cộng đồng viết tiếp câu chuyện của riêng mình.
              </p>

              <div className="d-flex flex-wrap gap-2 mt-4">
                <button className="bnc-btn bnc-btn-lg" onClick={copyIp}>
                  {copied ? <BiCheck size={18} /> : <BiCopy size={18} />} Sao chép IP
                </button>
                <Link to="/shop" className="bnc-btn bnc-btn-lg bnc-btn-ghost">
                  Cửa hàng <BiRightArrowAlt size={18} />
                </Link>
              </div>

              <dl className="bnc-hero-meta">
                <div><dt>Phiên bản</dt><dd>{version}</dd></div>
                <div><dt>Trạng thái</dt><dd><span className={`dot ${online ? 'dot-green' : 'dot-red'}`} />{online ? 'Online' : 'Bảo trì'}</dd></div>
                <div><dt>Giao hàng</dt><dd>Tự động 24/7</dd></div>
              </dl>
            </motion.div>

            <motion.div className="col-lg-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
              <div className="bnc-console">
                <div className="bnc-console-head">
                  <img src="/img/logo.png" alt="" width="36" height="36" />
                  <div className="min-w-0">
                    <div className="name">{title}</div>
                    <div className="sub">Java Edition · {version}</div>
                  </div>
                  <span className={`bnc-live ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Bảo trì'}</span>
                </div>

                <button type="button" className="bnc-console-ip" onClick={copyIp} aria-label="Sao chép địa chỉ máy chủ">
                  <span className="lbl">Địa chỉ máy chủ</span>
                  <span className="val">{ip}</span>
                  <span className="act">{copied ? <><BiCheck /> <span className="t">Đã chép</span></> : <><BiCopy /> <span className="t">Sao chép</span></>}</span>
                </button>

                <div className="bnc-console-stats">
                  <div>
                    <span className="k">Người chơi</span>
                    <span className="v">{online ? players : '—'}{online && maxPlayers > 0 && <small> / {maxPlayers}</small>}</span>
                  </div>
                  <div>
                    <span className="k">Phiên bản</span>
                    <span className="v">{version}</span>
                  </div>
                  <div>
                    <span className="k">Thanh toán</span>
                    <span className="v">VietQR · Ví</span>
                  </div>
                </div>

                <div className="bnc-console-feed">
                  <div className="feed-head">
                    <span>Giao dịch gần đây</span>
                    <Link to="/shop">Cửa hàng <BiRightArrowAlt /></Link>
                  </div>
                  {recent.length === 0 ? (
                    <div className="feed-empty">Chưa có giao dịch nào — hãy là người đầu tiên.</div>
                  ) : (
                    <ul>
                      {recent.slice(0, 5).map((r, i) => (
                        <li key={`${r.mc_username}-${i}`}>
                          <img src={mcHead(r.mc_username, 32)} alt="" loading="lazy" width="24" height="24" />
                          <span className="who">{r.mc_username}</span>
                          <span className="what">{r.product}</span>
                          <span className="when">{timeAgo(r.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section className="bnc-section" id="about-us">
        <div className="container">
          <div className="row align-items-center g-5">
            <motion.div className="col-lg-6" {...inView}>
              <Eyebrow index="01">Về {title}</Eyebrow>
              <h2 className="bnc-heading">Một máy chủ được vận hành nghiêm túc, cho những người chơi yêu sinh tồn.</h2>
              <p className="bnc-sub">
                Chúng tôi giữ trải nghiệm thuần sinh tồn, bổ sung vừa đủ plugin để mọi thứ công bằng và dễ chịu:
                bảo vệ đất, kinh tế người chơi, sự kiện định kỳ và đội ngũ hỗ trợ luôn có mặt.
              </p>
              <div className="d-flex flex-wrap gap-2 mt-4">
                <Link to="/about" className="bnc-btn bnc-btn-ghost">Tìm hiểu thêm <BiRightArrowAlt /></Link>
                <Link to="/rules" className="bnc-btn bnc-btn-text">Luật máy chủ <BiRightArrowAlt /></Link>
              </div>
            </motion.div>
            <motion.div className="col-lg-6" {...inView} custom={1}>
              <figure className="bnc-frame">
                <img src={gallery[0]?.image_url || '/img/banner-christmas.jpg'} alt={`Thế giới ${title}`} loading="lazy" />
              </figure>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="bnc-section bnc-section-line">
        <div className="container">
          <div className="row g-4 align-items-end mb-5">
            <div className="col-lg-7">
              <Eyebrow index="02">Trải nghiệm</Eyebrow>
              <h2 className="bnc-heading mb-0">Mọi thứ bạn cần cho một hành trình sinh tồn trọn vẹn.</h2>
            </div>
          </div>
          <div className="bnc-feature-grid">
            {FEATURES.map((f, i) => {
              const Icon = ICONS[f.icon] || BiRocket;
              return (
                <motion.div className="bnc-feature" key={f.title} custom={i} {...inView}>
                  <Icon size={22} className="ico" />
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= HOW TO JOIN ================= */}
      <section className="bnc-section bnc-section-line">
        <div className="container">
          <div className="row g-5">
            <div className="col-lg-4">
              <Eyebrow index="03">Bắt đầu</Eyebrow>
              <h2 className="bnc-heading">Vào máy chủ trong ba bước.</h2>
              <p className="bnc-sub mb-4">Không cần mod, không cần cài thêm gì — chỉ cần Minecraft Java.</p>
              <button type="button" className="bnc-ip-inline" onClick={copyIp}>
                <span className="val">{ip}</span>
                <span className="act">{copied ? <BiCheck /> : <BiCopy />}</span>
              </button>
            </div>
            <div className="col-lg-8">
              <ol className="bnc-steps-list">
                {HOW_TO_JOIN.map((s, i) => (
                  <motion.li key={s.title} custom={i} {...inView}>
                    <span className="n">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SHOP HIGHLIGHT ================= */}
      {products.length > 0 && (
        <section className="bnc-section bnc-section-line">
          <div className="container">
            <div className="bnc-section-head">
              <div>
                <Eyebrow index="04">Cửa hàng</Eyebrow>
                <h2 className="bnc-heading mb-0">Vật phẩm nổi bật</h2>
              </div>
              <Link to="/shop" className="bnc-btn bnc-btn-ghost"><BiStore /> Xem tất cả</Link>
            </div>
            <div className="row g-3 g-lg-4">
              {products.map((p, i) => (
                <motion.div className="col-6 col-lg-3" key={p.id} custom={i} {...inView}>
                  <Link to={`/shop?product=${p.id}`} className="bnc-card bnc-card-hover bnc-product text-white">
                    <div className="bnc-product-media">
                      <img src={p.image_url || '/img/logo.png'} alt={p.name} loading="lazy" />
                    </div>
                    <h3 className="text-truncate">{p.name}</h3>
                    {plainText(p.description) && <div className="desc">{plainText(p.description)}</div>}
                    <div className="d-flex align-items-center justify-content-between mt-auto pt-2">
                      <span className="bnc-price">{formatVnd(p.price)}</span>
                      <BiRightArrowAlt className="text-dim" size={20} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= NEWS ================= */}
      <section className="bnc-section bnc-section-line">
        <div className="container">
          <div className="bnc-section-head">
            <div>
              <Eyebrow index={products.length > 0 ? '05' : '04'}>Tin tức</Eyebrow>
              <h2 className="bnc-heading mb-0">Cập nhật & sự kiện</h2>
            </div>
            <Link to="/news" className="bnc-btn bnc-btn-ghost">Tất cả tin tức <BiRightArrowAlt /></Link>
          </div>
          {latestNews.length === 0 ? (
            <div className="bnc-card bnc-empty">Chưa có bài viết nào.</div>
          ) : (
            <div className="row g-3 g-lg-4">
              {latestNews.map((post, i) => (
                <motion.div className="col-md-6 col-lg-4" key={post.id} custom={i} {...inView}>
                  <Link to={`/news/${post.slug || post.id}`} className="bnc-card bnc-card-hover bnc-post text-white">
                    <div className="bnc-post-img">
                      <img src={post.image || '/img/blog-cover.jpg'} alt={post.title} loading="lazy" />
                    </div>
                    <div className="bnc-post-body">
                      <div className="bnc-post-meta">{new Date(post.date || post.created_at).toLocaleDateString('vi-VN')}</div>
                      <h3>{post.title}</h3>
                      <p>{post.description}</p>
                      <span className="bnc-post-link">Đọc tiếp <BiRightArrowAlt /></span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= GALLERY (ảnh do admin quản lý) ================= */}
      {gallery.length > 1 && (
        <section className="bnc-section bnc-section-line">
          <div className="container">
            <div className="bnc-section-head">
              <div>
                <Eyebrow>Thư viện</Eyebrow>
                <h2 className="bnc-heading mb-0">Khoảnh khắc trong game</h2>
              </div>
            </div>
            <div className="bnc-gallery">
              {gallery.slice(0, 6).map((g, i) => (
                <motion.figure key={g.id || g.image_url} className="bnc-frame" custom={i} {...inView}>
                  <img src={g.image_url} alt={`Ảnh trong game ${i + 1}`} loading="lazy" />
                </motion.figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= CTA ================= */}
      <section className="bnc-section pt-0">
        <div className="container">
          <div className="bnc-cta">
            <div>
              <h2>Tham gia cộng đồng {title}</h2>
              <p>Thông báo sự kiện, hỗ trợ nhanh từ đội ngũ quản trị và hàng trăm người chơi đang chờ bạn trên Discord.</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <a href={discord} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-lg">
                <FaDiscord size={18} /> Vào Discord
              </a>
              <button type="button" className="bnc-btn bnc-btn-lg bnc-btn-ghost" onClick={copyIp}>
                <BiCopy size={18} /> {ip}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
