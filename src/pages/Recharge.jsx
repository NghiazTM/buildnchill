import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BiCopy, BiQrScan, BiCheckCircle, BiTime, BiSupport, BiWallet, BiHistory } from 'react-icons/bi';
import { useData } from '../context/DataContext';
import { PageHero, Seo, Spinner, useCopy, useToast } from '../components/ui';
import { formatVnd, mcHead } from '../lib/api';

const PRESETS = [20000, 50000, 100000, 200000, 500000, 1000000];
const MIN = 10000;

const bank = {
  code: import.meta.env.VITE_BANK_CODE || 'MB',
  account: import.meta.env.VITE_BANK_ACCOUNT,
  name: import.meta.env.VITE_BANK_NAME || 'MB Bank',
  holder: import.meta.env.VITE_BANK_ACCOUNT_NAME,
};

const Recharge = () => {
  const navigate = useNavigate();
  const { userProfile, isAuthenticated, authInitialized, user, fetchUserProfile } = useData();
  const copy = useCopy();
  const toast = useToast();
  const [amount, setAmount] = useState(50000);
  const [custom, setCustom] = useState('');
  const [credited, setCredited] = useState(null);
  const baseline = useRef(null);

  useEffect(() => {
    if (authInitialized && !isAuthenticated) navigate('/login');
  }, [authInitialized, isAuthenticated, navigate]);

  // Phát hiện tiền vào: so sánh số dư với lúc mở trang
  const balance = userProfile?.wallet_balance ?? null;
  useEffect(() => {
    if (balance === null) return;
    if (baseline.current === null) { baseline.current = balance; return; }
    if (balance > baseline.current) {
      const diff = balance - baseline.current;
      baseline.current = balance;
      setCredited(diff);
      toast(`Đã cộng ${formatVnd(diff)} vào ví!`, 'success', 5000);
    }
  }, [balance, toast]);

  // Dự phòng khi realtime không hoạt động: kiểm tra số dư mỗi 10 giây
  useEffect(() => {
    if (!user?.id) return undefined;
    const t = setInterval(() => fetchUserProfile(user.id), 10000);
    return () => clearInterval(t);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authInitialized || !userProfile) return <div className="min-vh-100"><Spinner /></div>;

  const value = custom ? Math.round(Number(custom)) : amount;
  const valid = Number.isFinite(value) && value >= MIN;
  const content = `NAP ${userProfile.username}`;
  const qr = `https://img.vietqr.io/image/${bank.code}-${bank.account}-compact2.png?${new URLSearchParams({ amount: String(value), addInfo: content, accountName: bank.holder || '' })}`;

  return (
    <>
      <Seo title="Nạp tiền vào ví" path="/recharge" />
      <PageHero
        pill="Ví website"
        title="Nạp tiền"
        highlight="tự động"
        subtitle="Quét mã QR — tiền được cộng vào ví trong vài giây, dùng để mua mọi vật phẩm chỉ với 1 cú nhấp."
        crumbs={[{ label: 'Nạp tiền' }]}
      />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-7">
              <div className="bnc-card bnc-card-pad h-100">
                <div className="d-flex align-items-center gap-3 mb-4">
                  <img src={mcHead(userProfile.username, 64)} alt="" width="56" height="56" style={{ borderRadius: 10 }} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="text-dim small fw-bold text-uppercase">Tài khoản nhận</div>
                    <div className="fw-black fs-5 text-truncate">{userProfile.username}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-dim small fw-bold text-uppercase">Số dư</div>
                    <div className="fw-black fs-5 text-accent">{formatVnd(balance)}</div>
                  </div>
                </div>

                <label className="bnc-label">Chọn số tiền</label>
                <div className="row g-2 mb-3">
                  {PRESETS.map((p) => (
                    <div className="col-4" key={p}>
                      <button
                        type="button"
                        className={`bnc-tab w-100 ${!custom && amount === p ? 'active' : ''}`}
                        onClick={() => { setAmount(p); setCustom(''); }}
                      >
                        {p >= 1000000 ? `${p / 1000000}M` : `${p / 1000}K`}
                      </button>
                    </div>
                  ))}
                </div>
                <label className="bnc-label" htmlFor="custom-amount">Hoặc nhập số khác (VNĐ)</label>
                <input
                  id="custom-amount"
                  type="number"
                  inputMode="numeric"
                  min={MIN}
                  step={1000}
                  className="bnc-input fs-5 fw-black"
                  placeholder={`Tối thiểu ${formatVnd(MIN)}`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                {custom && !valid && <div className="bnc-error mt-2">Số tiền tối thiểu {formatVnd(MIN)}</div>}

                <hr className="my-4" />

                <div className="row g-4 align-items-center">
                  <div className="col-md-6 text-center">
                    <AnimatePresence mode="wait">
                      {valid && bank.account ? (
                        <motion.div key={value} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                          <div className="bnc-qr"><img src={qr} alt={`QR nạp ${formatVnd(value)}`} /></div>
                          <div className="small text-soft mt-3"><BiQrScan className="me-1" />Quét bằng app ngân hàng bất kỳ</div>
                        </motion.div>
                      ) : (
                        <div className="bnc-card-flat bnc-empty">
                          <BiQrScan size={56} className="mb-2" />
                          <div>{bank.account ? 'Nhập số tiền để tạo mã QR' : 'Chưa cấu hình tài khoản nhận tiền'}</div>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="col-md-6">
                    <div className="text-dim small fw-bold text-uppercase">Nội dung chuyển khoản (bắt buộc)</div>
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <span className="bnc-code-big" style={{ fontSize: '1.35rem', letterSpacing: '.04em' }}>{content}</span>
                      <button className="bnc-copy" onClick={() => copy(content, 'Đã sao chép nội dung')}><BiCopy /></button>
                    </div>
                    <div className="bnc-kv"><span className="k">Số tiền</span><span className="v text-accent">{valid ? formatVnd(value) : '—'}</span></div>
                    <div className="bnc-kv"><span className="k">Ngân hàng</span><span className="v">{bank.name}</span></div>
                    <div className="bnc-kv"><span className="k">Số TK</span><span className="v">{bank.account}<button className="bnc-copy" onClick={() => copy(bank.account, 'Đã sao chép số tài khoản')}><BiCopy /></button></span></div>
                    <div className="bnc-kv"><span className="k">Chủ TK</span><span className="v">{bank.holder}</span></div>
                    <div className="d-flex align-items-center gap-2 mt-3 small text-soft">
                      <span className="bnc-pulse text-accent" /> Đang chờ giao dịch — số dư tự cập nhật.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="bnc-card bnc-card-pad mb-4">
                <div className="fw-black mb-3">Lưu ý khi nạp</div>
                {[
                  { icon: BiTime, t: 'Tự động 24/7', d: 'Tiền vào ví sau khoảng 10–60 giây kể từ khi ngân hàng báo thành công.' },
                  { icon: BiCheckCircle, t: 'Đúng nội dung', d: <>Nội dung phải là <b className="text-accent">{content}</b> để hệ thống nhận diện tài khoản của bạn.</> },
                  { icon: BiWallet, t: 'Dùng cho cửa hàng', d: 'Số dư ví dùng để mua mọi vật phẩm, giao ngay không cần chờ chuyển khoản.' },
                  { icon: BiSupport, t: 'Gặp sự cố?', d: <>Sau 10 phút chưa nhận được tiền, hãy <Link to="/contact">liên hệ hỗ trợ</Link> kèm ảnh biên lai.</> },
                ].map((it) => (
                  <div className="d-flex gap-3 mb-3" key={it.t}>
                    <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 42, height: 42, background: 'var(--bnc-accent-soft)', color: 'var(--bnc-accent)', borderRadius: '.6rem' }}>
                      <it.icon size={22} />
                    </div>
                    <div>
                      <div className="fw-bold">{it.t}</div>
                      <div className="small text-soft">{it.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="d-grid gap-2">
                <Link to="/shop" className="bnc-btn">Đến cửa hàng</Link>
                <Link to="/profile#wallet" className="bnc-btn bnc-btn-dark"><BiHistory /> Lịch sử biến động ví</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {credited && (
          <div className="bnc-overlay" style={{ alignItems: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && setCredited(null)}>
            <motion.div className="bnc-modal text-center" style={{ maxWidth: 420 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bnc-modal-body py-5">
                <BiCheckCircle size={80} className="text-success mb-3" />
                <h3 className="fw-black">Nạp tiền thành công!</h3>
                <p className="text-soft">Đã cộng <b className="text-accent">{formatVnd(credited)}</b> vào ví. Số dư hiện tại: <b className="text-white">{formatVnd(balance)}</b></p>
                <div className="d-grid gap-2 mt-4">
                  <Link to="/shop" className="bnc-btn">Mua sắm ngay</Link>
                  <button className="bnc-btn bnc-btn-dark" onClick={() => setCredited(null)}>Đóng</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Recharge;
