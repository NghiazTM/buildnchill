import { BiLinkExternal, BiMap } from 'react-icons/bi';
import { PageHero, Seo, Spinner } from '../components/ui';
import { useConfig } from '../lib/community';
import '../styles/pages.css';

const WorldMap = () => {
  const cfg = useConfig('map');
  const url = cfg?.url || '';
  const insecure = url.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <>
      <Seo title="Bản đồ thế giới" description="Bản đồ thế giới trực tiếp của máy chủ Minecraft BuildnChill — xem công trình và vị trí người chơi." path="/map" />
      <PageHero pill="Cộng đồng" title="Bản đồ" highlight="thế giới" subtitle={cfg?.note || 'Bay quanh thế giới BuildnChill ngay trên trình duyệt — xem công trình và người chơi đang ở đâu.'} crumbs={[{ label: 'Bản đồ' }]} />
      <section className="bnc-section pt-4">
        <div className="container">
          {cfg === undefined ? <Spinner /> : !url ? (
            <div className="bnc-card bnc-empty"><BiMap size={28} className="d-block mx-auto mb-2 text-dim" />Bản đồ đang được chuẩn bị, quay lại sau nhé!</div>
          ) : (
            <>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div className="small text-soft">Kéo để di chuyển, cuộn để phóng to. Bản đồ tự cập nhật theo thế giới trong game.</div>
                <a className="bnc-btn bnc-btn-sm bnc-btn-ghost" href={url} target="_blank" rel="noopener noreferrer"><BiLinkExternal /> Mở toàn màn hình</a>
              </div>
              {insecure ? (
                <div className="bnc-card bnc-empty">Bản đồ dùng địa chỉ <code>http://</code> nên trình duyệt không cho nhúng vào trang. Bấm “Mở toàn màn hình” để xem.</div>
              ) : (
                <div className="bnc-map-frame">
                  <iframe src={url} title="Bản đồ thế giới BuildnChill" loading="lazy" allow="fullscreen" referrerPolicy="no-referrer" />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default WorldMap;
