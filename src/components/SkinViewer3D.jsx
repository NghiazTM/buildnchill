import { useEffect, useRef, useState } from 'react';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Skin 3D xoay được (kéo chuột/vuốt). Hiện ảnh tĩnh cho tới khi tải xong hoặc nếu máy không hỗ trợ WebGL. */
const SkinViewer3D = ({ name, width = 160, height = 300, alt = '' }) => {
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);
  const clean = String(name || 'Steve').replace(/^[.*]/, '');

  useEffect(() => {
    let viewer = null;
    let alive = true;
    setReady(false);
    import('skinview3d').then(async ({ SkinViewer, IdleAnimation }) => {
      if (!alive || !canvas.current) return;
      viewer = new SkinViewer({ canvas: canvas.current, width, height, preserveDrawingBuffer: false });
      await viewer.loadSkin(`https://mc-heads.net/skin/${encodeURIComponent(clean)}`);
      if (!alive) return;
      viewer.zoom = 0.82;
      viewer.fov = 40;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      if (!reduceMotion()) {
        viewer.autoRotate = true;
        viewer.autoRotateSpeed = 0.7;
        viewer.animation = new IdleAnimation();
      }
      setReady(true);
    }).catch(() => { /* giữ ảnh tĩnh */ });
    return () => { alive = false; viewer?.dispose(); };
  }, [clean, width, height]);

  return (
    <div className="bnc-skin3d" style={{ width, height }}>
      <img src={`https://mc-heads.net/body/${encodeURIComponent(clean)}/240`} alt={alt} className={ready ? 'gone' : ''} width={Math.round(height * 0.42)} height={height} />
      <canvas ref={canvas} className={ready ? 'on' : ''} aria-label={ready ? `${alt} (kéo để xoay)` : undefined} role="img" />
    </div>
  );
};

export default SkinViewer3D;
