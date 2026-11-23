import { useEffect, useMemo, useRef } from 'react';
import { formatDuration } from '../lib/playtime';

const LEVELS = [0, 1800, 3600, 3 * 3600]; // <30p, 30p–1h, 1–3h, ≥3h
const levelOf = (s) => (s <= 0 ? 0 : s < LEVELS[1] ? 1 : s < LEVELS[2] ? 2 : s < LEVELS[3] ? 3 : 4);
const vnToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DOW = ['T2', '', 'T4', '', 'T6', '', 'CN'];

/** Lịch hoạt động 1 năm kiểu GitHub: mỗi ô = 1 ngày, đậm hơn = chơi lâu hơn. */
const ActivityCalendar = ({ days = [], name }) => {
  const scroller = useRef(null);
  const { weeks, months, active, total, best } = useMemo(() => {
    const map = new Map(days.map((d) => [String(d.day).slice(0, 10), Number(d.seconds) || 0]));
    const today = vnToday();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // về thứ Hai
    const w = [];
    const m = [];
    let act = 0;
    let sum = 0;
    let top = null;
    for (let d = new Date(start), i = 0; d <= today; d.setDate(d.getDate() + 1), i += 1) {
      const wi = Math.floor(i / 7);
      if (!w[wi]) w[wi] = [];
      const k = key(d);
      const s = map.get(k) || 0;
      if (s > 0) { act += 1; sum += s; if (!top || s > top.s) top = { k, s }; }
      w[wi].push({ k, s, lv: levelOf(s), label: d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) });
      if (d.getDate() === 1 || i === 0) m.push({ wi, label: `Th${d.getMonth() + 1}` });
    }
    return { weeks: w, months: m.filter((x, i, arr) => i === 0 || x.wi - arr[i - 1].wi >= 3), active: act, total: sum, best: top };
  }, [days]);

  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth; }, [weeks]);

  return (
    <div className="bnc-cal">
      <div className="small text-dim mb-3">
        <b className="text-white">{active}</b> ngày chơi trong năm qua · tổng {formatDuration(total, { coarse: true })}
        {best && <> · nhiều nhất {formatDuration(best.s)} ({new Date(best.k).toLocaleDateString('vi-VN')})</>}
      </div>
      <div className="bnc-cal-scroll" ref={scroller}>
        <div className="bnc-cal-grid" role="img" aria-label={`Lịch hoạt động của ${name}: ${active} ngày chơi trong năm qua`}>
          <div className="months" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }} aria-hidden="true">
            {months.map((m) => <span key={`${m.wi}-${m.label}`} style={{ gridColumn: m.wi + 1 }}>{m.label}</span>)}
          </div>
          <div className="dow" aria-hidden="true">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="cells" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }} aria-hidden="true">
            {weeks.map((wk, wi) => wk.map((c, di) => (
              <span key={c.k} className={`l${c.lv}`} style={{ gridColumn: wi + 1, gridRow: di + 1 }} title={`${c.label}: ${c.s ? formatDuration(c.s) : 'không chơi'}`} />
            )))}
          </div>
        </div>
      </div>
      <div className="bnc-cal-legend" aria-hidden="true">
        Ít <span className="l0" /><span className="l1" /><span className="l2" /><span className="l3" /><span className="l4" /> Nhiều
      </div>
    </div>
  );
};

export default ActivityCalendar;
