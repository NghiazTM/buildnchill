import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BiSearch, BiWallet, BiQrScan, BiCrown, BiX, BiPlusCircle, BiBoltCircle, BiShieldQuarter, BiPackage, BiRightArrowAlt,
} from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { PageHero, Seo, useToast } from '../components/ui';
import OrderTracker from '../components/OrderTracker';
import { api, formatVnd, mcHead, plainText } from '../lib/api';

const LAST_ORDER_KEY = 'bnc_last_order';
const MC_NAME = /^[.*]?[A-Za-z0-9_]{3,16}$/;

const readLastOrder = () => {
  try { return JSON.parse(localStorage.getItem(LAST_ORDER_KEY) || 'null'); } catch { return null; }
};
const saveLastOrder = (o) => {
  try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(o)); } catch { /* ignore */ }
};

/* ================= Checkout modal ================= */
const Checkout = ({ product, onClose }) => {
  const { isAuthenticated, userProfile, fetchUserProfile, user } = useData();
  const toast = useToast();
  const [ign, setIgn] = useState(() => userProfile?.username || localStorage.getItem('bnc_ign') || '');
  const [method, setMethod] = useState(isAuthenticated && (userProfile?.wallet_balance || 0) >= product.price ? 'wallet' : 'bank');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { order, bank }

  const balance = userProfile?.wallet_balance || 0;
  const enough = balance >= Number(product.price);
  const validIgn = MC_NAME.test(ign.trim());

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validIgn) { setErr('Tên nhân vật không hợp lệ (3–16 ký tự: chữ, số, dấu _).'); return; }
    if (method === 'wallet' && !isAuthenticated) { setErr('Bạn cần đăng nhập để thanh toán bằng ví.'); return; }
    setBusy(true);
    try {
      const name = ign.trim();
      localStorage.setItem('bnc_ign', name);
      const res = await api('shop-checkout', { method: 'POST', body: { product_id: product.id, mc_username: name, method } });
      setResult(res);
      saveLastOrder({ id: res.order.id, product: product.name, at: Date.now() });
      if (method === 'wallet') {
        toast('Thanh toán bằng ví thành công!', 'success');
        if (user?.id) fetchUserProfile(user.id);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bnc-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <motion.div className="bnc-modal" style={{ maxWidth: result ? 760 : 560 }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} role="dialog" aria-modal="true">
        <div className="bnc-modal-head">
          <h3>{result ? (result.method === 'wallet' ? 'Đơn hàng của bạn' : 'Thanh toán đơn hàng') : 'Xác nhận mua hàng'}</h3>
          <button className="bnc-x" onClick={onClose} aria-label="Đóng"><BiX size={22} /></button>
        </div>
        <div className="bnc-modal-body">
          {result ? (
            <>
              <OrderTracker orderId={result.order.id} initialOrder={result.order} initialBank={result.bank} />
              <div className="d-flex gap-2 justify-content-center mt-4 flex-wrap">
                <button className="bnc-btn bnc-btn-dark bnc-btn-sm" onClick={onClose}>Tiếp tục mua sắm</button>
                {isAuthenticated && <Link to="/profile#orders" className="bnc-btn bnc-btn-ghost bnc-btn-sm">Lịch sử đơn hàng</Link>}
              </div>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="d-flex gap-3 align-items-center bnc-card-flat p-3 mb-4">
                <div className="bnc-product-media mb-0" style={{ width: 84, height: 84, flexShrink: 0, padding: '.5rem' }}>
                  <img src={product.image_url || '/img/logo.png'} alt="" />
                </div>
                <div className="min-w-0">
                  <div className="fw-black">{product.name}</div>
                  <div className="bnc-price">{formatVnd(product.price)}</div>
                </div>
              </div>

              <label className="bnc-label" htmlFor="ign">Tên nhân vật nhận hàng</label>
              <div className="d-flex gap-2 align-items-center">
                <img src={mcHead(validIgn ? ign.trim() : 'Steve', 64)} alt="" width="46" height="46" style={{ borderRadius: 8, flexShrink: 0, background: 'var(--bnc-surface-3)' }} />
                <input id="ign" className="bnc-input" value={ign} onChange={(e) => setIgn(e.target.value)} placeholder="Ví dụ: Steve_123" autoComplete="off" maxLength={17} required />
              </div>
              <div className="bnc-help">Nhập đúng tên trong game. Vật phẩm được giao tự động khi nhân vật này online.</div>

              <label className="bnc-label mt-4">Phương thức thanh toán</label>
              <div className="d-grid gap-2">
                <button type="button" className={`bnc-pay-option ${method === 'bank' ? 'active' : ''}`} onClick={() => setMethod('bank')}>
                  <span className="ico"><BiQrScan size={24} /></span>
                  <span className="flex-grow-1">
                    <span className="t d-block">Chuyển khoản / Quét QR</span>
                    <span className="s d-block">Mọi ngân hàng & ví điện tử • xác nhận tự động 24/7</span>
                  </span>
                </button>
                <button type="button" className={`bnc-pay-option ${method === 'wallet' ? 'active' : ''}`} onClick={() => setMethod('wallet')}>
                  <span className="ico"><BiWallet size={24} /></span>
                  <span className="flex-grow-1">
                    <span className="t d-block">Số dư ví website</span>
                    <span className="s d-block">
                      {isAuthenticated ? <>Số dư: <b className={enough ? 'text-success' : 'text-danger'}>{formatVnd(balance)}</b>{!enough && ' — không đủ'}</> : 'Cần đăng nhập'}
                    </span>
                  </span>
                </button>
              </div>

              {method === 'wallet' && isAuthenticated && !enough && (
                <div className="mt-2 small"><Link to="/recharge"><BiPlusCircle className="me-1" />Nạp thêm {formatVnd(product.price - balance)} vào ví</Link></div>
              )}
              {method === 'wallet' && !isAuthenticated && (
                <div className="mt-2 small"><Link to="/login">Đăng nhập</Link> để dùng ví, hoặc chọn chuyển khoản.</div>
              )}

              {err && <div className="bnc-error mt-3">{err}</div>}

              <button type="submit" className="bnc-btn bnc-btn-block bnc-btn-lg mt-4" disabled={busy || (method === 'wallet' && (!isAuthenticated || !enough))}>
                {busy ? <><span className="spinner-border spinner-border-sm" /> Đang xử lý...</> : method === 'wallet' ? `Thanh toán ${formatVnd(product.price)}` : 'Tạo mã thanh toán'}
              </button>
              <div className="text-center text-dim small mt-3"><BiShieldQuarter className="me-1" />Giao dịch được xác thực phía máy chủ — an toàn tuyệt đối.</div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

/* ================= Shop page ================= */
const Shop = () => {
  const { isAuthenticated, userProfile } = useData();
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [top, setTop] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, p, t] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).eq('is_deleted', false).order('display_order'),
        supabase.from('products').select('*').eq('active', true).eq('is_deleted', false).order('display_order'),
        supabase.rpc('bnc_top_donators', { p_limit: 5 }),
      ]);
      if (!alive) return;
      setCategories(c.data || []);
      setProducts(p.data || []);
      setTop(t.data || []);
      setLoading(false);
    })();

    // Đơn chờ thanh toán gần nhất (để quay lại thanh toán tiếp)
    const lo = readLastOrder();
    if (lo?.id && Date.now() - lo.at < 60 * 60 * 1000) {
      api('shop-order', { query: { id: lo.id } })
        .then((r) => alive && ['pending', 'underpaid', 'paid'].includes(r.order.status) && setLastOrder(r.order))
        .catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  // /shop?product=<id> -> mở checkout
  useEffect(() => {
    const pid = params.get('product');
    if (pid && products.length) {
      const p = products.find((x) => x.id === pid);
      if (p) setSelected(p);
    }
  }, [params, products]);

  const close = () => {
    setSelected(null);
    if (params.get('product')) { params.delete('product'); setParams(params, { replace: true }); }
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return products.filter((p) => (cat === 'all' || p.category_id === cat) && (!kw || `${p.name} ${p.description || ''}`.toLowerCase().includes(kw)));
  }, [products, cat, q]);

  return (
    <>
      <Seo title="Cửa hàng" description="Mua rank, vật phẩm, tiền tệ BuildnChill — thanh toán QR tự động, giao vật phẩm vào game trong vài giây." path="/shop" />
      <PageHero
        pill="Cửa hàng"
        title="Cửa hàng"
        highlight="BuildnChill"
        subtitle="Chọn vật phẩm, thanh toán bằng QR hoặc ví — hệ thống tự động giao vào game ngay khi bạn online."
        crumbs={[{ label: 'Cửa hàng' }]}
      >
        <div className="d-flex flex-wrap gap-2 mt-4">
          <span className="bnc-pill bnc-pill-dark"><BiBoltCircle /> Giao tự động</span>
          <span className="bnc-pill bnc-pill-dark"><BiQrScan /> QR 24/7</span>
          <span className="bnc-pill bnc-pill-dark"><BiShieldQuarter /> Bảo mật</span>
        </div>
      </PageHero>

      <section className="bnc-section pt-4">
        <div className="container">
          {lastOrder && !selected && (
            <div className="bnc-card bnc-card-pad mb-4 d-flex flex-wrap align-items-center gap-3" style={{ borderColor: 'rgba(var(--bnc-accent-rgb), .5)' }}>
              <BiPackage size={32} className="text-accent" />
              <div className="flex-grow-1 min-w-0">
                <div className="fw-black">Bạn có đơn <span className="text-accent">{lastOrder.product}</span> {lastOrder.status === 'paid' ? 'đang được giao' : 'đang chờ thanh toán'}</div>
                <div className="small text-soft">Mã đơn {lastOrder.code} • cho {lastOrder.mc_username}</div>
              </div>
              <Link to={`/shop/order/${lastOrder.id}`} className="bnc-btn bnc-btn-sm">Xem đơn <BiRightArrowAlt /></Link>
            </div>
          )}

          <div className="row g-4">
            {/* -------- Sidebar -------- */}
            <aside className="col-lg-3 order-2 order-lg-1">
              <div className="d-flex flex-column gap-4" style={{ position: 'sticky', top: 100 }}>
                {isAuthenticated ? (
                  <div className="bnc-card bnc-card-pad">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <img src={mcHead(userProfile?.username, 40)} alt="" width="40" height="40" style={{ borderRadius: 8 }} />
                      <div className="min-w-0">
                        <div className="fw-black text-truncate">{userProfile?.username}</div>
                        <div className="small text-dim">Ví website</div>
                      </div>
                    </div>
                    <div className="fw-black fs-3 text-accent mb-3">{formatVnd(userProfile?.wallet_balance)}</div>
                    <Link to="/recharge" className="bnc-btn bnc-btn-sm bnc-btn-block"><BiPlusCircle /> Nạp tiền</Link>
                  </div>
                ) : (
                  <div className="bnc-card bnc-card-pad">
                    <div className="fw-black mb-2">Mua nhanh hơn với ví</div>
                    <p className="small text-soft">Đăng nhập để nạp ví và mua vật phẩm chỉ với 1 cú nhấp.</p>
                    <Link to="/login" className="bnc-btn bnc-btn-sm bnc-btn-block">Đăng nhập</Link>
                  </div>
                )}

                <div className="bnc-card bnc-card-pad">
                  <div className="fw-black mb-3 d-flex align-items-center gap-2"><BiCrown className="text-accent" size={22} /> Top ủng hộ</div>
                  <div className="d-flex flex-column gap-2">
                    {top.map((u, i) => (
                      <div className="bnc-rank" key={u.name}>
                        <span className={`bnc-rank-no ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                        <img src={mcHead(u.name, 32)} alt="" loading="lazy" />
                        <div className="min-w-0 flex-grow-1">
                          <div className="fw-bold small text-truncate">{u.name}</div>
                          <div className="text-accent fw-bold" style={{ fontSize: '.75rem' }}>{formatVnd(u.total)}</div>
                        </div>
                      </div>
                    ))}
                    {top.length === 0 && <div className="small text-dim">Hãy là người đầu tiên!</div>}
                  </div>
                </div>

                <div className="bnc-card bnc-card-pad small">
                  <div className="fw-black mb-3">Cách mua hàng</div>
                  <ol className="text-soft ps-3 mb-0 d-grid gap-2">
                    <li>Chọn vật phẩm & nhập tên nhân vật</li>
                    <li>Quét QR (đúng nội dung) hoặc trả bằng ví</li>
                    <li>Vào server — vật phẩm tự động được giao</li>
                  </ol>
                  <Link to="/faq" className="d-inline-block mt-3 fw-bold">Câu hỏi thường gặp →</Link>
                </div>
              </div>
            </aside>

            {/* -------- Products -------- */}
            <div className="col-lg-9 order-1 order-lg-2">
              <div className="d-flex flex-column flex-md-row gap-3 mb-4">
                <div className="bnc-tabs flex-grow-1">
                  <button className={`bnc-tab ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>Tất cả</button>
                  {categories.map((c) => (
                    <button key={c.id} className={`bnc-tab ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
                      {c.icon ? `${c.icon} ` : ''}{c.name}
                    </button>
                  ))}
                </div>
                <div className="position-relative" style={{ minWidth: 220 }}>
                  <BiSearch className="position-absolute text-dim" style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input className="bnc-input" style={{ paddingLeft: 36 }} placeholder="Tìm vật phẩm..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm vật phẩm" />
                </div>
              </div>

              {loading ? (
                <div className="row g-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div className="col-6 col-xl-4" key={i}><div className="bnc-skel" style={{ height: 320 }} /></div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="bnc-card bnc-empty">Không tìm thấy vật phẩm phù hợp.</div>
              ) : (
                <div className="row g-3 g-md-4">
                  {filtered.map((p, i) => (
                    <motion.div className="col-6 col-xl-4" key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                      <div className="bnc-card bnc-card-hover bnc-product">
                        <div className="bnc-product-media">
                          <img src={p.image_url || '/img/logo.png'} alt={p.name} loading="lazy" />
                        </div>
                        <h3>{p.name}</h3>
                        {plainText(p.description) && <div className="desc">{plainText(p.description)}</div>}
                        <div className="mt-auto">
                          <div className="bnc-price mb-3">
                            {formatVnd(p.price)}
                          </div>
                          <button className="bnc-btn bnc-btn-block bnc-btn-sm" onClick={() => setSelected(p)}>Mua ngay</button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>{selected && <Checkout key={selected.id} product={selected} onClose={close} />}</AnimatePresence>
    </>
  );
};

export default Shop;
