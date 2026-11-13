import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BiPlus, BiEdit, BiTrash, BiX } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { StatusBadge, useToast } from './ui';

const EMPTY = { name: '', description: '', icon: '', display_order: 0, active: true };

const ShopCategoriesManagement = () => {
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });
    if (error) {
      toast('Lỗi tải danh mục: ' + error.message, 'error');
      return;
    }
    setCategories(data || []);
  }, [toast]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleAddNew = () => {
    setEditingCategory(null);
    setFormData({ ...EMPTY, display_order: categories.length });
    setShowModal(true);
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      display_order: category.display_order || 0,
      active: category.active !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Xoá danh mục "${category.name}"?`)) return;
    const { error } = await supabase.from('categories').update({ is_deleted: true }).eq('id', category.id);
    if (error) {
      toast('Lỗi xoá danh mục: ' + error.message, 'error');
      return;
    }
    toast('Đã xoá danh mục', 'success');
    loadCategories();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = editingCategory
        ? await supabase.from('categories').update(formData).eq('id', editingCategory.id)
        : await supabase.from('categories').insert([{ ...formData, is_deleted: false }]);
      if (error) throw error;
      toast(editingCategory ? 'Đã cập nhật danh mục' : 'Đã thêm danh mục', 'success');
      setShowModal(false);
      loadCategories();
    } catch (error) {
      toast('Lỗi lưu danh mục: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Danh mục cửa hàng</h2>
          <p>Nhóm sản phẩm hiển thị thành các tab trên trang Cửa hàng.</p>
        </div>
        <button className="bnc-btn bnc-btn-sm" onClick={handleAddNew}><BiPlus size={18} /> Thêm danh mục</button>
      </div>

      <div className="bnc-card">
        <div className="table-responsive">
          <table className="bnc-admin-table">
            <thead>
              <tr>
                <th>Icon</th>
                <th>Tên danh mục</th>
                <th>Mô tả</th>
                <th className="text-center">Thứ tự</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: 'var(--bnc-bg-deep)', border: '1px solid var(--bnc-border)' }}>
                      <span className="fs-5">{c.icon || '📦'}</span>
                    </div>
                  </td>
                  <td className="fw-bold">{c.name}</td>
                  <td className="small text-soft">{c.description || '—'}</td>
                  <td className="text-center fw-bold">{c.display_order}</td>
                  <td><StatusBadge status={c.active ? 'delivered' : 'cancelled'} label={c.active ? 'Hiển thị' : 'Đang ẩn'} /></td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <button className="bnc-icon-btn" onClick={() => handleEdit(c)} aria-label="Sửa"><BiEdit /></button>
                      <button className="bnc-icon-btn danger" onClick={() => handleDelete(c)} aria-label="Xoá"><BiTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && <tr><td colSpan="6" className="bnc-empty">Chưa có danh mục</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="bnc-overlay" onClick={() => setShowModal(false)}>
            <motion.div
              className="bnc-modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>{editingCategory ? 'Sửa danh mục' : 'Thêm danh mục mới'}</h3>
                <button className="bnc-x" onClick={() => setShowModal(false)} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <form className="bnc-modal-body" onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="bnc-label">Tên danh mục *</label>
                  <input type="text" className="bnc-input" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Mô tả</label>
                  <textarea className="bnc-textarea" rows="3" value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Mô tả ngắn về danh mục này..." />
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Icon / Emoji</label>
                  <div className="d-flex gap-2 align-items-center">
                    <div className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 50, height: 50, background: 'var(--bnc-bg-deep)', border: '1px solid var(--bnc-border)' }}>
                      <span className="fs-4">{formData.icon || '📦'}</span>
                    </div>
                    <input type="text" className="bnc-input" value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="VD: ⚔️ 🛡️ 💎 👑" />
                  </div>
                </div>
                <div className="row g-3 mb-4 align-items-end">
                  <div className="col-6">
                    <label className="bnc-label">Thứ tự hiển thị</label>
                    <input type="number" className="bnc-input" value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div className="col-6">
                    <div className="form-check form-switch custom-toggle-switch mb-2">
                      <input className="form-check-input" type="checkbox" role="switch" id="categoryActive"
                        checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />
                      <label className="form-check-label fw-bold ms-2" htmlFor="categoryActive">Hiển thị</label>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="bnc-btn flex-grow-1" disabled={saving}>
                    {saving ? 'Đang lưu...' : editingCategory ? 'Cập nhật danh mục' : 'Thêm danh mục'}
                  </button>
                  <button type="button" className="bnc-btn bnc-btn-dark" onClick={() => setShowModal(false)}>Huỷ</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopCategoriesManagement;
