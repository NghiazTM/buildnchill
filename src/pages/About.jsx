import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiRocket, BiGroup, BiBuildings, BiShieldQuarter, BiCopy, BiCube, BiStore } from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { PageHero, SectionTitle, Seo, useCopy } from '../components/ui';
import { FEATURES, HOW_TO_JOIN } from '../data/siteContent';
import '../styles/pages.css';

const ICONS = { BiRocket, BiGroup, BiBuildings, BiShieldQuarter };

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
};

const About = () => {
  const { siteSettings, serverStatus } = useData();
  const copy = useCopy();
  const title = siteSettings?.site_title || 'BuildnChill';
  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const online = serverStatus?.status === 'Online';

  const stats = [
    { v: online ? 'Online' : 'Offline', l: 'Trạng thái', cls: online ? 'text-success' : 'text-danger' },
    { v: `${serverStatus?.players || 0}/${serverStatus?.maxPlayers || 0}`, l: 'Người chơi', cls: 'text-accent' },
    { v: serverStatus?.version || siteSettings?.server_version || '1.21', l: 'Phiên bản', cls: '' },
    { v: '24/7', l: 'Hoạt động', cls: '' },
  ];

  return (
    <>
      <Seo title="Giới thiệu" description={`${title} - máy chủ Minecraft sinh tồn Việt Nam: cộng đồng thân thiện, gameplay mượt mà, sự kiện liên tục.`} path="/about" />
      <PageHero
        pill="Về chúng tôi"
        title={`Về ${title}:`}
        highlight="Xây dựng & Chill"
        subtitle="Một máy chủ Minecraft sinh tồn tâm huyết — nơi bạn xây dựng thế giới riêng, kết bạn và tạo nên những kỷ niệm đáng nhớ."
        crumbs={[{ label: 'Giới thiệu' }]}
      />

      {/* Intro */}
      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row align-items-center g-5">
            <motion.div className="col-lg-7" {...fadeUp}>
              <span className="bnc-pill">Câu chuyện</span>
              <h2 className="bnc-heading">
                Xây dựng thế giới, <span className="highlight">tạo nên kỷ niệm</span>
              </h2>
              <p className="text-soft">
                {title} ra đời từ niềm đam mê Minecraft của một nhóm bạn trẻ Việt Nam. Chúng tôi muốn tạo ra một sân chơi
                sinh tồn công bằng, ổn định và thân thiện — nơi người chơi mới cũng như lâu năm đều tìm thấy niềm vui.
              </p>
              <p className="text-soft">
                Từ những căn nhà gỗ đầu tiên đến các thành phố đồ sộ, mỗi công trình trên máy chủ đều là dấu ấn của cộng
                đồng. Đội ngũ quản trị luôn lắng nghe góp ý để không ngừng cải thiện trải nghiệm.
              </p>
              <div className="d-flex flex-wrap gap-2 mt-4">
                <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-discord">
                  <FaDiscord /> Tham gia Discord
                </a>
                <Link to="/shop" className="bnc-btn bnc-btn-ghost"><BiStore /> Cửa hàng</Link>
              </div>
            </motion.div>
            <motion.div className="col-lg-5 text-center" {...fadeUp}>
              <img src="/img/render-villager.png" alt="" className="bnc-art bnc-art-float" />
            </motion.div>
          </div>

          <div className="row g-3 mt-5">
            {stats.map((s) => (
              <div key={s.l} className="col-6 col-md-3">
                <div className="bnc-feature-box bnc-stat h-100">
                  <div className={`v ${s.cls}`}>{s.v}</div>
                  <div className="l">{s.l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bnc-section bnc-section-alt">
        <div className="container">
          <SectionTitle pill="Điểm nổi bật" title="Vì sao chọn" highlight={title} subtitle="Những điều làm nên trải nghiệm khác biệt tại máy chủ của chúng tôi." />
          <div className="row g-4">
            {FEATURES.map((f, i) => {
              const Icon = ICONS[f.icon] || BiCube;
              return (
                <motion.div key={f.title} className="col-sm-6 col-lg-3" {...fadeUp} transition={{ delay: i * 0.06 }}>
                  <div className="bnc-card bnc-card-hover bnc-card-pad h-100">
                    <span className="bnc-icon-box mb-3"><Icon size={26} /></span>
                    <h3 className="h5 fw-black">{f.title}</h3>
                    <p className="text-soft small mb-0">{f.text}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How to join */}
      <section className="bnc-section">
        <div className="container">
          <div className="row align-items-center g-5">
            <motion.div className="col-lg-4 text-center order-lg-2" {...fadeUp}>
              <img src="/img/render-enderdragon.png" alt="" className="bnc-art bnc-art-float" />
            </motion.div>
            <div className="col-lg-8 order-lg-1">
              <SectionTitle pill="Bắt đầu" title="Tham gia chỉ với" highlight="3 bước" center={false} />
              <div className="d-flex flex-column gap-3">
                {HOW_TO_JOIN.map((s, i) => (
                  <motion.div key={s.title} className="bnc-card bnc-card-hover p-4 d-flex gap-3 align-items-start" {...fadeUp} transition={{ delay: i * 0.08 }}>
                    <span className="bnc-step-num">{i + 1}</span>
                    <div className="min-w-0">
                      <h3 className="h6 fw-black mb-1">{s.title}</h3>
                      <p className="text-soft small mb-0">{s.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="bnc-ip-box">
                <code>{ip}</code>
                <button className="bnc-btn bnc-btn-sm" onClick={() => copy(ip, 'Đã sao chép IP máy chủ')}>
                  <BiCopy /> Copy IP
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bnc-section pt-0">
        <div className="container">
          <motion.div className="bnc-cta" {...fadeUp}>
            <div className="row align-items-center g-4">
              <div className="col-lg-8">
                <h2 className="bnc-heading mt-0">Sẵn sàng cho <span className="highlight">cuộc phiêu lưu</span>?</h2>
                <p className="text-soft mb-0">Vào Discord để nhận thông báo sự kiện, quà tặng và hỗ trợ nhanh nhất từ đội ngũ.</p>
              </div>
              <div className="col-lg-4 d-flex flex-wrap gap-2 justify-content-lg-end">
                <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-discord">
                  <FaDiscord /> Discord
                </a>
                <Link to="/shop" className="bnc-btn">Cửa hàng</Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default About;
