import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiCheckCircle, BiCopy, BiTime, BiErrorCircle, BiPackage, BiQrScan } from 'react-icons/bi';
import { api, formatVnd, mcHead, ORDER_STATUS } from '../lib/api';
import { StatusBadge, useCopy } from './ui';
import { useData } from '../context/DataContext';
import BankPicker from './BankPicker';

const LIVE = ['pending', 'underpaid', 'paid'];

const useCountdown = (iso) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iso) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '00:00';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const Steps = ({ status }) => {
  const paid = ['paid', 'delivered', 'failed'].includes(status);
  const delivered = status === 'delivered';
  const items = [
    { t: 'Đặt hàng', done: true, on: true },
    { t: 'Thanh toán', done: paid, on: true },
    { t: 'Giao vật phẩm', done: delivered, on: paid },
  ];
  return (
    <div className="bnc-steps">
      {items.map((it, i) => (
        <div key={it.t} className={`bnc-step ${it.on ? 'on' : ''} ${it.done ? 'done' : ''}`}>
          <span className="n">{it.done ? '✓' : i + 1}</span>
          <span className="t">{it.t}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Theo dõi 1 đơn hàng: hiện QR/thông tin chuyển khoản khi chờ thanh toán,
 * tự cập nhật trạng thái (4 giây/lần) đến khi giao xong.
 */
const OrderTracker = ({ orderId, initialOrder = null, initialBank = null, initialBanks = null, onStatusChange }) => {
  const { siteSettings } = useData();
  const copy = useCopy();
  const [order, setOrder] = useState(initialOrder);
  const [banks, setBanks] = useState(initialBanks?.length ? initialBanks : (initialBank ? [initialBank] : []));
  const [bankId, setBankId] = useState(null);
  const bank = banks.find((b) => b.id === bankId) || banks[0] || null;
  const [error, setError] = useState('');
  const lastStatus = useRef(initialOrder?.status);
  const countdown = useCountdown(order?.status === 'pending' ? order?.expires_at : null);

  useEffect(() => {
    let alive = true;
    let timer = null;
    let tries = 0;

    const tick = async () => {
      try {
        const res = await api('shop-order', { query: { id: orderId } });
        if (!alive) return;
        setOrder(res.order);
        setBanks(res.banks?.length ? res.banks : (res.bank ? [res.bank] : []));
        setError('');
        if (res.order.status !== lastStatus.current) {
          lastStatus.current = res.order.status;
          onStatusChange?.(res.order);
        }
        if (!LIVE.includes(res.order.status)) return;
      } catch (e) {
        if (!alive) return;
        if (e.status === 404) { setError('Không tìm thấy đơn hàng.'); return; }
      }
      tries += 1;
      // 4s trong 15 phút đầu, sau đó 15s
      timer = setTimeout(tick, tries < 225 ? 4000 : 15000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <div className="bnc-empty"><BiErrorCircle size={40} className="mb-2 text-danger" /><div>{error}</div></div>;
  }
  if (!order) {
    return <div className="d-flex justify-content-center py-5"><div className="spinner-border text-primary" /></div>;
  }

  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const status = order.status;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <img src={mcHead(order.mc_username, 64)} alt="" width="48" height="48" style={{ borderRadius: 8 }} />
        <div className="min-w-0 flex-grow-1" style={{ flexBasis: 160 }}>
          <div className="fw-black text-truncate">{order.product}</div>
          <div className="small text-soft">cho <b className="text-white">{order.mc_username}</b> • {formatVnd(order.amount)}</div>
        </div>
        <StatusBadge status={status} label={ORDER_STATUS[status] || status} pulse={LIVE.includes(status)} />
      </div>

      <Steps status={status} />

      {/* ---------- Chờ thanh toán ---------- */}
      {bank && (status === 'pending' || status === 'underpaid') && (
        <div className="row g-4 align-items-center">
          {banks.length > 1 && (
            <div className="col-12 pb-0">
              <BankPicker banks={banks} value={bank?.id} onChange={setBankId} />
            </div>
          )}
          <div className="col-md-6 text-center">
            <div className="bnc-qr">
              <img key={bank.id} src={bank.qr_url} alt={`QR thanh toán ${bank.content}`} />
            </div>
            <div className="small text-soft mt-3"><BiQrScan className="me-1" />Mở app ngân hàng và quét mã QR</div>
          </div>
          <div className="col-md-6">
            {status === 'underpaid' && (
              <div className="alert alert-warning small fw-bold py-2">
                Đã nhận {formatVnd(order.amount_paid)}. Vui lòng chuyển thêm {formatVnd(bank.amount)} với cùng nội dung.
              </div>
            )}
            <div className="text-dim small fw-bold text-uppercase">Nội dung chuyển khoản</div>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <span className="bnc-code-big">{bank.content}</span>
              <button className="bnc-copy" onClick={() => copy(bank.content, 'Đã sao chép nội dung')}><BiCopy /></button>
            </div>
            <div className="bnc-kv"><span className="k">Số tiền</span><span className="v text-accent">{formatVnd(bank.amount)}<button className="bnc-copy" onClick={() => copy(bank.amount, 'Đã sao chép số tiền')}><BiCopy /></button></span></div>
            <div className="bnc-kv"><span className="k">Ngân hàng</span><span className="v">{bank.bank_name}</span></div>
            <div className="bnc-kv"><span className="k">Số TK</span><span className="v">{bank.account}<button className="bnc-copy" onClick={() => copy(bank.account, 'Đã sao chép số tài khoản')}><BiCopy /></button></span></div>
            <div className="bnc-kv"><span className="k">Chủ TK</span><span className="v">{bank.account_name}</span></div>
            {countdown && (
              <div className="d-flex align-items-center gap-2 mt-3 small fw-bold text-soft">
                <BiTime className="text-accent" /> Đơn giữ trong <span className="text-white">{countdown}</span>
              </div>
            )}
            <div className="d-flex align-items-center gap-2 mt-2 small text-soft">
              <span className="bnc-pulse text-accent" /> Đang chờ ngân hàng xác nhận — tự động cập nhật.
            </div>
          </div>
          <div className="col-12">
            <div className="bnc-card-flat p-3 small text-soft">
              ⚠️ Nhập <b className="text-white">chính xác nội dung {bank.content}</b> để hệ thống xác nhận tự động trong 10–60 giây.
              Sai nội dung? <Link to="/contact">Liên hệ hỗ trợ</Link> kèm ảnh biên lai.
            </div>
          </div>
        </div>
      )}

      {/* ---------- Đã thanh toán, chờ giao ---------- */}
      {status === 'paid' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-3">
          <BiPackage size={64} className="text-accent mb-2" />
          <h3 className="h4 fw-black">Đã nhận thanh toán!</h3>
          <p className="text-soft mb-3">
            Vật phẩm đang được giao. Hãy vào máy chủ <b className="text-accent">{ip}</b> bằng nhân vật <b className="text-white">{order.mc_username}</b> —
            hệ thống sẽ tự động giao ngay khi bạn online.
          </p>
          <button className="bnc-btn bnc-btn-sm" onClick={() => copy(ip, 'Đã sao chép IP')}><BiCopy /> Copy IP</button>
        </motion.div>
      )}

      {/* ---------- Đã giao ---------- */}
      {status === 'delivered' && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-3">
          <BiCheckCircle size={72} className="text-success mb-2" />
          <h3 className="h4 fw-black">Giao hàng thành công!</h3>
          <p className="text-soft mb-0">
            <b className="text-white">{order.product}</b> đã được giao cho <b className="text-white">{order.mc_username}</b>
            {order.delivered_at ? ` lúc ${new Date(order.delivered_at).toLocaleString('vi-VN')}` : ''}. Cảm ơn bạn đã ủng hộ server! 🧡
          </p>
        </motion.div>
      )}

      {/* ---------- Lỗi / hết hạn / huỷ ---------- */}
      {['failed', 'expired', 'cancelled'].includes(status) && (
        <div className="text-center py-3">
          <BiErrorCircle size={60} className="text-danger mb-2" />
          <h3 className="h5 fw-black">
            {status === 'failed' ? 'Giao vật phẩm gặp lỗi' : status === 'expired' ? 'Đơn hàng đã hết hạn' : 'Đơn hàng đã bị huỷ'}
          </h3>
          <p className="text-soft small mb-3">
            {status === 'failed'
              ? 'Đội ngũ quản trị đã nhận được thông báo và sẽ giao lại sớm nhất. Bạn cũng có thể liên hệ hỗ trợ.'
              : status === 'expired'
                ? 'Nếu bạn ĐÃ chuyển khoản đúng nội dung, hệ thống vẫn tự ghi nhận. Nếu chưa, hãy tạo đơn mới.'
                : 'Vui lòng tạo đơn mới nếu bạn vẫn muốn mua vật phẩm này.'}
          </p>
          <div className="d-flex justify-content-center gap-2 flex-wrap">
            <Link to="/shop" className="bnc-btn bnc-btn-sm">Về cửa hàng</Link>
            <Link to="/contact" className="bnc-btn bnc-btn-dark bnc-btn-sm">Liên hệ hỗ trợ</Link>
          </div>
        </div>
      )}

      {order.code && (
        <div className="text-center text-dim small mt-3">
          Mã đơn: <b className="text-soft">{order.code}</b> • <Link to={`/shop/order/${order.id}`}>Trang theo dõi đơn</Link>
        </div>
      )}
    </div>
  );
};

export default OrderTracker;
