import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { BiWallet, BiPlus, BiMinus, BiSearch, BiHistory, BiRefresh, BiUser } from 'react-icons/bi';
import { useToast } from './ui';
import { formatVnd, mcHead } from '../lib/api';

const TX_TYPE = {
  recharge: 'Nạp tiền',
  purchase: 'Mua hàng',
  admin_adjustment: 'Admin điều chỉnh',
  refund: 'Hoàn tiền',
};

const WalletManagement = () => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [saving, setSaving] = useState(false);
  const selectedRef = useRef(null);
  selectedRef.current = selectedUser;

  const fetchTransactions = useCallback(async (walletId) => {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setTransactions(data || []);
  }, []);

  const fetchUsers = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, role, wallets ( id, balance, user_id )')
        .order('username');
      if (error) throw error;

      const processed = (data || []).map((u) => {
        const w = Array.isArray(u.wallets) ? u.wallets[0] : u.wallets;
        return { ...u, display_balance: w?.balance || 0, wallet_id: w?.id || null };
      });
      setUsers(processed);

      const current = selectedRef.current;
      if (current) {
        const updated = processed.find((u) => u.id === current.id);
        if (updated && updated.display_balance !== current.display_balance) {
          setSelectedUser(updated);
          if (updated.wallet_id) fetchTransactions(updated.wallet_id);
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast('Không tải được danh sách ví', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [fetchTransactions, toast]);

  useEffect(() => {
    fetchUsers(true);
    const walletChannel = supabase.channel('admin_wallet_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => fetchUsers(false))
      .subscribe();
    const handleUpdate = () => fetchUsers(false);
    window.addEventListener('wallet_updated', handleUpdate);
    return () => {
      window.removeEventListener('wallet_updated', handleUpdate);
      supabase.removeChannel(walletChannel);
    };
  }, [fetchUsers]);

  const selectUser = (user) => {
    setSelectedUser(user);
    setTransactions([]);
    if (user.wallet_id) fetchTransactions(user.wallet_id);
  };

  const handleAdjustBalance = async (type) => {
    const amount = parseInt(adjustAmount, 10);
    if (!selectedUser || !amount || amount <= 0 || !adjustReason.trim()) {
      toast('Nhập số tiền hợp lệ và lý do điều chỉnh', 'error');
      return;
    }
    const finalAmount = type === 'plus' ? amount : -amount;
    if (!window.confirm(`${type === 'plus' ? 'Cộng' : 'Trừ'} ${formatVnd(amount)} ${type === 'plus' ? 'vào' : 'khỏi'} ví của ${selectedUser.username}?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_adjust_balance', {
        p_user_id: selectedUser.id,
        p_amount: finalAmount,
        p_type: 'admin_adjustment',
        p_note: adjustReason.trim(),
      });
      if (error) throw error;
      toast(`Đã ${type === 'plus' ? 'cộng' : 'trừ'} ${formatVnd(amount)}`, 'success');
      setAdjustAmount('');
      setAdjustReason('');
      fetchUsers(false);
      if (selectedUser.wallet_id) fetchTransactions(selectedUser.wallet_id);
    } catch (error) {
      toast('Lỗi: ' + (error.message === 'Insufficient balance' ? 'Số dư không đủ để trừ' : error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter((u) => (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const totalBalance = users.reduce((s, u) => s + Number(u.display_balance || 0), 0);

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Ví người dùng</h2>
          <p>Tổng số dư toàn hệ thống: <b className="text-accent">{formatVnd(totalBalance)}</b></p>
        </div>
        <button className="bnc-icon-btn" onClick={() => fetchUsers(true)} aria-label="Làm mới"><BiRefresh size={18} /></button>
      </div>

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="bnc-card bnc-card-pad h-100">
            <div className="position-relative mb-3">
              <BiSearch className="position-absolute text-dim" style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input type="text" className="bnc-input" style={{ paddingLeft: 34 }} placeholder="Tìm tài khoản..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="overflow-auto pe-1 d-flex flex-column gap-2" style={{ maxHeight: 480 }}>
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
              ) : filteredUsers.length > 0 ? filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`bnc-pay-option py-2 ${selectedUser?.id === u.id ? 'active' : ''}`}
                  onClick={() => selectUser(u)}
                >
                  <img src={mcHead(u.username, 32)} alt="" width="32" height="32" className="rounded-2" />
                  <span className="fw-bold flex-grow-1 text-truncate">
                    {u.username}
                    {u.role === 'admin' && <span className="ms-2 small text-accent">ADMIN</span>}
                  </span>
                  <span className="fw-black text-accent">{formatVnd(u.display_balance)}</span>
                </button>
              )) : (
                <div className="bnc-empty py-4">Không tìm thấy tài khoản</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div
                key={selectedUser.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="d-flex flex-column gap-3"
              >
                <div className="bnc-card bnc-card-pad">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <img src={mcHead(selectedUser.username, 64)} alt="" width="52" height="52" className="rounded-3" />
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-black fs-5 text-truncate">{selectedUser.username}</div>
                      <div className="small text-soft"><BiWallet className="me-1" />Số dư hiện tại</div>
                    </div>
                    <div className="fw-black fs-3 text-accent">{formatVnd(selectedUser.display_balance)}</div>
                  </div>

                  <div className="row g-3 mb-3">
                    <div className="col-md-5">
                      <label className="bnc-label">Số tiền (VNĐ)</label>
                      <input type="number" min="1" className="bnc-input" value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)} placeholder="VD: 50000" />
                    </div>
                    <div className="col-md-7">
                      <label className="bnc-label">Lý do</label>
                      <input className="bnc-input" value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)} placeholder="VD: Hoàn tiền, thưởng sự kiện..." />
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="bnc-btn bnc-btn-green flex-grow-1" disabled={saving} onClick={() => handleAdjustBalance('plus')}>
                      <BiPlus /> Cộng tiền
                    </button>
                    <button className="bnc-btn bnc-btn-red bnc-btn-ghost flex-grow-1" disabled={saving} onClick={() => handleAdjustBalance('minus')}>
                      <BiMinus /> Trừ tiền
                    </button>
                  </div>
                </div>

                <div className="bnc-card">
                  <h6 className="fw-black p-3 pb-0 m-0 d-flex align-items-center gap-2"><BiHistory className="text-accent" /> Giao dịch gần đây</h6>
                  <div className="table-responsive">
                    <table className="bnc-admin-table">
                      <thead>
                        <tr><th>Thời gian</th><th>Loại</th><th className="text-end">Biến động</th><th className="text-end">Số dư sau</th><th>Ghi chú</th></tr>
                      </thead>
                      <tbody>
                        {transactions.length > 0 ? transactions.map((t) => (
                          <tr key={t.id}>
                            <td className="small text-soft text-nowrap">{new Date(t.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td className="small">{TX_TYPE[t.type] || t.type}</td>
                            <td className={`text-end fw-black ${t.amount > 0 ? 'text-success' : 'text-danger'}`}>
                              {t.amount > 0 ? '+' : ''}{formatVnd(t.amount)}
                            </td>
                            <td className="text-end small">{formatVnd(t.balance_after)}</td>
                            <td className="small text-soft text-truncate" style={{ maxWidth: 200 }} title={t.note}>{t.note}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan="5" className="bnc-empty">Chưa có giao dịch</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="bnc-card bnc-card-pad h-100 d-flex flex-column align-items-center justify-content-center text-center text-dim" style={{ minHeight: 260 }}>
                <BiUser size={54} className="mb-3" />
                <p className="fw-bold m-0">Chọn một tài khoản để xem lịch sử và điều chỉnh số dư.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default WalletManagement;
