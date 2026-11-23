// Tiện ích cho các tính năng cộng đồng (dòng hoạt động, sự kiện, công trình, thông báo).
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { api } from './api';

/** Đọc cấu hình công khai (bản đồ, bình chọn…) do admin nhập. undefined = đang tải, null = chưa có. */
export const useConfig = (key) => {
  const [v, setV] = useState(undefined);
  useEffect(() => {
    supabase.from('bnc_config').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => setV(data?.value || null));
  }, [key]);
  return v;
};

// ---------- Dòng hoạt động ----------
const STAT_LABEL = { play_seconds: 'Giờ chơi', blocks_mined: 'Đào khối', mob_kills: 'Hạ quái', adv_done: 'Thành tựu' };

/** { icon, text: [đoạn trước tên?], tone } — dùng chung trang chủ + thống kê */
export const describeEvent = (e) => {
  const d = e.data || {};
  switch (e.kind) {
    case 'first_join': return { tone: 'green', label: 'Người mới', text: 'lần đầu vào server — chào mừng!' };
    case 'join': return { tone: '', label: 'Vào game', text: 'vừa vào server' };
    case 'milestone': return { tone: Number(d.level) >= 3 ? 'violet' : 'gold', label: 'Danh hiệu', text: <>đạt danh hiệu <b>{d.name} {d.tier}</b></> };
    case 'top1': return { tone: 'gold', label: 'Top 1', text: <>vượt <b>{d.beaten}</b>, lên top 1 <b>{d.label || STAT_LABEL[d.stat] || d.stat}</b></> };
    case 'advancement': return {
      tone: d.frame === 'challenge' ? 'violet' : d.frame === 'goal' ? 'blue' : '',
      label: d.frame === 'challenge' ? 'Thử thách' : d.frame === 'goal' ? 'Mục tiêu' : 'Thành tựu',
      text: <>mở khoá <b>{d.title}</b></>,
    };
    default: return { tone: '', label: '', text: '' };
  }
};

// ---------- Sự kiện: thêm vào lịch ----------
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const endOf = (ev) => ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 60 * 60000).toISOString();

export const googleCalendarUrl = (ev, site = window.location.origin) => {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ev.title} — BuildnChill`,
    dates: `${icsDate(ev.starts_at)}/${icsDate(endOf(ev))}`,
    details: `${ev.description ? `${ev.description}\n\n` : ''}${site}/events`,
    location: ev.location || 'Máy chủ Minecraft BuildnChill',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
};

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
export const downloadIcs = (ev, site = window.location.origin) => {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuildnChill//Events//VI', 'BEGIN:VEVENT',
    `UID:${ev.id}@buildnchill`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.starts_at)}`, `DTEND:${icsDate(endOf(ev))}`,
    `SUMMARY:${icsEsc(`${ev.title} — BuildnChill`)}`,
    `DESCRIPTION:${icsEsc(`${ev.description || ''}\n${site}/events`)}`,
    `LOCATION:${icsEsc(ev.location || 'Máy chủ Minecraft BuildnChill')}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(ev.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `buildnchill-${String(ev.title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/** Tách thời gian còn lại thành ngày / giờ / phút / giây */
export const countdown = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { d, h, m, s: s % 60 };
};

/** Thời điểm hiện tại, cập nhật mỗi ms mili giây */
export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
};

/** Đồng hồ đếm ngược dạng ô số */
export const Countdown = ({ to, now }) => {
  const c = countdown(new Date(to).getTime() - now);
  const parts = [['ngày', c.d], ['giờ', c.h], ['phút', c.m], ['giây', c.s]];
  return (
    <div className="bnc-countdown" role="timer" aria-label={`Còn ${c.d} ngày ${c.h} giờ ${c.m} phút`}>
      {parts.map(([k, v]) => <div key={k}><b>{String(v).padStart(2, '0')}</b><span>{k}</span></div>)}
    </div>
  );
};

// ---------- Thông báo trình duyệt ----------
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const currentPush = async () => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
};

export const enablePush = async () => {
  if (!pushSupported()) throw new Error('Trình duyệt này không hỗ trợ thông báo');
  const { publicKey } = await api('push');
  if (!publicKey) throw new Error('Máy chủ chưa bật tính năng thông báo');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bạn đã chặn thông báo cho trang này');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await api('push', { method: 'POST', body: { subscription: sub.toJSON() } });
  return sub;
};

export const disablePush = async () => {
  const sub = await currentPush();
  if (!sub) return;
  await api('push', { method: 'POST', body: { unsubscribe: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
};

// ---------- Ảnh công trình: thu nhỏ + nén trước khi tải lên ----------
export const compressImage = (file, { max = 1920, quality = 0.85 } = {}) => new Promise((resolve, reject) => {
  if (!/^image\//.test(file.type)) { reject(new Error('Chỉ nhận file ảnh')); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const done = (blob, ext) => (blob ? resolve({ blob, ext }) : reject(new Error('Không xử lý được ảnh')));
    c.toBlob((b) => (b && b.type === 'image/webp' ? done(b, 'webp') : c.toBlob((j) => done(j, 'jpg'), 'image/jpeg', quality)), 'image/webp', quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File ảnh bị lỗi')); };
  img.src = url;
});

export const COMMUNITY_LINKS = [
  { to: '/leaderboard', label: 'Bảng xếp hạng', desc: 'Giờ chơi, thành tựu, đào khối…' },
  { to: '/stats', label: 'Thống kê server', desc: 'Số liệu toàn server, thành tựu hiếm' },
  { to: '/compare', label: 'So sánh người chơi', desc: 'Đặt 2 người cạnh nhau' },
  { to: '/builds', label: 'Công trình', desc: 'Khoe công trình, thả tim, bình luận' },
  { to: '/events', label: 'Sự kiện', desc: 'Lịch sự kiện & nhắc trước giờ' },
  { to: '/clans', label: 'Clan', desc: 'Lập clan, xếp hạng clan' },
  { to: '/map', label: 'Bản đồ', desc: 'Bản đồ thế giới trực tiếp' },
  { to: '/vote', label: 'Bình chọn', desc: 'Vote cho server' },
];
