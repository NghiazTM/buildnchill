import { Link, useParams } from 'react-router-dom';
import { BiArrowBack } from 'react-icons/bi';
import { PageHero, Seo } from '../components/ui';
import OrderTracker from '../components/OrderTracker';

const OrderStatus = () => {
  const { id } = useParams();
  return (
    <>
      <Seo title="Theo dõi đơn hàng" />
      <PageHero
        pill="Đơn hàng"
        title="Theo dõi"
        highlight="đơn hàng"
        subtitle="Trang tự động cập nhật trạng thái thanh toán và giao vật phẩm. Bạn có thể lưu lại đường dẫn này."
        crumbs={[{ label: 'Cửa hàng', to: '/shop' }, { label: 'Đơn hàng' }]}
      />
      <section className="bnc-section pt-4">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="bnc-card bnc-card-pad">
            <OrderTracker orderId={id} />
          </div>
          <div className="text-center mt-4">
            <Link to="/shop" className="bnc-btn bnc-btn-dark bnc-btn-sm"><BiArrowBack /> Về cửa hàng</Link>
          </div>
        </div>
      </section>
    </>
  );
};

export default OrderStatus;
