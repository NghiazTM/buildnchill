/** "12 giờ 30 phút", "45 phút", "dưới 1 phút" */
export const formatDuration = (sec, { short = false, coarse = false } = {}) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return short ? '<1p' : 'dưới 1 phút';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (coarse && h >= 1) return `${h.toLocaleString('vi-VN')} giờ`;
  if (short) return h ? `${h}h${m ? ` ${m}p` : ''}` : `${m}p`;
  if (h >= 100) return `${h.toLocaleString('vi-VN')} giờ`;
  return h ? `${h} giờ${m ? ` ${m} phút` : ''}` : `${m} phút`;
};

export const timeAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

/** Tên Minecraft hợp lệ (Java 3-16 ký tự, Bedrock có tiền tố . hoặc *) */
export const isMcName = (n) => /^[.*]?[A-Za-z0-9_]{2,16}$/.test(String(n || ''));
