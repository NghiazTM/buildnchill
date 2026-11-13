import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiPlus } from 'react-icons/bi';
import { FaDiscord } from 'react-icons/fa';
import { useData } from '../context/DataContext';
import { PageHero, Seo } from '../components/ui';
import { FAQS } from '../data/siteContent';
import '../styles/pages.css';

const Faq = () => {
  const { siteSettings } = useData();
  const [open, setOpen] = useState(0);

  return (
    <>
      <Seo title="Câu hỏi thường gặp" description="Giải đáp thắc mắc thường gặp về máy chủ BuildnChill: cách vào server, mua vật phẩm, nạp ví, khiếu nại." path="/faq" />
      <PageHero
        pill="FAQ"
        title="Câu hỏi"
        highlight="thường gặp"
        subtitle="Tổng hợp những thắc mắc phổ biến nhất của người chơi. Không tìm thấy câu trả lời? Liên hệ ngay với chúng tôi."
        crumbs={[{ label: 'FAQ' }]}
      />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4 g-lg-5">
            <div className="col-lg-8">
              {FAQS.map((f, i) => {
                const isOpen = open === i;
                const id = `faq-${i}`;
                return (
                  <motion.div
                    key={f.q}
                    className={`bnc-faq-item ${isOpen ? 'open' : ''}`}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <h2 className="m-0">
                      <button
                        type="button"
                        className="bnc-faq-q"
                        aria-expanded={isOpen}
                        aria-controls={`${id}-a`}
                        id={`${id}-q`}
                        onClick={() => setOpen(isOpen ? -1 : i)}
                      >
                        <span>{f.q}</span>
                        <BiPlus size={22} />
                      </button>
                    </h2>
                    <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} hidden={!isOpen}>
                      <div className="bnc-faq-a">{f.a}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <aside className="col-lg-4">
              <div className="bnc-cta" style={{ position: 'sticky', top: 100 }}>
                <span className="bnc-pill">Cần trợ giúp?</span>
                <h2 className="h4 fw-black mt-3">Vẫn còn thắc mắc?</h2>
                <p className="text-soft small">Đội ngũ hỗ trợ luôn sẵn sàng qua Discord hoặc biểu mẫu liên hệ trên website.</p>
                <div className="d-flex flex-column gap-2">
                  <a href={siteSettings?.discord_url || 'https://discord.gg/buildnchill'} target="_blank" rel="noopener noreferrer" className="bnc-btn bnc-btn-discord bnc-btn-block">
                    <FaDiscord /> Hỏi trên Discord
                  </a>
                  <Link to="/contact" className="bnc-btn bnc-btn-ghost bnc-btn-block">Gửi yêu cầu hỗ trợ</Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
};

export default Faq;
