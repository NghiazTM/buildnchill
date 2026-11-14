import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BiError } from 'react-icons/bi';
import { PageHero, Seo } from '../components/ui';
import { RULE_GROUPS } from '../data/siteContent';
import '../styles/pages.css';

const anchor = (i) => `rule-group-${i + 1}`;

const Rules = () => {
  const [active, setActive] = useState(anchor(0));

  useEffect(() => {
    const els = RULE_GROUPS.map((_, i) => document.getElementById(anchor(i))).filter(Boolean);
    if (!('IntersectionObserver' in window) || els.length === 0) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-120px 0px -55% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Seo title="Luật máy chủ" description="Luật chơi máy chủ Minecraft BuildnChill: luật chung, gameplay, giao dịch và hình phạt." path="/rules" />
      <PageHero
        pill="Luật"
        title="Luật"
        highlight="máy chủ"
        subtitle="Vui lòng đọc kỹ trước khi tham gia. Khi vào máy chủ, bạn đồng ý tuân thủ toàn bộ các quy định dưới đây."
        crumbs={[{ label: 'Luật máy chủ' }]}
      />

      <section className="bnc-section pt-4">
        <div className="container">
          <div className="row g-4 g-lg-5">
            <aside className="col-lg-3 d-none d-lg-block">
              <nav className="bnc-rules-nav" aria-label="Mục lục luật">
                {RULE_GROUPS.map((g, i) => (
                  <a key={g.title} href={`#${anchor(i)}`} onClick={(e) => goTo(e, anchor(i))} className={active === anchor(i) ? 'active' : ''}>
                    <span className="text-dim">{String(i + 1).padStart(2, '0')}</span> {g.title}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="col-lg-9">
              <div className="d-flex flex-column gap-4">
                {RULE_GROUPS.map((g, gi) => (
                  <motion.div
                    key={g.title}
                    id={anchor(gi)}
                    className="bnc-card bnc-rule-group overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                  >
                    <div className="bnc-rule-head">
                      <span className="bnc-step-num">{gi + 1}</span>
                      <h2>{g.title}</h2>
                    </div>
                    {g.rules.map((r, ri) => (
                      <div key={r} className="bnc-rule">
                        <span className="sq" aria-hidden="true" />
                        <span className="idx">{gi + 1}.{ri + 1}</span>
                        <span className="min-w-0">{r}</span>
                      </div>
                    ))}
                  </motion.div>
                ))}

                <div className="bnc-card-flat p-4 d-flex gap-3 align-items-start">
                  <span className="bnc-icon-box"><BiError size={24} /></span>
                  <div>
                    <div className="fw-black mb-1">Ban quản trị có quyền quyết định cuối cùng</div>
                    <p className="text-soft small mb-2">
                      Luật có thể được cập nhật mà không cần báo trước. Nếu bạn thấy vi phạm hoặc muốn khiếu nại hình phạt,
                      hãy gửi yêu cầu kèm bằng chứng.
                    </p>
                    <Link to="/contact" className="bnc-btn bnc-btn-sm">Gửi báo cáo / khiếu nại</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Rules;
