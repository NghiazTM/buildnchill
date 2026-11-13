import { Link } from 'react-router-dom';
import { BiCopy } from 'react-icons/bi';
import { useData } from '../context/DataContext';
import { useCopy } from './ui';

// Dải thông báo phía trên menu (theo phong cách Sunstone)
const TopBar = () => {
  const { siteSettings, serverStatus } = useData();
  const copy = useCopy();
  const ip = siteSettings?.server_ip || 'buildnchill.id.vn';
  const online = serverStatus?.status === 'Online';

  return (
    <div className="bnc-strip">
      <div className="container bnc-strip-inner">
        <span className="d-none d-md-inline">
          ⚡ Mua vật phẩm — giao tự động vào game chỉ trong vài giây! <Link to="/shop" className="text-decoration-underline">Ghé cửa hàng →</Link>
        </span>
        <span className="d-flex align-items-center gap-3 ms-auto">
          <span className="text-nowrap">{online ? <>● {serverStatus?.players || 0}<span className="d-none d-sm-inline"> người đang chơi</span><span className="d-sm-none"> online</span></> : <>● <span className="d-none d-sm-inline">Máy chủ đang </span>bảo trì</>}</span>
          <button className="text-nowrap text-truncate" style={{ maxWidth: '62vw' }} onClick={() => copy(ip, 'Đã sao chép IP máy chủ')} title="Sao chép IP">
            <BiCopy className="me-1" />{ip}
          </button>
        </span>
      </div>
    </div>
  );
};

export default TopBar;
