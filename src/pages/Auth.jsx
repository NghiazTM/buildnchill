import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { BiShow, BiHide, BiLogIn, BiUserPlus } from 'react-icons/bi';
import { useData } from '../context/DataContext';
import { Seo, useToast } from '../components/ui';
import { mcHead } from '../lib/api';
import '../styles/pages.css';

const Auth = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { login, register } = useData();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ username: '', password: '' });

  const switchMode = (reg) => {
    setIsRegister(reg);
    setError('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');

    const username = formData.username.trim();
    if (!username || username.includes(' ')) {
      setError('Tên nhân vật không được để trống và không chứa khoảng trắng!');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const success = await register(username, formData.password);
        if (!success) throw new Error('Đăng ký thất bại. Tên nhân vật có thể đã tồn tại.');
        toast(`Đăng ký thành công! Chào mừng ${username}`, 'success');
        navigate('/');
      } else {
        const success = await login(username, formData.password);
        if (!success) throw new Error('Tên nhân vật hoặc mật khẩu không chính xác!');
        toast(`Chào mừng trở lại, ${username}!`, 'success');
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const previewName = formData.username.trim() || 'Steve';

  return (
    <section className="bnc-auth-wrap">
      <Seo title={isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập'} description="Đăng nhập tài khoản BuildnChill để nạp ví, mua vật phẩm và theo dõi đơn hàng." path="/login" />
      <div className="container">
        <motion.div
          className="bnc-auth-card bnc-card overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="bnc-auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!isRegister} className={`bnc-auth-tab ${!isRegister ? 'active' : ''}`} onClick={() => switchMode(false)}>
              Đăng nhập
            </button>
            <button type="button" role="tab" aria-selected={isRegister} className={`bnc-auth-tab ${isRegister ? 'active' : ''}`} onClick={() => switchMode(true)}>
              Đăng ký
            </button>
          </div>

          <div className="bnc-card-pad">
            <div className="text-center mb-4">
              <img src={mcHead(previewName, 128)} alt="" className="bnc-head-preview mb-3" />
              <h1 className="h3 fw-black mb-1">
                {isRegister ? <>Tạo tài khoản <span className="highlight">mới</span></> : <>Chào mừng <span className="highlight">trở lại</span></>}
              </h1>
              <p className="text-soft small mb-0">
                {isRegister ? 'Dùng đúng tên nhân vật trong game để nhận vật phẩm.' : 'Đăng nhập để nạp ví, mua hàng và xem lịch sử đơn.'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="d-flex flex-column gap-3" noValidate>
              <div>
                <label className="bnc-label" htmlFor="auth-username">Tên nhân vật Minecraft (IGN)</label>
                <input
                  id="auth-username"
                  type="text"
                  className="bnc-input"
                  required
                  autoComplete="username"
                  placeholder="VD: Steve_123"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <div className="bnc-help">Tên này dùng để nhận quà và vật phẩm trong game.</div>
              </div>

              <div>
                <label className="bnc-label" htmlFor="auth-password">Mật khẩu</label>
                <div className="bnc-pass">
                  <input
                    id="auth-password"
                    type={showPass ? 'text' : 'password'}
                    className="bnc-input"
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    {showPass ? <BiHide size={20} /> : <BiShow size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="bnc-error" role="alert">{error}</div>}

              <button className="bnc-btn bnc-btn-block bnc-btn-lg mt-2" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm" /> : isRegister ? <BiUserPlus size={20} /> : <BiLogIn size={20} />}
                {isRegister ? 'Đăng ký ngay' : 'Đăng nhập'}
              </button>
            </form>

            <div className="text-center mt-4 small text-soft">
              {isRegister ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
              <button type="button" className="btn btn-link p-0 fw-bold text-accent text-decoration-none align-baseline" onClick={() => switchMode(!isRegister)}>
                {isRegister ? 'Đăng nhập' : 'Đăng ký ngay'}
              </button>
              <div className="mt-2">
                Cần hỗ trợ? <Link to="/contact">Liên hệ Admin</Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Auth;
