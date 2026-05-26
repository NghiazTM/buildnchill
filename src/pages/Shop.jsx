import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  BiShoppingBag,
  BiUser,
  BiCheckCircle,
  BiQrScan,
  BiCreditCard,
  BiStar,
  BiWallet,
  BiInfoCircle,
  BiRefresh,
  BiXCircle
} from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import SummerEffect from '../components/SummerEffect';
import '../styles/summer-theme.css';

const Shop = () => {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const formRef = useRef(null);
  const [formData, setFormData] = useState({
    mc_username: '',
    product_id: '',
    payment_method: 'qr'
  });
  const [submitting, setSubmitting] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [topDonators, setTopDonators] = useState([]);
  const [paymentInfo] = useState({
    bank_account: import.meta.env.VITE_BANK_ACCOUNT,
    bank_name: import.meta.env.VITE_BANK_NAME,
    account_name: import.meta.env.VITE_BANK_ACCOUNT_NAME
  });

  const DISCORD_WEBHOOK_URL = import.meta.env.VITE_DISCORD_SHOP_WEBHOOK;

  useEffect(() => {
    loadCategories();
    loadProducts();
    loadTopDonators();
    checkUser();
  }, []);

  // Poll order status while payment modal is open. When backend (Sepay webhook)
  // updates the order `status` to 'paid' (or 'delivered'), show success popup.
  // Reduced request rate: poll every 8s and stop after ~10 minutes to avoid excess requests.
  useEffect(() => {
    let poll = null;
    let attempts = 0;
    const INTERVAL_MS = 8000; // 8 seconds
    const MAX_ATTEMPTS = Math.ceil((10 * 60 * 1000) / INTERVAL_MS); // ~10 minutes

    if (showPayment && currentOrder) {
      poll = setInterval(async () => {
        attempts += 1;
        try {
          const { data, error } = await supabase.from('orders').select('status').eq('id', currentOrder.id).single();
          if (!error && data && (data.status === 'paid' || data.status === 'delivered')) {
            clearInterval(poll);
            setShowPayment(false);
            setShowSuccess(true);
            loadTopDonators();
          } else if (attempts >= MAX_ATTEMPTS) {
            clearInterval(poll);
            console.info('Stopped polling order status after max attempts for order', currentOrder.id);
          }
        } catch (e) {
          console.error('Polling order status failed:', e);
          if (attempts >= MAX_ATTEMPTS) {
            clearInterval(poll);
          }
        }
      }, INTERVAL_MS);
    }
    return () => { if (poll) clearInterval(poll); };
  }, [showPayment, currentOrder]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
      if (profile) setFormData(prev => ({ ...prev, mc_username: profile.username }));
    }
  };

  const loadTopDonators = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('mc_username, price')
        .eq('is_deleted', false)
        .or('status.eq.paid,status.eq.delivered');

      if (error) throw error;
      const userSpending = {};
      data.forEach(o => userSpending[o.mc_username] = (userSpending[o.mc_username] || 0) + (o.price || 0));
      const sorted = Object.entries(userSpending)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setTopDonators(sorted);
    } catch (e) { console.error(e); }
  };

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').eq('active', true).eq('is_deleted', false).order('display_order');
    if (data) {
      setCategories(data);
      if (data.length > 0 && !selectedCategory) setSelectedCategory(data[0].id);
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('active', true).eq('is_deleted', false).order('display_order');
    if (data) setProducts(data);
  };

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setFormData({ ...formData, product_id: product.id });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.mc_username || !formData.product_id) return;

    setSubmitting(true);
    const product = products.find(p => p.id === formData.product_id);

    if (formData.payment_method === 'wallet') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { alert('Vui lòng đăng nhập để sử dụng ví!'); setSubmitting(false); return; }

      const { data: result, error } = await supabase.rpc('process_wallet_purchase', {
        p_user_id: user.id,
        p_product_id: product.id,
        p_mc_username: formData.mc_username
      });
      if (error || !result.success) {
        alert(result?.message || 'Số dư không đủ hoặc lỗi hệ thống!');
      } else {
        setShowSuccess(true);
        loadTopDonators();

        // Gửi thông báo Discord khi mua bằng ví thành công
        try {
          const WEBHOOK_URL = import.meta.env.VITE_DISCORD_SHOP_WEBHOOK;
          const embed = {
            title: '💳 THÔNG BÁO MUA HÀNG QUA VÍ',
            description: `Người chơi **${formData.mc_username}** vừa mua **${product.name}** thành công bằng số dư ví!`,
            color: 0x10b981,
            fields: [
              { name: '👤 Người chơi', value: formData.mc_username, inline: true },
              { name: '💰 Số tiền', value: `${product.price.toLocaleString('vi-VN')} VNĐ`, inline: true },
              { name: '📦 Sản phẩm', value: product.name, inline: true },
              { name: '💳 Phương thức', value: 'Số dư ví (Wallet)', inline: true }
            ],
            footer: { text: `BuildnChill System • ${new Date().toLocaleString('vi-VN')}` },
            timestamp: new Date().toISOString()
          };

          fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `📢 **${formData.mc_username}** vừa mua **${product.name}** (**${product.price.toLocaleString('vi-VN')}đ**) bằng ví! 🛒`,
              embeds: [embed]
            })
          });
        } catch (discordError) {
          console.error('Discord Wallet Notify Error:', discordError);
        }
      }
      setSubmitting(false);
      return;
    }

    const tempId = crypto.randomUUID();

    // create a pending order record so external payment gateway (Sepay) can match by id/content
    const pendingOrder = {
      id: tempId,
      mc_username: formData.mc_username,
      product: product.name,
      product_id: product.id,
      command: product.command,
      price: product.price,
      status: 'pending',
      payment_method: formData.payment_method
    };

    try {
      const { error } = await supabase.from('orders').insert([pendingOrder]);
      if (error) console.error('Error creating pending order:', error);
    } catch (e) {
      console.error('Exception creating pending order:', e);
    }

    setCurrentOrder({ ...product, id: tempId, product_id: product.id, mc_username: formData.mc_username, payment_method: formData.payment_method });
    setShowPayment(true);
    setSubmitting(false);
  };

  const handlePaymentComplete = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('orders').insert([{
        id: currentOrder.id,
        mc_username: currentOrder.mc_username,
        product: currentOrder.name,
        product_id: currentOrder.product_id,
        command: currentOrder.command,
        price: currentOrder.price,
        status: 'pending',
        payment_method: currentOrder.payment_method
      }]).select().single();

      if (error) throw error;
      setShowPayment(false);
      setCurrentOrder(null);
      setSelectedProduct(null);
      setFormData({ ...formData, product_id: '' });
      setShowSuccess(true);
      loadTopDonators();
    } catch (e) { alert('Lỗi: ' + e.message); }
    finally { setSubmitting(false); }
  };

  const filteredProducts = selectedCategory ? products.filter(p => p.category_id === selectedCategory) : products;

  return (
    <div className="shop-summer-container">
      <Helmet><title>BUILDNCHILL SHOP - Cửa Hàng Mùa Hè</title></Helmet>
      <SummerEffect />

      {/* Decorative Items */}
      <div className="summer-item dolphin" style={{ top: '15%', right: '-50px', animationDelay: '2s' }}>🐬</div>
      <div className="summer-item" style={{ bottom: '50px', left: '20px', fontSize: '40px' }}>🐚</div>
      <div className="summer-item" style={{ top: '200px', left: '5%', fontSize: '50px', opacity: 0.5 }}>⛵</div>

      <div className="container py-5 position-relative" style={{ zIndex: 10 }}>
        <header className="text-center mb-5">
          <motion.h1
            className="summer-title display-3 fw-black mb-3"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            BUILDNCHILL SHOP 🌊
          </motion.h1>
          <p className="lead fw-bold text-primary">Nơi cung cấp vật phẩm xịn nhất Server BuildnChill</p>
        </header>

        <div className="row g-4">
          {/* Sidebar Top Nạp */}
          <div className="col-lg-3 d-none d-lg-block">
            <motion.div
              className="summer-glass p-4 sticky-top"
              style={{ top: '100px' }}
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
            >
              <h4 className="summer-label mb-4"><BiStar className="text-warning me-2" />TOP ĐẠI GIA 💎</h4>
              <div className="d-flex flex-column gap-3">
                {topDonators.map((user, i) => (
                  <div key={i} className="d-flex align-items-center p-2 rounded-4 shadow-sm border border-info border-opacity-10" style={{ backgroundColor: 'var(--bg-sand-light)' }}>
                    <div className={`badge ${i === 0 ? 'bg-warning' : 'bg-info'} me-2 rounded-circle`} style={{ width: '25px', height: '25px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                    <img src={`https://vzge.me/bust/${user.name}.png`} className="me-2 rounded-3 shadow-sm" alt="avatar" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                    <div className="flex-grow-1 overflow-hidden">
                      <div className="fw-bold text-primary text-truncate small">{user.name}</div>
                      <div className="fw-bold text-success" style={{ fontSize: '0.75rem' }}>{user.total.toLocaleString()}đ</div>
                    </div>
                  </div>
                ))}
                {topDonators.length === 0 && <div className="text-center py-3 text-muted small">Chưa có dữ liệu</div>}
              </div>
            </motion.div>
          </div>

          {/* Main Shop Content */}
          <div className="col-lg-9">
            {/* Category Tabs */}
            <div className="d-flex gap-2 mb-5 overflow-auto pb-2 scroll-hide">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`btn rounded-pill px-4 py-2 fw-extrabold shadow-sm transition-all ${selectedCategory === cat.id ? 'summer-button' : 'summer-button-outline'}`}
                >
                  {cat.name.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Product Grid */}
            <div className="row g-4">
              {filteredProducts.map(product => (
                <div key={product.id} className="col-md-6 col-xl-4">
                  <motion.div
                    whileHover={{ y: -12 }}
                    className="summer-glass h-100 p-3 text-center d-flex flex-column border-0 shadow-lg"
                    style={{ backgroundColor: 'var(--bg-card)' }}
                  >
                    <div className="rounded-4 p-3 mb-3" style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #0ea5e9' }}>
                      <img src={product.image_url || 'https://via.placeholder.com/150'} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} className="drop-shadow" alt={product.name} />
                    </div>
                    <h5 className="fw-extrabold mb-2" style={{ color: 'var(--summer-deep-blue)', minHeight: '3rem' }}>{product.name}</h5>
                    <div className="fw-black h4 my-3 text-info">{product.price.toLocaleString()} VNĐ</div>
                    <button onClick={() => handleProductSelect(product)} className="summer-button w-100 mt-auto">CHỌN MUA 🛒</button>
                  </motion.div>
                </div>
              ))}
              {filteredProducts.length === 0 && <div className="col-12 text-center py-5"><h4 className="text-muted">Không tìm thấy sản phẩm trong danh mục này.</h4></div>}
            </div>

            {/* Order Form */}
            <AnimatePresence>
              {selectedProduct && (
                <motion.div
                  ref={formRef}
                  className="summer-glass p-4 p-md-5 mt-5 border-0 shadow-2xl"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h3 className="summer-title m-0" style={{ fontSize: '1.8rem' }}>📦 THÔNG TIN ĐƠN HÀNG</h3>
                    <BiShoppingBag size={40} className="text-info opacity-50" />
                  </div>

                  <div className="p-3 bg-sand-light rounded-4 mb-4 fw-bold text-primary border border-info border-opacity-20" style={{ backgroundColor: 'var(--bg-sand-light)' }}>
                    Vật phẩm đã chọn: <span className="text-primary">{selectedProduct.name}</span> - <span className="text-info">{selectedProduct.price.toLocaleString()} VNĐ</span>
                  </div>

                  <form onSubmit={handleSubmit} className="row g-4">
                    <div className="col-md-6">
                      <label className="summer-label">Tên Nhân Vật Minecraft</label>
                      <input
                        type="text"
                        className="summer-input w-100"
                        placeholder="Nhập IGN của bạn..."
                        value={formData.mc_username}
                        onChange={e => setFormData({ ...formData, mc_username: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="summer-label">Phương Thức Thanh Toán</label>
                      <select className="summer-select w-100" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                        <option value="qr">QUÉT MÃ QR (AUTO ✅)</option>
                        <option value="bank">CHUYỂN KHOẢN (AUTO ✅)</option>
                        <option value="wallet">THANH TOÁN BẰNG VÍ 💳</option>
                      </select>
                    </div>
                    <div className="col-12 mt-4">
                      <button type="submit" disabled={submitting} className="summer-button w-100 py-3 rounded-pill shadow-lg">
                        {submitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN ĐẶT HÀNG NGAY'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPayment && currentOrder && (
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000 }}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="summer-glass p-4 w-100 text-center" style={{ backgroundColor: 'var(--bg-card)', maxWidth: '520px', pointerEvents: 'auto' }}>
              <h4 className="summer-title mb-4" style={{ fontSize: '1.5rem' }}>{currentOrder.payment_method === 'qr' ? 'THANH TOÁN TỰ ĐỘNG' : 'CHUYỂN KHOẢN THỦ CÔNG'}</h4>
              <div className="mb-4">
                {currentOrder.payment_method === 'qr' ? (
                  <>
                    <img
                      src={`https://img.vietqr.io/image/MB-${paymentInfo.bank_account}-compact2.png?amount=${currentOrder.price}&addInfo=${currentOrder.id.substring(0, 8)}&accountName=${paymentInfo.account_name}`}
                      className="img-fluid rounded-4 border border-info border-4 p-2 shadow-2xl bg-white"
                      alt="QR Code"
                    />
                    <div className="mt-4 p-3 rounded-4 border-2 border-info border-dashed" style={{ backgroundColor: 'var(--bg-sand-light)' }}>
                      <div className="small fw-bold text-muted mb-1">NỘI DUNG CHUYỂN KHOẢN:</div>
                      <div className="h3 fw-black text-primary user-select-all mb-0">{currentOrder.id.substring(0, 8)}</div>
                      <div className="x-small text-danger mt-2">*(Vui lòng giữ nguyên nội dung để được duyệt tự động)*</div>
                    </div>
                  </>
                ) : (
                  <div className="text-start">
                    <div className="p-3 rounded-4 border-2 border-info mb-3" style={{ backgroundColor: 'var(--bg-sand-light)' }}>
                      <div className="small fw-bold text-muted">NGÂN HÀNG</div>
                      <div className="h5 fw-black">{paymentInfo.bank_name}</div>
                      <div className="small fw-bold text-muted mt-2">SỐ TÀI KHOẢN</div>
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="fw-black">{paymentInfo.bank_account}</div>
                        <button type="button" className="summer-button-outline" onClick={() => navigator.clipboard.writeText(paymentInfo.bank_account)}>COPY</button>
                      </div>
                      <div className="small fw-bold text-muted mt-2">CHỦ TÀI KHOẢN</div>
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="fw-black">{paymentInfo.account_name}</div>
                        <button type="button" className="summer-button-outline" onClick={() => navigator.clipboard.writeText(paymentInfo.account_name)}>COPY</button>
                      </div>
                      <div className="small fw-bold text-muted mt-2">SỐ TIỀN</div>
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="fw-black">{currentOrder.price.toLocaleString()} VNĐ</div>
                        <button type="button" className="summer-button-outline" onClick={() => navigator.clipboard.writeText(String(currentOrder.price))}>COPY</button>
                      </div>
                      <div className="small fw-bold text-muted mt-3">NỘI DUNG CHUYỂN KHOẢN (BẮT BUỘC)</div>
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="fw-black">{currentOrder.id.substring(0, 8)}</div>
                        <button type="button" className="summer-button-outline" onClick={() => navigator.clipboard.writeText(currentOrder.id.substring(0, 8))}>COPY</button>
                      </div>
                      <div className="x-small text-danger mt-2">*Vui lòng nhập chính xác nội dung để được duyệt tự động.</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="d-grid gap-2">
                <button onClick={() => setShowPayment(false)} className="btn btn-link text-muted fw-bold text-decoration-none">QUAY LẠI</button>
              </div>
            </motion.div>
          </div>
        )}

        {showSuccess && (
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10001 }}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="summer-glass p-5 text-center" style={{ backgroundColor: 'var(--bg-card)', maxWidth: '400px' }}>
              <BiCheckCircle size={100} className="text-success mb-4 shadow-sm" />
              <h2 className="summer-title mb-3">THÀNH CÔNG!</h2>
              <p className="fw-bold text-primary mb-4">Giao dịch hoàn tất. Quà đã được chuyển vào game cho bạn!</p>
              <button onClick={() => setShowSuccess(false)} className="summer-button w-100 py-3">TIẾP TỤC MUA SẮM</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Shop;
