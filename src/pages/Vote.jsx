import { BiLinkExternal, BiLike } from 'react-icons/bi';
import { PageHero, Seo, Spinner } from '../components/ui';
import { useConfig } from '../lib/community';
import '../styles/pages.css';

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const Vote = () => {
  const cfg = useConfig('vote');
  const sites = (cfg?.sites || []).filter((s) => s?.url);

  return (
    <>
      <Seo title="Bình chọn cho server" description="Vote cho máy chủ Minecraft BuildnChill trên các trang xếp hạng server để giúp cộng đồng ngày càng đông vui." path="/vote" />
      <PageHero pill="Cộng đồng" title="Bình chọn" highlight="cho server" subtitle={cfg?.note || 'Mỗi lượt vote giúp BuildnChill lên top các trang xếp hạng server, để nhiều bạn mới tìm thấy chúng ta hơn. Cảm ơn bạn!'} crumbs={[{ label: 'Bình chọn' }]} />
      <section className="bnc-section pt-5">
        <div className="container" style={{ maxWidth: 880 }}>
          {cfg === undefined ? <Spinner /> : sites.length === 0 ? (
            <div className="bnc-card bnc-empty">Chưa có trang bình chọn nào. Quay lại sau nhé!</div>
          ) : (
            <div className="bnc-vote">
              {sites.map((s, i) => (
                <a key={`${s.url}-${i}`} className="bnc-card bnc-vote-item" href={s.url} target="_blank" rel="noopener noreferrer">
                  <span className="n">{i + 1}</span>
                  <span className="body">
                    <span className="t">{s.name || hostOf(s.url)}</span>
                    <span className="d">{s.note || hostOf(s.url)}</span>
                  </span>
                  <span className="bnc-btn bnc-btn-sm"><BiLike /> Vote <BiLinkExternal /></span>
                </a>
              ))}
            </div>
          )}
          <div className="small text-dim mt-4 text-center">Mỗi trang thường cho vote 1 lần mỗi 24 giờ. Nhập đúng tên nhân vật nếu trang yêu cầu.</div>
        </div>
      </section>
    </>
  );
};

export default Vote;
