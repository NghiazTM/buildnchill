import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BiMenu, BiX, BiUser, BiPlusCircle, BiShield, BiLogOut, BiChevronDown, BiReceipt } from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { formatVnd, mcHead } from '../lib/api';

const NAV = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/shop', label: 'Cửa hàng' },
  { to: '/leaderboard', label: 'Xếp hạng' },
  { to: '/news', label: 'Tin tức' },
  { to: '/rules', label: 'Luật' },
  { to: '/faq', label: 'FAQ' },
  { to: '/about', label: 'Giới thiệu' },
  { to: '/contact', label: 'Liên hệ' },
];

const Navbar = () => {
  const { siteSettings, isAuthenticated, userProfile, loading, logout } = useData();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const title = siteSettings?.site_title || 'BuildnChill';

  return (
    <header className={`bnc-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container position-relative">
        <div className="bnc-nav-inner">
          <Link to="/" className="bnc-brand" aria-label={`${title} - Trang chủ`}>
            <img src="/img/logo.png" alt="" width="48" height="48" />
            <span>

              {title}
            </span>
          </Link>

          <button className="bnc-burger" onClick={() => setOpen((v) => !v)} aria-label="Mở menu" aria-expanded={open}>
            {open ? <BiX size={26} /> : <BiMenu size={26} />}
          </button>

          <div className={`bnc-nav-collapse ${open ? 'open' : ''}`}>
            <ul className="bnc-nav-links">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} end={n.end} className={({ isActive }) => `bnc-nav-link ${isActive ? 'active' : ''}`}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="bnc-nav-actions">
              <a
                className="bnc-btn bnc-btn-discord bnc-btn-sm"
                href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaDiscord size={16} /> <span className="bnc-nav-discord-txt">Discord</span>
              </a>

              {loading ? (
                <div className="spinner-border spinner-border-sm text-primary mx-2" />
              ) : isAuthenticated ? (
                <div className="position-relative" ref={menuRef}>
                  <button className="bnc-user-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
                    <img src={mcHead(userProfile?.username, 64)} alt="" />
                    <span className="text-start">
                      <span className="name d-block">{userProfile?.username || 'Tài khoản'}</span>
                      <span className="bal d-block">{formatVnd(userProfile?.wallet_balance)}</span>
                    </span>
                    <BiChevronDown className={`transition-all ${menu ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {menu && (
                      <motion.div
                        className="bnc-menu"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="bnc-menu-wallet">
                          <div className="text-dim small fw-bold text-uppercase">Số dư ví</div>
                          <div className="fw-black fs-4 text-accent">{formatVnd(userProfile?.wallet_balance)}</div>
                        </div>
                        <Link to="/profile"><BiUser size={18} /> Hồ sơ & đơn hàng</Link>
                        <Link to="/recharge"><BiPlusCircle size={18} /> Nạp tiền vào ví</Link>
                        <Link to="/profile#orders"><BiReceipt size={18} /> Lịch sử mua hàng</Link>
                        {userProfile?.role === 'admin' && (
                          <Link to="/admin"><BiShield size={18} /> Trang quản trị</Link>
                        )}
                        <button className="danger" onClick={handleLogout}><BiLogOut size={18} /> Đăng xuất</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link to="/login" className="bnc-btn bnc-btn-sm">
                  <BiUser size={16} /> Đăng nhập
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
