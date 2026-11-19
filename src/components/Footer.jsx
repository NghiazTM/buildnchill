import { Link } from 'react-router-dom';
import { FaDiscord, FaFacebookF, FaTiktok, FaYoutube } from 'react-icons/fa';
import { BiCopy } from 'react-icons/bi';
import { useData } from '../context/DataContext';
import { useCopy } from './ui';

const Footer = () => {
  const { siteSettings, serverStatus } = useData();
  const copy = useCopy();
  const title = siteSettings?.site_title || 'BuildnChill';
  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const online = serverStatus?.status === 'Online';

  const socials = [
    { icon: FaDiscord, href: siteSettings?.discord_url || 'https://discord.gg/buildnchill', label: 'Discord' },
    siteSettings?.facebook_url && { icon: FaFacebookF, href: siteSettings.facebook_url, label: 'Facebook' },
    siteSettings?.youtube_url && { icon: FaYoutube, href: siteSettings.youtube_url, label: 'YouTube' },
    siteSettings?.tiktok_url && { icon: FaTiktok, href: siteSettings.tiktok_url, label: 'TikTok' },
  ].filter(Boolean);

  return (
    <footer className="bnc-footer">
      <div className="container">
        <div className="row g-4">
          <div className="col-lg-4 col-md-6">
            <Link to="/" className="bnc-brand mb-3">
              <img src="/img/logo.png" alt="" width="48" height="48" />
              <span>{title}</span>
            </Link>
            <p className="text-soft mb-4" style={{ maxWidth: 360 }}>
              Máy chủ Minecraft sinh tồn Việt Nam — xây dựng, khám phá và chill cùng cộng đồng thân thiện mỗi ngày.
            </p>
            <div className="d-flex gap-2">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="bnc-social" aria-label={s.label}>
                  <s.icon size={18} />
                </a>
              ))}
            </div>
          </div>

          <div className="col-lg-2 col-md-3 col-6">
            <h4>Khám phá</h4>
            <ul>
              <li><Link to="/">Trang chủ</Link></li>
              <li><Link to="/about">Giới thiệu</Link></li>
              <li><Link to="/news">Tin tức</Link></li>
              <li><Link to="/leaderboard">Bảng xếp hạng</Link></li>
              <li><Link to="/rules">Luật máy chủ</Link></li>
              <li><Link to="/faq">Câu hỏi thường gặp</Link></li>
            </ul>
          </div>

          <div className="col-lg-2 col-md-3 col-6">
            <h4>Cửa hàng</h4>
            <ul>
              <li><Link to="/shop">Mua vật phẩm</Link></li>
              <li><Link to="/recharge">Nạp tiền vào ví</Link></li>
              <li><Link to="/profile">Lịch sử đơn hàng</Link></li>
              <li><Link to="/contact">Hỗ trợ thanh toán</Link></li>
            </ul>
          </div>

          <div className="col-lg-4 col-md-6">
            <h4>Máy chủ</h4>
            <div className="bnc-card-flat p-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-dim small fw-bold text-uppercase">Trạng thái</span>
                <span className={`fw-bold small ${online ? 'text-success' : 'text-danger'}`}>
                  <span className={`dot ${online ? 'dot-green' : 'dot-red'}`} />
                  {online ? `Online • ${serverStatus?.players || 0} người chơi` : 'Offline'}
                </span>
              </div>
              <div className="d-flex align-items-center justify-content-between gap-2">
                <code className="text-accent fw-bold fs-6 text-truncate">{ip}</code>
                <button className="bnc-btn bnc-btn-sm" onClick={() => copy(ip, 'Đã sao chép IP máy chủ')}>
                  <BiCopy /> Copy IP
                </button>
              </div>
              {siteSettings?.contact_email && (
                <div className="mt-3 small text-soft">
                  Email hỗ trợ: <a href={`mailto:${siteSettings.contact_email}`}>{siteSettings.contact_email}</a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bnc-footer-bottom d-flex flex-column flex-md-row justify-content-between gap-2">
          <span>© {new Date().getFullYear()} <strong className="text-white">{title}</strong>. Không liên kết với Mojang Studios hay Microsoft.</span>
          <span>Phát triển bởi <strong className="text-accent">T-Dev29</strong></span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
