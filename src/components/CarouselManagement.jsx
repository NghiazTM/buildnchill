import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { BiPlus, BiTrash, BiEdit, BiSave, BiX, BiChevronUp, BiChevronDown, BiImageAdd } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { StatusBadge, useToast } from './ui';

const EMPTY = { image_url: '', display_order: 0, is_active: true };

const CarouselManagement = () => {
  const toast = useToast();
  const { carouselImages, addCarouselImage, updateCarouselImage, deleteCarouselImage } = useData();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!imageFile) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const openAdd = () => {
    setEditingId(null);
    setImageFile(null);
    setFormData({ ...EMPTY, display_order: carouselImages.length });
    setShowModal(true);
  };

  const openEdit = (img) => {
    setEditingId(img.id);
    setImageFile(null);
    setFormData({ image_url: img.image_url, display_order: img.display_order, is_active: img.is_active });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setImageFile(null);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Vui lòng chọn file ảnh', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('Kích thước ảnh tối đa 10MB', 'error'); return; }
    setImageFile(file);
  };

  const uploadImage = async () => {
    if (!imageFile) return formData.image_url;
    const fileExt = imageFile.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const { error } = await supabase.storage.from('carousel_images').upload(fileName, imageFile, { cacheControl: '3600', upsert: true });
    if (error) throw new Error('Lỗi tải ảnh: ' + error.message);
    return supabase.storage.from('carousel_images').getPublicUrl(fileName).data.publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile && !formData.image_url.trim()) { toast('Chọn ảnh hoặc dán link ảnh', 'error'); return; }
    setUploading(true);
    try {
      const image_url = await uploadImage();
      const payload = { ...formData, image_url, display_order: Number(formData.display_order) || 0 };
      const ok = editingId ? await updateCarouselImage(editingId, payload) : await addCarouselImage(payload);
      if (ok) {
        toast(editingId ? 'Đã cập nhật ảnh' : 'Đã thêm ảnh vào carousel', 'success');
        closeModal();
      } else {
        toast('Không lưu được ảnh carousel', 'error');
      }
    } catch (error) {
      console.error('Error saving carousel image:', error);
      toast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const moveOrder = async (img, direction) => {
    const newOrder = direction === 'up' ? img.display_order - 1 : img.display_order + 1;
    await updateCarouselImage(img.id, { display_order: newOrder });
  };

  const toggleActive = async (img) => {
    await updateCarouselImage(img.id, { is_active: !img.is_active });
  };

  const handleDelete = async (img) => {
    if (!window.confirm('Xoá ảnh này khỏi carousel?')) return;
    await deleteCarouselImage(img.id);
  };

  const preview = previewUrl || formData.image_url;

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Carousel trang chủ</h2>
          <p>{carouselImages.length} ảnh • {carouselImages.filter((i) => i.is_active).length} đang hiển thị</p>
        </div>
        <button className="bnc-btn bnc-btn-sm" onClick={openAdd}><BiPlus size={18} /> Thêm ảnh</button>
      </div>

      <div className="row g-3">
        {carouselImages.map((img) => (
          <div key={img.id} className="col-md-6 col-xl-4">
            <div className="bnc-card h-100 d-flex flex-column overflow-hidden">
              <div className="position-relative" style={{ height: 180, background: 'var(--bnc-bg-deep)' }}>
                <img src={img.image_url} className="w-100 h-100 object-fit-cover" alt="Carousel"
                  style={{ opacity: img.is_active ? 1 : 0.35 }} />
                <div className="position-absolute top-0 start-0 m-2">
                  <span className="bnc-code">#{img.display_order}</span>
                </div>
              </div>
              <div className="p-3 mt-auto d-flex justify-content-between align-items-center gap-2">
                <button type="button" className="border-0 bg-transparent p-0" onClick={() => toggleActive(img)} title="Bật/tắt hiển thị">
                  <StatusBadge status={img.is_active ? 'delivered' : 'cancelled'} label={img.is_active ? 'Hiển thị' : 'Đang ẩn'} />
                </button>
                <div className="d-flex gap-1">
                  <button className="bnc-icon-btn" onClick={() => moveOrder(img, 'up')} title="Dịch lên"><BiChevronUp size={18} /></button>
                  <button className="bnc-icon-btn" onClick={() => moveOrder(img, 'down')} title="Dịch xuống"><BiChevronDown size={18} /></button>
                  <button className="bnc-icon-btn" onClick={() => openEdit(img)} title="Sửa"><BiEdit /></button>
                  <button className="bnc-icon-btn danger" onClick={() => handleDelete(img)} title="Xoá"><BiTrash /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {carouselImages.length === 0 && (
        <div className="bnc-card bnc-empty">Chưa có ảnh nào trong carousel. Bấm “Thêm ảnh” để bắt đầu.</div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="bnc-overlay" onClick={closeModal}>
            <motion.div
              className="bnc-modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>{editingId ? 'Sửa ảnh carousel' : 'Thêm ảnh carousel'}</h3>
                <button className="bnc-x" onClick={closeModal} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <form className="bnc-modal-body" onSubmit={handleSubmit}>
                <div className="rounded-3 overflow-hidden d-flex align-items-center justify-content-center mb-3"
                  style={{ height: 180, background: 'var(--bnc-bg-deep)', border: '1px dashed var(--bnc-border-strong)' }}>
                  {preview ? (
                    <img src={preview} alt="Preview" className="w-100 h-100 object-fit-cover" />
                  ) : (
                    <div className="text-center text-dim"><BiImageAdd size={34} /><div className="small">Xem trước</div></div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Tải ảnh lên</label>
                  <input type="file" className="bnc-input" accept="image/*" onChange={handleImageChange} />
                  <div className="bnc-help">Tối đa 10MB. Khuyến nghị tỉ lệ 16:9.</div>
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Hoặc link ảnh</label>
                  <input type="text" className="bnc-input" placeholder="https://..." value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} disabled={!!imageFile} />
                </div>
                <div className="row g-3 mb-4 align-items-end">
                  <div className="col-6">
                    <label className="bnc-label">Thứ tự hiển thị</label>
                    <input type="number" className="bnc-input" value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <div className="col-6">
                    <div className="form-check form-switch custom-toggle-switch mb-2">
                      <input className="form-check-input" type="checkbox" role="switch" id="carouselActive"
                        checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                      <label className="form-check-label fw-bold ms-2" htmlFor="carouselActive">Hiển thị</label>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="bnc-btn flex-grow-1" disabled={uploading}>
                    <BiSave /> {uploading ? 'Đang lưu...' : 'Lưu ảnh'}
                  </button>
                  <button type="button" className="bnc-btn bnc-btn-dark" onClick={closeModal}>Huỷ</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CarouselManagement;
