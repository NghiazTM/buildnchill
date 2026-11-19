import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BiSearch } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { mcHead } from '../lib/api';
import { isMcName } from '../lib/playtime';

/** Ô tìm người chơi — gợi ý khi gõ, Enter để mở hồ sơ. */
const PlayerSearch = ({ className = '' }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setItems([]); return undefined; }
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('bnc_player_search', { p_query: term, p_limit: 6 });
      setItems(data || []);
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = (name) => {
    if (!isMcName(name)) return;
    setOpen(false);
    setQ('');
    navigate(`/player/${encodeURIComponent(name)}`);
  };

  return (
    <form className={`bnc-player-search ${className}`} role="search" onSubmit={(e) => { e.preventDefault(); go(items[0]?.mc_username || q.trim()); }}>
      <BiSearch className="ic" aria-hidden="true" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Tìm người chơi theo tên…"
        aria-label="Tìm người chơi"
        maxLength={17}
        autoComplete="off"
        spellCheck="false"
      />
      <button type="submit" className="bnc-btn bnc-btn-sm" disabled={!isMcName(q.trim())}>Xem</button>
      {open && items.length > 0 && (
        <ul className="bnc-player-suggest" role="listbox">
          {items.map((it) => (
            <li key={it.mc_username}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(it.mc_username)}>
                <img src={mcHead(it.mc_username.replace(/^[.*]/, ''), 32)} alt="" width="22" height="22" />
                {it.mc_username}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

export default PlayerSearch;
