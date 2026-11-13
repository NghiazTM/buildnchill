import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { BiCheck, BiX, BiSearch, BiImage, BiRefresh } from 'react-icons/bi';
import { StatusBadge, useToast } from './ui';
import { formatVnd, mcHead } from '../lib/api';

const STATUS = {
  pending: { label: 'Chờ duyệt', cls: 'pending' },
  approved: { label: 'Đã duyệt', cls: 'approved' },
  rejected: { label: 'Từ chối', cls: 'rejected' },
};

const FILTERS = [
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'rejected', label: 'Từ chối' },
  { id: 'all', label: 'Tất cả' },
];

const RechargeManagement = () => {
  const toast = useToast();
  const [recharges, setRecharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('approved');
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchRecharges = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('recharges')
        .select('*, user_profile:profiles!user_id ( username )')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filter !== 'all') query = query.eq('status', filter);
      const { data, error } = await query;
      if (error) throw error;
      setRecharges(data || []);
    } catch (error) {
      console.error('Error fetching recharges:', error);
      toast('Không tải được lịch sử nạp tiền', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    fetchRecharges();
    const onUpdate = () => fetchRecharges();
    window.addEventListener('recharge_updated', onUpdate);
    return () => window.removeEventListener('recharge_updated', onUpdate);
  }, [fetchRecharges]);

  const handleAction = async (recharge, status) => {
    const actionText = status === 'approved' ? 'duyệt và cộng tiền cho' : 'từ chối';
    if (!window.confirm(`Bạn có chắc muốn ${actionText} yêu cầu ${formatVnd(recharge.amount)} của ${recharge.user_profile?.username}?`)) return;
    try {
      if (status === 'approved') {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.rpc('approve_recharge', { p_recharge_id: recharge.id, p_admin_id: user.id });
        if (error) throw error;
        toast('Đã duyệt và cộng tiền vào ví', 'success');
      } else {
        const { error } = await supabase.from('recharges').update({ status: 'rejected' }).eq('id', recharge.id);
        if (error) throw error;
        toast('Đã từ chối yêu cầu', 'success');
      }
      fetchRecharges();
    } catch (error) {
      toast('Lỗi: ' + error.message, 'error');
    }
  };

  const filtered = recharges.filter((r) =>
    (r.user_profile?.username || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const total = filtered.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Nạp tiền vào ví</h2>
          <p>Giao dịch SePay (nội dung <code>NAP tên_tài_khoản</code>) được cộng tự động; yêu cầu thủ công chờ duyệt ở đây.</p>
        </div>
        <button className="bnc-icon-btn" onClick={fetchRecharges} aria-label="Làm mới"><BiRefresh size={18} /></button>
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div className="bnc-chip-row">
          {FILTERS.map((s) => (
            <button key={s.id} className={`bnc-chip ${filter === s.id ? 'active' : ''}`} onClick={() => setFilter(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="d-flex gap-3 align-items-center">
          <span className="small text-soft">Tổng đã duyệt: <b className="text-success">{formatVnd(total)}</b></span>
          <div className="position-relative">
            <BiSearch className="position-absolute text-dim" style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="bnc-input py-2" style={{ paddingLeft: 34, width: 220 }} placeholder="Tìm người chơi..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bnc-card">
        <div className="table-responsive">
          <table className="bnc-admin-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người chơi</th>
                <th className="text-end">Số tiền</th>
                <th>Phương thức</th>
                <th className="text-center">Minh chứng</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="bnc-empty"><div className="spinner-border text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7" className="bnc-empty">Không có yêu cầu nạp tiền nào</td></tr>
              ) : filtered.map((r) => {
                const st = STATUS[r.status] || { label: r.status, cls: 'pending' };
                return (
                  <tr key={r.id}>
                    <td className="small text-soft text-nowrap">
                      {new Date(r.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <img className="avatar" src={mcHead(r.user_profile?.username, 32)} alt="" />
                        <span className="fw-bold">{r.user_profile?.username || '—'}</span>
                      </div>
                    </td>
                    <td className="text-end fw-black text-success">{formatVnd(r.amount)}</td>
                    <td><span className="bnc-code">{r.payment_method || '—'}</span></td>
                    <td className="text-center">
                      {r.proof_image ? (
                        <button className="bnc-btn bnc-btn-dark bnc-btn-sm" onClick={() => setSelectedImage(r.proof_image)}>
                          <BiImage /> Xem
                        </button>
                      ) : <span className="text-dim small">—</span>}
                    </td>
                    <td><StatusBadge status={st.cls} label={st.label} /></td>
                    <td className="text-end">
                      {r.status === 'pending' && (
                        <div className="d-inline-flex gap-2">
                          <button className="bnc-icon-btn success" onClick={() => handleAction(r, 'approved')} title="Duyệt"><BiCheck size={18} /></button>
                          <button className="bnc-icon-btn danger" onClick={() => handleAction(r, 'rejected')} title="Từ chối"><BiX size={18} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedImage && (
          <div className="bnc-overlay align-items-center" onClick={() => setSelectedImage(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="position-relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="bnc-x position-absolute" style={{ top: -14, right: -14, zIndex: 2 }} onClick={() => setSelectedImage(null)} aria-label="Đóng">
                <BiX size={20} />
              </button>
              <img src={selectedImage} alt="Minh chứng" className="rounded-4" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', border: '1px solid var(--bnc-border-strong)' }} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RechargeManagement;
