import { useEffect, useRef, useState } from 'react';

/* Biểu đồ SVG gọn nhẹ (1 chuỗi dữ liệu, màu vàng thương hiệu) — có tooltip khi rê/chạm. */

const useWidth = () => {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setW(el.clientWidth);
    update();
    if (!('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

const niceMax = (v) => {
  if (v <= 4) return 4;
  const step = v <= 10 ? 2 : v <= 25 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
};
const ticks = (max) => [0, Math.round(max / 2), max];

const Tooltip = ({ x, y, width, children }) => {
  if (x == null) return null;
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="bnc-chart-tip" style={{ left, top: y }}>{children}</div>
  );
};

const SrTable = ({ caption, rows }) => (
  <div className="visually-hidden">
    <table>
      <caption>{caption}</caption>
      <tbody>{rows.map((r, i) => <tr key={i}><th scope="row">{r[0]}</th><td>{r[1]}</td></tr>)}</tbody>
    </table>
  </div>
);

/** points: [{ x: Date|number, y: number }]; formatX(x) cho trục + tooltip */
export const AreaChart = ({ points, height = 220, formatX, formatTip, xTickCount = 5, label, unit = 'người' }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { t: 14, r: 12, b: 26, l: 30 };
  const W = Math.max(width, 0);
  const iw = Math.max(W - pad.l - pad.r, 1);
  const ih = height - pad.t - pad.b;
  const n = points.length;
  const max = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const xs = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const ys = (v) => pad.t + ih - (v / max) * ih;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join('');
  const area = n ? `${line}L${xs(n - 1).toFixed(1)},${pad.t + ih}L${xs(0).toFixed(1)},${pad.t + ih}Z` : '';
  const xTicks = n > 1 ? Array.from({ length: Math.min(xTickCount, n) }, (_, k) => Math.round((k / (Math.min(xTickCount, n) - 1 || 1)) * (n - 1))) : [];

  const onMove = (e) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const i = Math.round(((cx - pad.l) / iw) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="bnc-chart" ref={ref} style={{ height }}>
      {W > 0 && (
        <svg width={W} height={height} role="img" aria-label={label}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove}>
          <defs>
            <linearGradient id="bncAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bnc-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--bnc-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} className="grid" />
              <text x={pad.l - 8} y={ys(t)} dy="0.32em" textAnchor="end" className="axis">{t}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={xs(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="axis">{formatX(points[i].x)}</text>
          ))}
          {n > 0 && <path d={area} fill="url(#bncAreaFill)" />}
          {n > 0 && <path d={line} className="line" />}
          {hp && (
            <g>
              <line x1={xs(hover)} x2={xs(hover)} y1={pad.t} y2={pad.t + ih} className="cross" />
              <circle cx={xs(hover)} cy={ys(hp.y)} r="5" className="dot" />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <Tooltip x={xs(hover)} y={Math.max(ys(hp.y) - 12, 0)} width={W}>
          <b>{hp.y} {unit}</b><span>{(formatTip || formatX)(hp.x)}</span>
        </Tooltip>
      )}
      <SrTable caption={label} rows={points.map((p) => [(formatTip || formatX)(p.x), `${p.y} ${unit}`])} />
    </div>
  );
};

/** bars: [{ key, label, value, tip }] */
export const BarChart = ({ bars, height = 200, label, labelEvery = 1, formatValue = (v) => v, highlightKey }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { t: 14, r: 4, b: 24, l: 30 };
  const W = Math.max(width, 0);
  const iw = Math.max(W - pad.l - pad.r, 1);
  const ih = height - pad.t - pad.b;
  const n = bars.length || 1;
  const slot = iw / n;
  const bw = Math.max(Math.min(slot - 2, 28), 2);
  const max = niceMax(Math.max(1, ...bars.map((b) => b.value)));
  const ys = (v) => pad.t + ih - (v / max) * ih;
  const r = Math.min(4, bw / 2);
  const barPath = (x, y, w, h) => {
    if (h <= 0) return '';
    const rr = Math.min(r, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  };
  const hb = hover != null ? bars[hover] : null;

  return (
    <div className="bnc-chart" ref={ref} style={{ height }}>
      {W > 0 && (
        <svg width={W} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} className="grid" />
              <text x={pad.l - 8} y={ys(t)} dy="0.32em" textAnchor="end" className="axis">{formatValue(t, true)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = pad.l + i * slot + (slot - bw) / 2;
            const y = ys(b.value);
            const active = hover === i || (hover == null && highlightKey === b.key);
            return (
              <g key={b.key}>
                <path d={barPath(x, y, bw, pad.t + ih - y)} className={`bar ${active ? 'on' : ''}`} />
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="axis">{b.label}</text>
                )}
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent"
                  onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hb && (
        <Tooltip x={pad.l + hover * slot + slot / 2} y={Math.max(ys(hb.value) - 12, 0)} width={W}>
          <b>{formatValue(hb.value)}</b><span>{hb.tip || hb.label}</span>
        </Tooltip>
      )}
      <SrTable caption={label} rows={bars.map((b) => [b.tip || b.label, formatValue(b.value)])} />
    </div>
  );
};
