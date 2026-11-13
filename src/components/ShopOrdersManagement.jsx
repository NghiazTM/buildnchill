import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BiCheckCircle, BiShow, BiRefresh, BiTrash, BiPackage, BiX, BiSearch, BiBlock, BiWallet, BiQrScan } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { generateOrderCode } from '../utils/helpers';
import { api, ORDER_STATUS, formatVnd, mcHead } from '../lib/api';
import { StatusBadge, useToast } from './ui';

const FILTERS = ['all', 'pending', 'underpaid', 'paid', 'delivered', 'failed', 'cancelled', 'expired'];

const DELIVERY_STATUS = {
  queued: { label: 'Chờ giao', cls: 'pending' },
  processing: { label: 'Đang giao', cls: 'paid' },
  delivered: { label: 'Đã giao', cls: 'delivered' },
  failed: { label: 'Lỗi', cls: 'failed' },
  cancelled: { label: 'Đã huỷ', cls: 'cancelled' },
};

const fmtTime = (t) => (t ? new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Đơn pending đã quá hạn hiển thị là "expired"
const effectiveStatus = (o) => (
  o.status === 'pending' && o.expires_at && new Date(o.expires_at) < new Date() ? 'expired' : o.status
);

const ShopOrdersManagement = () => {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [busy, setBusy] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, products(name, display_price), categories(name)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast('Không tải được danh sách đơn hàng', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOrders();
    const onUpdate = () => loadOrders();
    window.addEventListener('orders_updated', onUpdate);
    return () => window.removeEventListener('orders_updated', onUpdate);
  }, [loadOrders]);

  const loadDeliveries = useCallback(async (orderId) => {
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    setDeliveries(data || []);
  }, []);

  const openOrder = (order) => {
    setSelectedOrder(order);
    setDeliveries([]);
    loadDeliveries(order.id);
  };

  // Giữ modal đồng bộ với dữ liệu mới
  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = orders.find((o) => o.id === selectedOrder.id);
    if (fresh && fresh !== selectedOrder) {
      setSelectedOrder(fresh);
      loadDeliveries(fresh.id);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: orders.length };
    orders.forEach((o) => {
      const s = effectiveStatus(o);
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== 'all' && effectiveStatus(o) !== filter) return false;
      if (!q) return true;
      return [o.mc_username, o.payment_code, generateOrderCode(o.id), o.product, o.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [orders, filter, search]);

  const runAction = async (action, order) => {
    const confirmText = {
      mark_paid: `Xác nhận đã nhận đủ ${formatVnd(order.price)} cho đơn này? Vật phẩm sẽ được đưa vào hàng đợi giao.`,
      redeliver: 'Giao lại vật phẩm cho đơn này? Các lệnh sẽ được thực thi thêm một lần khi người chơi online.',
      cancel: 'Huỷ đơn chưa thanh toán này?',
    }[action];
    if (!window.confirm(confirmText)) return;

    setBusy(`${action}:${order.id}`);
    try {
      await api('admin-orders', { method: 'POST', body: { action, order_id: order.id } });
      toast({
        mark_paid: 'Đã xác nhận thanh toán, đang chờ giao vật phẩm',
        redeliver: 'Đã đưa đơn vào hàng đợi giao lại',
        cancel: 'Đã huỷ đơn hàng',
      }[action], 'success');
      await loadOrders();
      if (selectedOrder?.id === order.id) loadDeliveries(order.id);
    } catch (e) {
      toast(e.message || 'Thao tác thất bại', 'error');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteOrder = async (order) => {
    if (!window.confirm('Ẩn (xoá mềm) đơn hàng này khỏi danh sách?')) return;
    const { error } = await supabase.from('orders').update({ is_deleted: true }).eq('id', order.id);
    if (error) {
      toast('Xoá thất bại: ' + error.message, 'error');
      return;
    }
    toast('Đã xoá đơn hàng', 'success');
    if (selectedOrder?.id === order.id) setSelectedOrder(null);
    loadOrders();
  };

  const canMarkPaid = (o) => ['pending', 'expired', 'underpaid'].includes(effectiveStatus(o));
  const canRedeliver = (o) => ['paid', 'delivered', 'failed'].includes(o.status);
  const canCancel = canMarkPaid;

  const code = (o) => o.payment_code || generateOrderCode(o.id);

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Đơn hàng cửa hàng</h2>
          <p>Thanh toán & giao vật phẩm tự động qua SePay + plugin. Thao tác thủ công chỉ khi cần.</p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <div className="position-relative">
            <BiSearch className="position-absolute text-dim" style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              className="bnc-input py-2"
              style={{ paddingLeft: 34, width: 240 }}
              placeholder="Tên nhân vật / mã đơn..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="bnc-icon-btn" onClick={loadOrders} disabled={loading} aria-label="Làm mới">
            <BiRefresh size={18} />
          </button>
        </div>
      </div>

      <div className="bnc-chip-row mb-3">
        {FILTERS.map((f) => (
          <button key={f} className={`bnc-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tất cả' : ORDER_STATUS[f]}
            <span className="n">{counts[f] || 0}</span>
          </button>
        ))}
      </div>

      <div className="bnc-card">
        <div className="table-responsive">
          <table className="bnc-admin-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Người chơi</th>
                <th>Sản phẩm</th>
                <th className="text-end">Giá / Đã nhận</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const st = effectiveStatus(o);
                const price = Math.round(Number(o.price || 0));
                const paid = Number(o.amount_paid || 0);
                return (
                  <tr key={o.id}>
                    <td><span className="bnc-code">{code(o)}</span></td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <img className="avatar" src={mcHead(o.mc_username, 32)} alt="" />
                        <span className="fw-bold">{o.mc_username}</span>
                      </div>
                    </td>
                    <td><div className="small fw-semibold text-truncate" style={{ maxWidth: 200 }}>{o.product || o.products?.name}</div></td>
                    <td className="text-end">
                      <div className="fw-black text-accent">{formatVnd(price)}</div>
                      {o.payment_method !== 'wallet' && paid > 0 && paid !== price && (
                        <div className={`small fw-bold ${paid < price ? 'text-danger' : 'text-success'}`}>{formatVnd(paid)}</div>
                      )}
                    </td>
                    <td className="small text-soft">
                      {o.payment_method === 'wallet'
                        ? <span><BiWallet className="me-1" />Ví</span>
                        : <span><BiQrScan className="me-1" />Chuyển khoản</span>}
                    </td>
                    <td><StatusBadge status={st} label={ORDER_STATUS[st] || st} pulse={st === 'paid'} /></td>
                    <td className="small text-soft text-nowrap">{fmtTime(o.created_at)}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <button className="bnc-icon-btn" onClick={() => openOrder(o)} aria-label="Chi tiết"><BiShow /></button>
                        {canMarkPaid(o) && (
                          <button className="bnc-icon-btn success" title="Xác nhận đã thanh toán" disabled={!!busy}
                            onClick={() => runAction('mark_paid', o)}><BiCheckCircle /></button>
                        )}
                        {canRedeliver(o) && (
                          <button className="bnc-icon-btn" title="Giao lại" disabled={!!busy}
                            onClick={() => runAction('redeliver', o)}><BiPackage /></button>
                        )}
                        <button className="bnc-icon-btn danger" title="Xoá" onClick={() => handleDeleteOrder(o)}><BiTrash /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan="8" className="bnc-empty">{loading ? 'Đang tải...' : 'Không có đơn hàng phù hợp'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <div className="bnc-overlay" onClick={() => setSelectedOrder(null)}>
            <motion.div
              className="bnc-modal bnc-modal-lg"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>Đơn <span className="text-accent">{code(selectedOrder)}</span></h3>
                <button className="bnc-x" onClick={() => setSelectedOrder(null)} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <div className="bnc-modal-body">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <img src={mcHead(selectedOrder.mc_username, 64)} alt="" width="52" height="52" className="rounded-3" />
                  <div className="min-w-0">
                    <div className="fw-black fs-5">{selectedOrder.mc_username}</div>
                    <div className="small text-soft text-truncate">{selectedOrder.product || selectedOrder.products?.name}</div>
                  </div>
                  <div className="ms-auto">
                    <StatusBadge
                      status={effectiveStatus(selectedOrder)}
                      label={ORDER_STATUS[effectiveStatus(selectedOrder)] || selectedOrder.status}
                      pulse={selectedOrder.status === 'paid'}
                    />
                  </div>
                </div>

                <div className="row g-0 g-md-4">
                  <div className="col-md-6">
                    <div className="bnc-kv"><span className="k">Giá</span><span className="v text-accent">{formatVnd(selectedOrder.price)}</span></div>
                    <div className="bnc-kv"><span className="k">Đã nhận</span><span className="v">{formatVnd(selectedOrder.amount_paid)}</span></div>
                    <div className="bnc-kv">
                      <span className="k">Phương thức</span>
                      <span className="v">{selectedOrder.payment_method === 'wallet' ? 'Số dư ví' : 'Chuyển khoản (SePay)'}</span>
                    </div>
                    <div className="bnc-kv"><span className="k">Mã GD ngân hàng</span><span className="v small">{selectedOrder.sepay_transaction_id || '—'}</span></div>
                  </div>
                  <div className="col-md-6">
                    <div className="bnc-kv"><span className="k">Tạo lúc</span><span className="v">{fmtTime(selectedOrder.created_at)}</span></div>
                    <div className="bnc-kv"><span className="k">Hết hạn</span><span className="v">{fmtTime(selectedOrder.expires_at)}</span></div>
                    <div className="bnc-kv"><span className="k">Thanh toán</span><span className="v">{fmtTime(selectedOrder.paid_at)}</span></div>
                    <div className="bnc-kv"><span className="k">Đã giao</span><span className="v">{fmtTime(selectedOrder.delivered_at)}</span></div>
                  </div>
                </div>

                <label className="bnc-label mt-3">Lệnh của sản phẩm</label>
                <pre className="bnc-pre">{selectedOrder.command || '(trống)'}</pre>

                <label className="bnc-label mt-3">Lượt giao vật phẩm</label>
                {deliveries.length === 0 ? (
                  <div className="bnc-card-flat p-3 small text-dim">Chưa có lượt giao nào (đơn chưa thanh toán hoặc là đơn cũ).</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {deliveries.map((d) => {
                      const ds = DELIVERY_STATUS[d.status] || { label: d.status, cls: 'pending' };
                      return (
                        <div key={d.id} className="bnc-card-flat p-3">
                          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                            <StatusBadge status={ds.cls} label={ds.label} pulse={d.status === 'processing'} />
                            <span className="small text-soft">Lần thử: <b className="text-white">{d.attempts}</b></span>
                            <span className="small text-dim ms-auto">{fmtTime(d.delivered_at || d.created_at)}</span>
                          </div>
                          <pre className="bnc-pre">{(Array.isArray(d.commands) ? d.commands : []).join('\n') || '(không có lệnh)'}</pre>
                          {d.last_error && <div className="bnc-error mt-2 small">Lỗi: {d.last_error}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="d-flex flex-wrap gap-2 mt-4">
                  {canMarkPaid(selectedOrder) && (
                    <button className="bnc-btn bnc-btn-green bnc-btn-sm flex-grow-1" disabled={!!busy}
                      onClick={() => runAction('mark_paid', selectedOrder)}>
                      <BiCheckCircle /> Xác nhận đã thanh toán
                    </button>
                  )}
                  {canRedeliver(selectedOrder) && (
                    <button className="bnc-btn bnc-btn-sm flex-grow-1" disabled={!!busy}
                      onClick={() => runAction('redeliver', selectedOrder)}>
                      <BiPackage /> Giao lại vật phẩm
                    </button>
                  )}
                  {canCancel(selectedOrder) && (
                    <button className="bnc-btn bnc-btn-red bnc-btn-ghost bnc-btn-sm" disabled={!!busy}
                      onClick={() => runAction('cancel', selectedOrder)}>
                      <BiBlock /> Huỷ đơn
                    </button>
                  )}
                  <button className="bnc-btn bnc-btn-dark bnc-btn-sm" onClick={() => setSelectedOrder(null)}>Đóng</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopOrdersManagement;
