import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { BiSearch, BiEdit, BiTrash, BiCheck, BiX, BiRefresh } from 'react-icons/bi';
import { StatusBadge, useToast } from './ui';
import { mcHead } from '../lib/api';

const UserManagement = () => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', role: 'user', new_password: '' });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast('Không tải được danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({ username: user.username || '', role: user.role || 'user', new_password: '' });
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    const pwd = editForm.new_password.trim();
    if (pwd && pwd.length < 6) {
      toast('Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username: editForm.username.trim(), role: editForm.role })
        .eq('id', editingUser.id);
      if (profileError) throw profileError;

      if (pwd) {
        const { data: result, error: passwordError } = await supabase.rpc('admin_force_update_password', {
          p_user_id: editingUser.id,
          p_new_password: pwd,
        });
        if (passwordError) throw passwordError;
        if (!result?.success) throw new Error(result?.message || 'Không đổi được mật khẩu');
      }

      toast('Đã cập nhật thành viên', 'success');
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast('Lỗi: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Xoá người dùng "${user.username}"? Thao tác này KHÔNG THỂ hoàn tác.`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', user.id);
    if (error) {
      toast('Lỗi: ' + error.message, 'error');
      return;
    }
    toast('Đã xoá người dùng', 'success');
    fetchUsers();
  };

  const q = searchTerm.toLowerCase();
  const filteredUsers = users.filter((u) =>
    (roleFilter === 'all' || (u.role || 'user') === roleFilter)
    && ((u.username || '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q)));

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Thành viên</h2>
          <p>{users.length} tài khoản • {users.filter((u) => u.role === 'admin').length} quản trị viên</p>
        </div>
        <button className="bnc-icon-btn" onClick={fetchUsers} aria-label="Làm mới"><BiRefresh size={18} /></button>
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div className="bnc-chip-row">
          {[['all', 'Tất cả'], ['user', 'Người chơi'], ['admin', 'Quản trị']].map(([id, label]) => (
            <button key={id} className={`bnc-chip ${roleFilter === id ? 'active' : ''}`} onClick={() => setRoleFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="position-relative">
          <BiSearch className="position-absolute text-dim" style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="bnc-input py-2" style={{ paddingLeft: 34, width: 280 }} placeholder="Tìm theo username hoặc ID..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bnc-card">
        <div className="table-responsive">
          <table className="bnc-admin-table">
            <thead>
              <tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Ngày tạo</th><th className="text-end">Thao tác</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="bnc-empty"><div className="spinner-border text-primary" /></td></tr>
              ) : filteredUsers.length > 0 ? filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <img className="avatar" src={mcHead(u.username, 32)} alt="" />
                      <span className="fw-bold">{u.username}</span>
                    </div>
                  </td>
                  <td className="small text-soft">{u.full_name || '—'}</td>
                  <td>
                    <StatusBadge status={u.role === 'admin' ? 'pending' : 'paid'} label={u.role === 'admin' ? 'Quản trị' : 'Người chơi'} />
                  </td>
                  <td className="small text-soft">{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <button className="bnc-icon-btn" onClick={() => handleEdit(u)} aria-label="Sửa"><BiEdit /></button>
                      <button className="bnc-icon-btn danger" onClick={() => handleDelete(u)} aria-label="Xoá"><BiTrash /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="bnc-empty">Không tìm thấy người dùng</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {editingUser && (
          <div className="bnc-overlay" onClick={() => setEditingUser(null)}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bnc-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>Sửa thành viên</h3>
                <button className="bnc-x" onClick={() => setEditingUser(null)} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <div className="bnc-modal-body">
                <div className="d-flex align-items-center gap-3 mb-4">
                  <img src={mcHead(editForm.username, 64)} alt="" width="56" height="56" className="rounded-3" />
                  <div className="min-w-0">
                    <div className="fw-black fs-5 text-truncate">{editForm.username || '—'}</div>
                    <div className="small text-dim text-truncate">ID: {editingUser.id}</div>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Username</label>
                  <input type="text" className="bnc-input" value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                  <div className="bnc-help">Lưu ý: đổi username không đổi tên đăng nhập của tài khoản.</div>
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Vai trò</label>
                  <select className="bnc-select" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    <option value="user">Người chơi</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="bnc-label">Mật khẩu mới</label>
                  <input type="password" className="bnc-input" value={editForm.new_password}
                    onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })} placeholder="Bỏ trống nếu không đổi" />
                  <div className="bnc-help">Tối thiểu 6 ký tự.</div>
                </div>
                <div className="d-flex gap-2">
                  <button className="bnc-btn flex-grow-1" onClick={handleUpdate} disabled={saving}>
                    <BiCheck /> {saving ? 'Đang lưu...' : 'Cập nhật'}
                  </button>
                  <button className="bnc-btn bnc-btn-dark" onClick={() => setEditingUser(null)}>Huỷ</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;
