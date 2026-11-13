import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiSend, BiImageAdd, BiX, BiEnvelope, BiTime, BiHelpCircle } from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { PageHero, Seo, useToast } from '../components/ui';
import '../styles/pages.css';

const categories = [
  { value: 'payment', label: 'Thanh toán / Nạp tiền' },
  { value: 'report', label: 'Báo cáo người chơi (Report)' },
  { value: 'help', label: 'Hỗ trợ tài khoản (Help)' },
  { value: 'bug', label: 'Báo lỗi kỹ thuật (Bug)' },
  { value: 'suggestion', label: 'Đóng góp ý tưởng (Suggestion)' },
  { value: 'other', label: 'Vấn đề khác (Other)' },
];

const emptyForm = { ign: '', email: '', phone: '', category: '', message: '', image: null };

const Contact = () => {
  const { submitContact, siteSettings } = useData();
  const toast = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Vui lòng chọn file ảnh!', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Kích thước ảnh không được vượt quá 10MB!', 'error');
      return;
    }
    setFormData({ ...formData, image: file });
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData({ ...formData, image: null });
    setImagePreview(null);
    const fileInput = document.getElementById('image');
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.category) {
      toast('Vui lòng chọn danh mục hỗ trợ', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const selectedCategory = categories.find((cat) => cat.value === formData.category);
      const success = await submitContact({
        ...formData,
        subject: selectedCategory ? selectedCategory.label : 'Liên hệ mới',
      });
      if (success) {
        toast('Đã gửi yêu cầu! Đội ngũ hỗ trợ sẽ phản hồi bạn sớm nhất.', 'success', 4500);
        setFormData(emptyForm);
        setImagePreview(null);
        const fileInput = document.getElementById('image');
        if (fileInput) fileInput.value = '';
      } else {
        toast('Có lỗi khi gửi yêu cầu. Vui lòng thử lại hoặc liên hệ Admin qua Discord.', 'error', 4500);
      }
    } catch (error) {
      console.error('Error submitting contact:', error);
      toast(`Lỗi hệ thống: ${error.message || 'Không thể kết nối máy chủ.'}`, 'error', 4500);
    } finally {
      setSubmitting(false);
    }
  };

  const infoCards = [
    {
      icon: FaDiscord,
      title: 'Discord cộng đồng',
      text: 'Kênh hỗ trợ nhanh nhất — mở ticket và trò chuyện trực tiếp với đội ngũ.',
      action: (
        <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-discord bnc-btn-sm">
          <FaDiscord /> Tham gia Discord
        </a>
      ),
    },
    siteSettings?.contact_email && {
      icon: BiEnvelope,
      title: 'Email',
      text: <a href={`mailto:${siteSettings.contact_email}`}>{siteSettings.contact_email}</a>,
    },
    { icon: BiTime, title: 'Thời gian phản hồi', text: 'Thường trong vòng 1–12 giờ. Vấn đề thanh toán được ưu tiên xử lý trước.' },
    {
      icon: BiHelpCircle,
      title: 'Câu hỏi thường gặp',
      text: 'Có thể câu trả lời bạn cần đã có sẵn.',
      action: <Link to="/faq" className="bnc-btn bnc-btn-ghost bnc-btn-sm">Xem FAQ</Link>,
    },
  ].filter(Boolean);

  return (
    <>
      <Seo title="Hỗ trợ & Liên hệ" description="Liên hệ đội ngũ BuildnChill: báo cáo người chơi, báo lỗi, hỗ trợ thanh toán và tài khoản." path="/contact" />
      <PageHero
        pill="Hỗ trợ"
        title="Trung tâm"
        highlight="hỗ trợ"
        subtitle="Gặp vấn đề trong game, thanh toán hay tài khoản? Gửi yêu cầu, đội ngũ BuildnChill sẽ phản hồi sớm nhất."
        crumbs={[{ label: 'Liên hệ' }]}
      />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4">
            <motion.div className="col-lg-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <form onSubmit={handleSubmit} className="bnc-card bnc-card-pad">
                <h2 className="h4 fw-black mb-1">Gửi yêu cầu hỗ trợ</h2>
                <p className="text-soft small mb-4">Các trường có dấu * là bắt buộc.</p>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="bnc-label" htmlFor="ign">Tên trong game (IGN) *</label>
                    <input id="ign" name="ign" type="text" className="bnc-input" required value={formData.ign} onChange={handleChange} placeholder="Steve_123" />
                  </div>
                  <div className="col-md-4">
                    <label className="bnc-label" htmlFor="email">Email *</label>
                    <input id="email" name="email" type="email" className="bnc-input" required value={formData.email} onChange={handleChange} placeholder="ban@email.com" />
                  </div>
                  <div className="col-md-4">
                    <label className="bnc-label" htmlFor="phone">Số điện thoại (Zalo)</label>
                    <input id="phone" name="phone" type="tel" className="bnc-input" value={formData.phone} onChange={handleChange} placeholder="Không bắt buộc" />
                  </div>

                  <div className="col-12">
                    <span className="bnc-label">Danh mục *</span>
                    <div className="bnc-cat-grid" role="radiogroup" aria-label="Danh mục hỗ trợ">
                      {categories.map((c) => (
                        <button
                          type="button"
                          key={c.value}
                          role="radio"
                          aria-checked={formData.category === c.value}
                          className={`bnc-cat ${formData.category === c.value ? 'active' : ''}`}
                          onClick={() => setFormData({ ...formData, category: c.value })}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="col-12">
                    <label className="bnc-label" htmlFor="message">Nội dung *</label>
                    <textarea
                      id="message"
                      name="message"
                      className="bnc-textarea"
                      rows={6}
                      required
                      value={formData.message}
                      onChange={handleChange}
                      placeholder={formData.category === 'payment' ? 'Mã đơn (BNCxxxxxx), thời gian chuyển khoản, số tiền...' : 'Mô tả chi tiết vấn đề của bạn...'}
                    />
                  </div>

                  <div className="col-12">
                    <span className="bnc-label">Ảnh minh hoạ (tuỳ chọn)</span>
                    {imagePreview ? (
                      <div className="bnc-preview">
                        <img src={imagePreview} alt="Ảnh đính kèm" />
                        <button type="button" className="bnc-x" onClick={handleRemoveImage} aria-label="Xoá ảnh"><BiX size={20} /></button>
                      </div>
                    ) : (
                      <label htmlFor="image" className="bnc-upload">
                        <BiImageAdd size={32} className="text-accent" />
                        <span className="fw-bold">Nhấn để chọn ảnh</span>
                        <span className="small text-dim">PNG, JPG — tối đa 10MB (biên lai, ảnh chụp màn hình...)</span>
                      </label>
                    )}
                    <input id="image" type="file" accept="image/*" className="d-none" onChange={handleImageChange} />
                  </div>

                  <div className="col-12 mt-2">
                    <button type="submit" className="bnc-btn bnc-btn-lg bnc-btn-block" disabled={submitting}>
                      {submitting ? <span className="spinner-border spinner-border-sm" /> : <BiSend size={20} />}
                      {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>

            <div className="col-lg-4">
              <div className="d-flex flex-column gap-3">
                {infoCards.map((c, i) => (
                  <motion.div
                    key={c.title}
                    className="bnc-card bnc-card-hover p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * i }}
                  >
                    <div className="d-flex gap-3">
                      <span className="bnc-icon-box"><c.icon size={24} /></span>
                      <div className="min-w-0">
                        <div className="fw-black mb-1">{c.title}</div>
                        <div className="text-soft small mb-2">{c.text}</div>
                        {c.action}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Contact;
