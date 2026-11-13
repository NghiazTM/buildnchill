import { Link } from 'react-router-dom';
import { BiHome, BiStore } from 'react-icons/bi';
import { Seo } from '../components/ui';
import '../styles/pages.css';

const NotFound = () => (
  <section className="bnc-auth-wrap">
    <Seo title="Không tìm thấy trang" />
    <div className="container text-center">
      <div className="bnc-404">404</div>
      <h1 className="bnc-heading">Lạc vào <span className="highlight">Nether</span> rồi!</h1>
      <p className="bnc-sub mx-auto mb-4">Trang bạn tìm không tồn tại hoặc đã bị di chuyển. Quay về nơi an toàn nhé.</p>
      <div className="d-flex flex-wrap justify-content-center gap-2">
        <Link to="/" className="bnc-btn"><BiHome /> Về trang chủ</Link>
        <Link to="/shop" className="bnc-btn bnc-btn-ghost"><BiStore /> Cửa hàng</Link>
      </div>
    </div>
  </section>
);

export default NotFound;
