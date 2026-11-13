import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BiPlus, BiEdit, BiTrash, BiX, BiPackage } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import RichTextEditor from './RichTextEditor';
import { StatusBadge, useToast } from './ui';
import { formatVnd } from '../lib/api';

const EMPTY = {
  name: '', description: '', image_url: '', command: '', price: 0, display_price: '',
  category_id: '', display_order: 0, active: true,
};

const ShopProductsManagement = () => {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterCat, setFilterCat] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY);

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });
    if (error) {
      toast('Lỗi tải sản phẩm: ' + error.message, 'error');
      return;
    }
    setProducts(data || []);
  }, [toast]);

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_deleted', false)
      .order('display_order');
    if (error) {
      toast('Lỗi tải danh mục: ' + error.message, 'error');
      return;
    }
    setCategories(data || []);
  }, [toast]);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [loadProducts, loadCategories]);

  const handleAddNew = () => {
    setEditingProduct(null);
    setImageFile(null);
    setFormData({
      ...EMPTY,
      category_id: filterCat !== 'all' ? filterCat : categories[0]?.id || '',
      display_order: products.length,
    });
    setShowModal(true);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setImageFile(null);
    setFormData({
      name: product.name,
      description: product.description || '',
      image_url: product.image_url || '',
      command: product.command || '',
      price: Math.round(Number(product.price || 0)),
      display_price: product.display_price || '',
      category_id: product.category_id || '',
      display_order: product.display_order || 0,
      active: product.active !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Xoá sản phẩm "${product.name}"?`)) return;
    const { error } = await supabase.from('products').update({ is_deleted: true }).eq('id', product.id);
    if (error) {
      toast('Lỗi xoá sản phẩm: ' + error.message, 'error');
      return;
    }
    toast('Đã xoá sản phẩm', 'success');
    loadProducts();
  };

  const toggleActive = async (product) => {
    const { error } = await supabase.from('products').update({ active: !product.active }).eq('id', product.id);
    if (error) {
      toast('Không cập nhật được: ' + error.message, 'error');
      return;
    }
    loadProducts();
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Vui lòng chọn file ảnh', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Kích thước ảnh tối đa 10MB', 'error');
      return;
    }
    setImageFile(file);
  };

  const uploadImage = async () => {
    if (!imageFile) return formData.image_url;
    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(fileName, imageFile, { cacheControl: '3600', upsert: true });
      if (uploadError) throw new Error('Lỗi tải ảnh sản phẩm: ' + uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
      return publicUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const price = Number(formData.price);
    if (!Number.isInteger(price) || price < 1000) {
      toast('Giá phải là số nguyên VNĐ, tối thiểu 1.000đ', 'error');
      return;
    }
    const command = formData.command
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
    if (!command) {
      toast('Vui lòng nhập ít nhất 1 lệnh giao vật phẩm', 'error');
      return;
    }

    setSaving(true);
    try {
      const finalImageUrl = await uploadImage();
      const payload = { ...formData, price, command, image_url: finalImageUrl, category_id: formData.category_id || null };

      const { error } = editingProduct
        ? await supabase.from('products').update(payload).eq('id', editingProduct.id)
        : await supabase.from('products').insert([{ ...payload, is_deleted: false }]);
      if (error) throw error;

      toast(editingProduct ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm mới', 'success');
      setShowModal(false);
      loadProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast('Lỗi lưu sản phẩm: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const visible = filterCat === 'all' ? products : products.filter((p) => p.category_id === filterCat);

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Sản phẩm cửa hàng</h2>
          <p>Mỗi sản phẩm có danh sách lệnh console được plugin thực thi khi giao hàng.</p>
        </div>
        <button className="bnc-btn bnc-btn-sm" onClick={handleAddNew}><BiPlus size={18} /> Thêm sản phẩm</button>
      </div>

      <div className="bnc-chip-row mb-3">
        <button className={`bnc-chip ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>
          Tất cả <span className="n">{products.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c.id} className={`bnc-chip ${filterCat === c.id ? 'active' : ''}`} onClick={() => setFilterCat(c.id)}>
            {c.name} <span className="n">{products.filter((p) => p.category_id === c.id).length}</span>
          </button>
        ))}
      </div>

      <div className="bnc-card">
        <div className="table-responsive">
          <table className="bnc-admin-table">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Tên sản phẩm</th>
                <th>Danh mục</th>
                <th className="text-end">Giá bán</th>
                <th className="text-center">Lệnh</th>
                <th className="text-center">Thứ tự</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="rounded-3 p-1 d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: 'var(--bnc-bg-deep)', border: '1px solid var(--bnc-border)' }}>
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="w-100 h-100 object-fit-contain" />
                        : <BiPackage size={22} className="text-dim" />}
                    </div>
                  </td>
                  <td className="fw-bold">{p.name}</td>
                  <td className="small text-soft">{p.categories?.name || '—'}</td>
                  <td className="text-end">
                    <div className="fw-black text-accent">{formatVnd(p.price)}</div>
                    {p.display_price && <div className="small text-dim">{p.display_price}</div>}
                  </td>
                  <td className="text-center small text-soft">{(p.command || '').split(/\r?\n/).filter(Boolean).length}</td>
                  <td className="text-center fw-bold">{p.display_order}</td>
                  <td>
                    <button className="border-0 bg-transparent p-0" onClick={() => toggleActive(p)} title="Bật/tắt bán">
                      <StatusBadge status={p.active ? 'delivered' : 'cancelled'} label={p.active ? 'Đang bán' : 'Đang ẩn'} />
                    </button>
                  </td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <button className="bnc-icon-btn" onClick={() => handleEdit(p)} aria-label="Sửa"><BiEdit /></button>
                      <button className="bnc-icon-btn danger" onClick={() => handleDelete(p)} aria-label="Xoá"><BiTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan="8" className="bnc-empty">Chưa có sản phẩm</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="bnc-overlay" onClick={() => setShowModal(false)}>
            <motion.div
              className="bnc-modal bnc-modal-lg"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h3>
                <button className="bnc-x" onClick={() => setShowModal(false)} aria-label="Đóng"><BiX size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="bnc-modal-body">
                <div className="row g-3 mb-3">
                  <div className="col-md-7">
                    <div className="mb-3">
                      <label className="bnc-label">Tên sản phẩm</label>
                      <input type="text" className="bnc-input" value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                    </div>
                    <div className="mb-3">
                      <label className="bnc-label">Danh mục</label>
                      <select className="bnc-select" value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} required>
                        <option value="">Chọn danh mục</option>
                        {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                    <div className="row g-3">
                      <div className="col-6">
                        <label className="bnc-label">Giá (VNĐ)</label>
                        <input type="number" className="bnc-input" value={formData.price} min="1000" step="1000"
                          onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? '' : Number(e.target.value) })} required />
                        <div className="bnc-help">Số nguyên, tối thiểu 1.000đ</div>
                      </div>
                      <div className="col-6">
                        <label className="bnc-label">Thứ tự hiển thị</label>
                        <input type="number" className="bnc-input" value={formData.display_order}
                          onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value, 10) || 0 })} />
                      </div>
                    </div>
                  </div>
                  <div className="col-md-5">
                    <label className="bnc-label">Ảnh sản phẩm</label>
                    <div className="bnc-product-media mb-2" style={{ height: 140 }}>
                      {(imageFile || formData.image_url)
                        ? <img src={imageFile ? URL.createObjectURL(imageFile) : formData.image_url} alt="Xem trước" />
                        : <div className="text-center text-dim"><BiPackage size={36} /><div className="small">Chưa có ảnh</div></div>}
                    </div>
                    <input type="file" className="form-control form-control-sm mb-2" accept="image/*" onChange={handleImageChange} />
                    <input type="url" className="bnc-input py-2 small" value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="Hoặc dán URL ảnh..." />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="bnc-label">Lệnh giao vật phẩm (console)</label>
                  <textarea
                    className="bnc-textarea"
                    rows="4"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '.85rem' }}
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    placeholder={'lp user {username} parent set vip\ngive {username} diamond 64'}
                    required
                  />
                  <div className="bnc-help">
                    Mỗi dòng 1 lệnh console. Placeholder: <code>{'{username}'}</code> <code>{'{player}'}</code> <code>{'{uuid}'}</code>.
                    Ví dụ: <code>{'lp user {username} parent set vip'}</code>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="bnc-label">Nhãn giá hiển thị (tuỳ chọn)</label>
                  <input type="text" className="bnc-input" value={formData.display_price}
                    onChange={(e) => setFormData({ ...formData, display_price: e.target.value })} placeholder="VD: Giảm 20% • Vĩnh viễn" />
                </div>

                <div className="mb-3">
                  <label className="bnc-label">Mô tả chi tiết</label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(val) => setFormData((f) => ({ ...f, description: val }))}
                    placeholder="Mô tả các tính năng, quyền lợi của sản phẩm..."
                  />
                </div>

                <div className="form-check form-switch custom-toggle-switch mb-4">
                  <input className="form-check-input" type="checkbox" role="switch" id="productActive"
                    checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />
                  <label className="form-check-label fw-bold ms-2" htmlFor="productActive">Sản phẩm đang được bán</label>
                </div>

                <div className="d-flex gap-2">
                  <button type="submit" className="bnc-btn flex-grow-1" disabled={uploading || saving}>
                    {uploading ? 'Đang tải ảnh...' : saving ? 'Đang lưu...' : editingProduct ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm'}
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

export default ShopProductsManagement;
