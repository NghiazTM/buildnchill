import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mcHead } from '../lib/api';

const PREVIEW = 12;

/** Danh sách người chơi đang online (từ nhịp tim plugin, cập nhật realtime). */
const OnlinePlayers = ({ names }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? names : names.slice(0, PREVIEW);
  const more = names.length - shown.length;

  return (
    <div className="bnc-online">
      <div className="feed-head">
        <span>Đang online <b className="bnc-online-count">{names.length}</b></span>
        {names.length > PREVIEW && (
          <button type="button" className="bnc-online-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Thu gọn' : 'Xem tất cả'}
          </button>
        )}
      </div>
      {names.length === 0 ? (
        <div className="feed-empty">Chưa có ai trong game — vào trước để giữ chỗ đẹp nhé.</div>
      ) : (
        <ul className={`bnc-online-list ${open ? 'open' : ''}`}>
          {shown.map((n) => (
            <li key={n} title={`Xem hồ sơ ${n}`}>
              <Link to={`/player/${encodeURIComponent(n)}`}>
                <img src={mcHead(n.replace(/^[.*]/, ''), 32)} alt="" loading="lazy" width="22" height="22" />
                <span>{n}</span>
              </Link>
            </li>
          ))}
          {more > 0 && (
            <li className="more">
              <button type="button" onClick={() => setOpen(true)}>+{more}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default OnlinePlayers;
