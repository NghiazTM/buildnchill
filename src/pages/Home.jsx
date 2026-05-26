import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { BiCalendar, BiTime, BiChevronLeft, BiChevronRight, BiRocket, BiStar, BiTargetLock, BiMap } from 'react-icons/bi';
import SummerEffect from '../components/SummerEffect';
import '../styles/carousel.css';
import '../styles/summer-theme.css';

const Home = () => {
  const { news, serverStatus, siteSettings, carouselImages: dbCarouselImages } = useData();
  const [currentSlide, setCurrentSlide] = useState(0);

  const latestNews = news.slice(0, 3);

  const siteTitle = siteSettings?.site_title || 'BuildnChill';
  const serverIp = siteSettings?.server_ip || 'buildnchill.id.vn';

  // Sử dụng ảnh từ database nếu có, ngược lại dùng ảnh mặc định
  const carouselImages = dbCarouselImages && dbCarouselImages.length > 0
    ? dbCarouselImages.filter(img => img.is_active).map(img => img.image_url)
    : [
      'https://media.discordapp.net/attachments/1318780761880658030/1467738661251580092/image.png?ex=698179a6&is=69802826&hm=ac1c46e7d28ebd7744c810b1e59f59e59eb24d55975d76d2627a642c0a2d117f&=&format=webp&quality=lossless',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1353&q=80',
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'
    ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [carouselImages.length]);

  const features = [
    { icon: BiRocket, title: 'Tốc Độ Vượt Trội', description: 'Máy chủ cấu hình mạnh, giảm thiểu giật lag tối đa cho trải nghiệm mượt mà.' },
    { icon: BiStar, title: 'Cộng Đồng Chất Lượng', description: 'Giao lưu cùng những người chơi văn minh, năng động và đầy sáng tạo.' },
    { icon: BiMap, title: 'Thế Giới Rộng Lớn', description: 'Khám phá những hòn đảo bí ẩn và vùng biển vô tận trong mùa hè này.' }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.2 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <div className="shop-summer-container min-vh-100">
      <Helmet>
        <title>BuildnChill - Server Minecraft Sinh Tồn Việt Nam 1.21.11</title>
        <meta name="description" content="BuildnChill là máy chủ Minecraft Sinh Tồn Việt Nam 1.21.11 với trải nghiệm xây dựng, cày cuốc, chill cùng cộng đồng thân thiện. Gameplay mượt mà, không lag." />
      </Helmet>

      <SummerEffect />

      {/* Hero Section */}
      <section className="hero-carousel position-relative overflow-hidden shadow-2xl">
        <div className="carousel-container h-100">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              className="carousel-slide h-100"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.3))', zIndex: 1 }}></div>
              <img src={carouselImages[currentSlide]} alt={`BuildnChill Minecraft Server Việt Nam - Slide ${currentSlide + 1}`} className="carousel-image h-100" />

              <div className="position-absolute top-50 start-50 translate-middle text-center text-white w-100 px-3 mt-4" style={{ zIndex: 2 }}>
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                >
                  <div className="badge bg-info bg-opacity-90 text-white px-4 py-2 rounded-pill mb-4 shadow-lg fw-black tracking-widest">
                    <BiStar className="me-2" /> NEW SEASON: OCEAN ADVENTURE - MINECRAFT 1.21.11
                  </div>
                  <h1
                    className="display-1 fw-black text-white text-uppercase mb-4"
                    style={{ textShadow: '0 10px 30px rgba(0,0,0,0.6)', letterSpacing: '-2px' }}
                  >
                    BuildnChill Minecraft Việt Nam
                  </h1>
                  <p
                    className="h3 fw-bold mb-5 opacity-100"
                    style={{ textShadow: '0 2px 15px rgba(0,0,0,0.5)' }}
                  >
                    Server Minecraft Sinh Tồn cày cuốc hàng đầu tại: <span className="text-info user-select-all px-3 py-1 rounded-pill" style={{ backgroundColor: 'var(--bg-card)' }}>{serverIp}</span>
                  </p>
                  <div className="d-flex flex-wrap justify-content-center gap-4">
                    <Link to="/shop" className="summer-button w-auto px-5 py-3 h5 m-0 shadow-2xl">VÀO CỬA HÀNG NGAY 🛒</Link>
                    <a href={siteSettings?.discord_url} target="_blank" className="summer-button-outline text-white border-3 w-auto px-5 py-3 h5 m-0" style={{ background: 'rgba(255,255,255,0.2)', borderColor: '#FFFFFF' }}>THAM GIA DISCORD 💬</a>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Floating elements for Hero */}
        <div className="summer-item dolphin" style={{ top: '20%', right: '5%', zIndex: 3 }}>🐬</div>
        <div className="summer-item" style={{ bottom: '10%', left: '5%', fontSize: '60px', zIndex: 3 }}>⛱️</div>

        <button className="carousel-btn carousel-btn-prev d-none d-md-flex" onClick={() => setCurrentSlide((prev) => (prev - 1 + carouselImages.length) % carouselImages.length)}>
          <BiChevronLeft size={50} />
        </button>
        <button className="carousel-btn carousel-btn-next d-none d-md-flex" onClick={() => setCurrentSlide((prev) => (prev + 1) % carouselImages.length)}>
          <BiChevronRight size={50} />
        </button>
      </section>

      <div className="container py-5 position-relative" style={{ zIndex: 10 }}>
        {/* Features Section */}
        <motion.section className="py-5" variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="text-center mb-5">
            <h2 className="summer-title display-4">🌊 TRẢI NGHIỆM ĐỈNH CAO 🌊</h2>
            <p className="fw-bold text-primary">Tại sao bạn nên chọn BuildnChill trong mùa hè này?</p>
          </div>
          <div className="row g-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div key={index} className="col-md-4" variants={itemVariants} whileHover={{ y: -20 }}>
                  <div className="summer-glass p-5 text-center h-100 border-0 shadow-xl" style={{ backgroundColor: 'var(--bg-card)' }}>
                    <div className="d-inline-flex p-4 rounded-4 bg-info bg-opacity-10 text-info mb-4 shadow-sm">
                      <Icon size={60} />
                    </div>
                    <h3 className="fw-black mb-3">{feature.title}</h3>
                    <p className="fw-bold text-muted mb-0 leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* News Section */}
        <motion.section className="py-5" variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="d-flex justify-content-between align-items-end mb-5 border-bottom border-info border-opacity-20 pb-4">
            <div>
              <h2 className="summer-title m-0">TIN TỨC SỰ KIỆN</h2>
              <p className="fw-bold text-primary m-0">Cập nhật những hoạt động mới nhất từ Server</p>
            </div>
            <Link to="/news" className="summer-button-outline w-auto px-4 py-2 small d-none d-md-block">XEM TẤT CẢ →</Link>
          </div>
          <div className="row g-4">
            {latestNews.map((post) => (
              <motion.div key={post.id} className="col-md-4" variants={itemVariants} whileHover={{ y: -10 }}>
                <div className="summer-glass h-100 shadow-2xl border-0 overflow-hidden p-0" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <div className="overflow-hidden position-relative" style={{ height: '220px' }}>
                    <img src={post.image} className="w-100 h-100 object-fit-cover transition-all duration-500 hover-scale" alt={post.title} />
                    <div className="position-absolute top-0 start-0 m-3 badge bg-info px-3 py-2 shadow-sm">
                      <BiCalendar className="me-1" /> {new Date(post.date).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                  <div className="p-4">
                    <h5 className="fw-black mb-3 text-truncate-2" style={{ height: '3.2rem', lineHeight: '1.6' }}>{post.title}</h5>
                    <p className="fw-bold text-muted mb-4 text-truncate-3 opacity-80" style={{ fontSize: '0.9rem' }}>{post.description}</p>
                    <Link to={`/news/${post.id}`} className="summer-button w-100 py-2">XEM CHI TIẾT 📖</Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Server Status Section */}
        <motion.section initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="py-5">
          <div className="server-status-card summer-glass p-5 overflow-hidden shadow-2xl border-0">
            <div className="mb-4 text-center">
              <h2 className="summer-title mb-2">TRẠNG THÁI MÁY CHỦ</h2>
              <p className="text-muted mb-0">Cập nhật nhanh tình trạng server, số người chơi và IP kết nối.</p>
            </div>
            <div className="server-status-grid">
              <div className="server-status-item p-4 rounded-4 shadow-sm">
                <div className="server-status-label">TRẠNG THÁI</div>
                <div className={`server-status-value ${serverStatus?.status === 'Online' ? 'text-success' : 'text-danger'}`}>
                  {serverStatus?.status === 'Online' ? 'Online' : 'Offline'}
                </div>
              </div>
              <div className="server-status-item p-4 rounded-4 shadow-sm">
                <div className="server-status-label">NGƯỜI CHƠI</div>
                <div className="d-flex align-items-baseline gap-2 flex-nowrap">
                  <div className="server-status-value text-info">{serverStatus?.players || 0}</div>
                  <div className="server-status-meta">/ {serverStatus?.maxPlayers || 0} chỗ</div>
                </div>
              </div>
              <div className="server-status-item p-4 rounded-4 shadow-sm">
                <div className="server-status-label">PHIÊN BẢN</div>
                <div className="server-status-value text-primary">{serverStatus?.version || siteSettings?.server_version || '1.20.4'}</div>
              </div>
            </div>
            <div className="server-status-ip mt-5 mx-auto d-flex align-items-center justify-content-between gap-3 rounded-pill p-3 shadow-sm">
              <div>
                <div className="small text-muted mb-1">Kết nối</div>
                <strong className="h5 text-info user-select-all m-0">{serverIp}</strong>
              </div>
              <button className="btn btn-sm btn-info text-white rounded-pill px-4 fw-bold" onClick={() => { navigator.clipboard.writeText(serverIp); alert('Đã copy IP!'); }}>COPY IP</button>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Decorative footer elements */}
      <div className="text-center py-5 opacity-50 overflow-hidden w-100">
        <div className="d-flex justify-content-center gap-5">
          <span className="summer-item-static" style={{ fontSize: '40px' }}>🐬</span>
          <span className="summer-item-static" style={{ fontSize: '40px' }}>🐚</span>
          <span className="summer-item-static" style={{ fontSize: '40px' }}>🏖️</span>
          <span className="summer-item-static" style={{ fontSize: '40px' }}>🦀</span>
          <span className="summer-item-static" style={{ fontSize: '40px' }}>🐳</span>
        </div>
      </div>
    </div>
  );
};

export default Home;
