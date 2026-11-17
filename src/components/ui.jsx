import { createContext, useCallback, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

/* ---------- Divider: giữ export để tương thích, không còn đường cong ---------- */
export const Divider = () => null;

export const Eyebrow = ({ index, children, className = '' }) => (
  <div className={`bnc-eyebrow ${className}`}>{index && <span className="idx">{index}</span>}{children}</div>
);

/* ---------- Page hero for inner pages ---------- */
export const PageHero = ({ pill, title, highlight, subtitle, crumbs = [], children }) => (
  <section className="bnc-page-hero">
    <div className="container">
      <div className="bnc-crumbs mb-3">
        <Link to="/">Trang chủ</Link>
        {crumbs.map((c) => (
          <span key={c.label}>
            {' '}/{' '}
            {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="text-soft">{c.label}</span>}
          </span>
        ))}
      </div>
      {pill && <Eyebrow>{pill}</Eyebrow>}
      <h1>
        {title}{highlight && <> <span className="highlight">{highlight}</span></>}
      </h1>
      {subtitle && <p className="bnc-sub mb-0">{subtitle}</p>}
      {children}
    </div>
  </section>
);

export const SectionTitle = ({ pill, title, highlight, subtitle, center = true }) => (
  <div className={`mb-5 ${center ? 'bnc-center' : ''}`}>
    {pill && <Eyebrow>{pill}</Eyebrow>}
    <h2 className="bnc-heading">
      {title}{highlight && <> <span className="highlight">{highlight}</span></>}
    </h2>
    {subtitle && <p className="bnc-sub">{subtitle}</p>}
  </div>
);

export const Seo = ({ title, description, path }) => (
  <Helmet>
    <title>{title ? `${title} | BuildnChill Minecraft` : 'BuildnChill - Server Minecraft Sinh Tồn Việt Nam'}</title>
    {description && <meta name="description" content={description} />}
    {title && <meta property="og:title" content={`${title} | BuildnChill`} />}
    {description && <meta property="og:description" content={description} />}
    {path && <link rel="canonical" href={`https://buildnchill.id.vn${path}`} />}
    {path && <meta property="og:url" content={`https://buildnchill.id.vn${path}`} />}
    {title && <meta name="twitter:title" content={`${title} | BuildnChill`} />}
  </Helmet>
);

export const Spinner = ({ label = 'Đang tải...' }) => (
  <div className="d-flex flex-column align-items-center justify-content-center py-5 gap-3">
    <div className="spinner-border text-primary" role="status" />
    <span className="text-soft small fw-bold">{label}</span>
  </div>
);

export const StatusBadge = ({ status, label, pulse = false }) => (
  <span className={`bnc-status ${status}`}>
    {pulse && <span className="bnc-pulse" />}
    {label}
  </span>
);

/* ---------- Toasts ---------- */
const ToastCtx = createContext({ toast: () => {} });

export const ToastProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, type = 'info', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="bnc-toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`bnc-toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export const useToast = () => useContext(ToastCtx).toast;

export const useCopy = () => {
  const toast = useToast();
  return useCallback(async (text, label = 'Đã sao chép') => {
    try {
      await navigator.clipboard.writeText(String(text));
      toast(label, 'success', 1800);
    } catch {
      toast('Không sao chép được, hãy chọn và copy thủ công', 'error');
    }
  }, [toast]);
};
