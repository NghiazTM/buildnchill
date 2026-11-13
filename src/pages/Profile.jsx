import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BiPlusCircle, BiLockAlt, BiLogOut, BiX, BiShieldQuarter, BiUser, BiReceipt, BiWallet, BiHistory } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner, StatusBadge, useToast } from '../components/ui';
import { formatVnd, mcBust, ORDER_STATUS } from '../lib/api';

const TX_LABEL = { recharge: 'Nạp tiền', purchase: 'Mua hàng', admin_adjustment: 'Điều chỉnh', refund: 'Hoàn tiền' };
const RC_LABEL = { pending: 'Đang chờ', approved: 'Thành công', rejected: 'Đã huỷ' };

const TABS = [
  { id: 'orders', label: 'Đơn hàng', icon: BiReceipt },
  { id: 'wallet', label: 'Biến động ví', icon: BiWallet },
  { id: 'recharges', label: 'Nạp tiền', icon: BiHistory },
];

const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const Profile = () => {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const toast = useToast();
  const { updatePassword, isAuthenticated, authInitialized, userProfile, logout } = useData();
  const [tab, setTab] = useState(() => (TABS.some((t) => `#${t.id}` === hash) ? hash.slice(1) : 'orders'));
  const [orders, setOrders] = useState([]);
  const [txs, setTxs] = useState([]);
  const [recharges, setRecharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (TABS.some((t) => `#${t.id}` === hash)) setTab(hash.slice(1));
  }, [hash]);

  useEffect(() => {
    if (authInitialized && !isAuthenticated) navigate('/login');
  }, [authInitialized, isAuthenticated, navigate]);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: wallet } = await supabase.from('wallets').select('id').eq('user_id', user.id).maybeSingle();
    const [o, t, r] = await Promise.all([
      supabase.from('orders').select('id, product, price, status, payment_method, payment_code, mc_username, created_at, delivered_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      wallet
        ? supabase.from('wallet_transactions').select('*').eq('wallet_id', wallet.id).order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
      supabase.from('recharges').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setOrders(o.data || []);
    setTxs(t.data || []);
    setRecharges(r.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    load();
    const refresh = () => load();
    window.addEventListener('wallet_updated', refresh);
    window.addEventListener('recharge_updated', refresh);
    window.addEventListener('orders_updated', refresh);
    return () => {
      window.removeEventListener('wallet_updated', refresh);
      window.removeEventListener('recharge_updated', refresh);
      window.removeEventListener('orders_updated', refresh);
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitPw = async (e) => {
    e.preventDefault();
    if (pw.next.length < 6) return toast('Mật khẩu phải có ít nhất 6 ký tự', 'error');
    if (pw.next !== pw.confirm) return toast('Mật khẩu xác nhận không khớp', 'error');
    setPwBusy(true);
    const ok = await updatePassword(pw.next);
    setPwBusy(false);
    if (ok) {
      toast('Đổi mật khẩu thành công', 'success');
      setPwOpen(false);
      setPw({ next: '', confirm: '' });
    } else {
      toast('Đổi mật khẩu thất bại, thử lại sau', 'error');
    }
    return null;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!authInitialized || !userProfile) return <div className="min-vh-100"><Spinner /></div>;

  const spent = orders.filter((o) => ['paid', 'delivered'].includes(o.status)).reduce((s, o) => s + Number(o.price || 0), 0);

  return (
    <>
      <Seo title="Hồ sơ của bạn" />
      <PageHero pill="Tài khoản" title="Xin chào," highlight={userProfile.username} subtitle="Quản lý ví, theo dõi đơn hàng và lịch sử giao dịch." crumbs={[{ label: 'Hồ sơ' }]} />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-4">
              <div className="bnc-card bnc-card-pad text-center" style={{ position: 'sticky', top: 100 }}>
                <img src={mcBust(userProfile.username)} alt="" style={{ width: 120, height: 120, objectFit: 'contain' }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/img/logo.png'; }} />
                <h2 className="h4 fw-black mt-2 mb-2">{userProfile.username}</h2>
                {userProfile.role === 'admin'
                  ? <span className="bnc-status failed"><BiShieldQuarter /> Quản trị viên</span>
                  : <span className="bnc-status pending"><BiUser /> Người chơi</span>}

                <div className="bnc-card-flat p-3 my-4">
                  <div className="text-dim small fw-bold text-uppercase">Số dư ví</div>
                  <div className="fw-black text-accent" style={{ fontSize: '2rem' }}>{formatVnd(userProfile.wallet_balance)}</div>
                  <div className="small text-soft">Đã ủng hộ: <b className="text-white">{formatVnd(spent)}</b></div>
                </div>

                <div className="d-grid gap-2">
                  <Link to="/recharge" className="bnc-btn"><BiPlusCircle /> Nạp tiền vào ví</Link>
                  <Link to="/shop" className="bnc-btn bnc-btn-ghost">Đến cửa hàng</Link>
                  <button className="bnc-btn bnc-btn-dark" onClick={() => setPwOpen(true)}><BiLockAlt /> Đổi mật khẩu</button>
                  <button className="bnc-btn bnc-btn-dark" onClick={handleLogout}><BiLogOut /> Đăng xuất</button>
                </div>
              </div>
            </div>

            <div className="col-lg-8">
              <div className="bnc-tabs mb-4" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} id={t.id} role="tab" aria-selected={tab === t.id} className={`bnc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                    <t.icon className="me-1" /> {t.label}
                  </button>
                ))}
              </div>

              <div className="bnc-card bnc-card-pad">
                {loading ? <Spinner /> : (
                  <>
                    {tab === 'orders' && (
                      orders.length === 0 ? (
                        <div className="bnc-empty">Bạn chưa có đơn hàng nào. <Link to="/shop">Mua sắm ngay →</Link></div>
                      ) : (
                        <div className="d-flex flex-column gap-2">
                          {orders.map((o) => (
                            <Link to={`/shop/order/${o.id}`} key={o.id} className="bnc-card-flat p-3 d-flex flex-wrap align-items-center gap-3 text-white bnc-card-hover">
                              <div className="flex-grow-1 min-w-0">
                                <div className="fw-black text-truncate">{o.product}</div>
                                <div className="small text-dim">
                                  {o.payment_code || o.id.slice(0, 8).toUpperCase()} • {o.mc_username} • {fmt(o.created_at)} • {o.payment_method === 'wallet' ? 'Ví' : 'Chuyển khoản'}
                                </div>
                              </div>
                              <div className="fw-black text-accent">{formatVnd(o.price)}</div>
                              <StatusBadge status={o.status} label={ORDER_STATUS[o.status] || o.status} pulse={['pending', 'paid'].includes(o.status)} />
                            </Link>
                          ))}
                        </div>
                      )
                    )}

                    {tab === 'wallet' && (
                      <div className="table-responsive">
                        <table className="table align-middle mb-0">
                          <thead><tr><th className="text-dim small">Thời gian</th><th className="text-dim small">Loại</th><th className="text-dim small text-end">Số tiền</th><th className="text-dim small d-none d-md-table-cell">Ghi chú</th></tr></thead>
                          <tbody>
                            {txs.map((t) => (
                              <tr key={t.id}>
                                <td className="small text-soft">{fmt(t.created_at)}</td>
                                <td><StatusBadge status={t.amount > 0 ? 'delivered' : 'failed'} label={TX_LABEL[t.type] || t.type} /></td>
                                <td className={`text-end fw-black ${t.amount > 0 ? 'text-success' : 'text-danger'}`}>{t.amount > 0 ? '+' : ''}{formatVnd(t.amount)}</td>
                                <td className="small text-soft d-none d-md-table-cell">{t.note}</td>
                              </tr>
                            ))}
                            {txs.length === 0 && <tr><td colSpan="4" className="bnc-empty">Chưa có giao dịch nào.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {tab === 'recharges' && (
                      <div className="table-responsive">
                        <table className="table align-middle mb-0">
                          <thead><tr><th className="text-dim small">Thời gian</th><th className="text-dim small">Phương thức</th><th className="text-dim small text-end">Số tiền</th><th className="text-dim small text-end">Trạng thái</th></tr></thead>
                          <tbody>
                            {recharges.map((r) => (
                              <tr key={r.id}>
                                <td className="small text-soft">{fmt(r.created_at)}</td>
                                <td className="small">{r.payment_method}</td>
                                <td className="text-end fw-black text-accent">{formatVnd(r.amount)}</td>
                                <td className="text-end"><StatusBadge status={r.status} label={RC_LABEL[r.status] || r.status} /></td>
                              </tr>
                            ))}
                            {recharges.length === 0 && <tr><td colSpan="4" className="bnc-empty">Chưa có lần nạp nào. <Link to="/recharge">Nạp ngay →</Link></td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {pwOpen && (
          <div className="bnc-overlay" style={{ alignItems: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && setPwOpen(false)}>
            <motion.div className="bnc-modal" style={{ maxWidth: 440 }} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bnc-modal-head">
                <h3>Đổi mật khẩu</h3>
                <button className="bnc-x" onClick={() => setPwOpen(false)} aria-label="Đóng"><BiX size={22} /></button>
              </div>
              <form className="bnc-modal-body d-grid gap-3" onSubmit={submitPw}>
                <div>
                  <label className="bnc-label" htmlFor="pw-new">Mật khẩu mới</label>
                  <input id="pw-new" type="password" className="bnc-input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="Ít nhất 6 ký tự" autoComplete="new-password" required />
                </div>
                <div>
                  <label className="bnc-label" htmlFor="pw-confirm">Xác nhận mật khẩu</label>
                  <input id="pw-confirm" type="password" className="bnc-input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
                </div>
                <button type="submit" className="bnc-btn bnc-btn-block" disabled={pwBusy}>{pwBusy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Profile;
