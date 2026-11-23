import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BiPlus, BiTrash, BiEdit, BiX, BiSave } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { useToast } from './ui';

const TABS = [
  { id: 'events', label: 'Sự kiện' },
  { id: 'seasons', label: 'Mùa giải' },
  { id: 'config', label: 'Bản đồ & Bình chọn' },
];

// ISO <-> giá trị ô datetime-local (giờ máy người dùng)
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
const fmt = (iso) => new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const Missing = () => (
  <div className="bnc-card bnc-card-pad mb-3">
    <b>Chưa có bảng dữ liệu cộng đồng.</b>
    <div className="text-soft small mt-1">Chạy file <code>COMMUNITY_MIGRATION.sql</code> trong Supabase → SQL Editor rồi tải lại trang.</div>
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div className="bnc-overlay" onClick={onClose}>
    <motion.div className="bnc-modal" role="dialog" aria-modal="true" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} onClick={(e) => e.stopPropagation()}>
      <div className="bnc-modal-head"><h3>{title}</h3><button type="button" className="bnc-x" onClick={onClose} aria-label="Đóng"><BiX size={20} /></button></div>
      {children}
    </motion.div>
  </div>
);

// ---------------- Sự kiện ----------------
const EventsAdmin = () => {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('server_events').select('*').order('starts_at', { ascending: false }).limit(100);
    if (error) setMissing(true);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: fromLocal(form.starts_at),
      ends_at: fromLocal(form.ends_at),
      location: form.location.trim() || null,
      image_url: form.image_url.trim() || null,
    };
    if (!payload.starts_at) { toast('Chọn thời gian bắt đầu', 'error'); return; }
    if (form.id && form.starts_at !== form._origStart) payload.reminded_at = null; // đổi giờ -> nhắc lại
    const { error } = form.id
      ? await supabase.from('server_events').update(payload).eq('id', form.id)
      : await supabase.from('server_events').insert(payload);
    if (error) { toast(error.message, 'error'); return; }
    toast('Đã lưu sự kiện', 'success');
    setForm(null);
    load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Xoá sự kiện “${r.title}”?`)) return;
    const { error } = await supabase.from('server_events').delete().eq('id', r.id);
    if (error) toast(error.message, 'error'); else load();
  };
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const now = Date.now();

  return (
    <>
      {missing && <Missing />}
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <p className="text-dim small mb-0">Người chơi bật thông báo trên trang Sự kiện sẽ được nhắc ~30 phút trước giờ bắt đầu.</p>
        <button type="button" className="bnc-btn bnc-btn-sm" disabled={missing} onClick={() => setForm({ title: '', description: '', starts_at: '', ends_at: '', location: '', image_url: '' })}><BiPlus /> Thêm sự kiện</button>
      </div>
      {rows && rows.length === 0 && !missing && <div className="bnc-card bnc-empty">Chưa có sự kiện nào.</div>}
      <div className="d-flex flex-column gap-2">
        {(rows || []).map((r) => (
          <div key={r.id} className="bnc-card p-3 d-flex align-items-center gap-3" style={{ opacity: new Date(r.starts_at).getTime() < now - 86400000 ? 0.6 : 1 }}>
            <div className="min-w-0 flex-grow-1">
              <div className="fw-bold">{r.title}</div>
              <div className="small text-soft">{fmt(r.starts_at)}{r.location ? ` · ${r.location}` : ''}{r.reminded_at ? ' · đã nhắc' : ''}</div>
            </div>
            <button type="button" className="bnc-icon-btn" onClick={() => setForm({ ...r, description: r.description || '', location: r.location || '', image_url: r.image_url || '', starts_at: toLocal(r.starts_at), ends_at: toLocal(r.ends_at), _origStart: toLocal(r.starts_at) })} title="Sửa"><BiEdit /></button>
            <button type="button" className="bnc-icon-btn danger" onClick={() => remove(r)} title="Xoá"><BiTrash /></button>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {form && (
          <Modal title={form.id ? 'Sửa sự kiện' : 'Thêm sự kiện'} onClose={() => setForm(null)}>
            <form className="bnc-modal-body" onSubmit={save}>
              <label className="bnc-label" htmlFor="ev-title">Tên sự kiện</label>
              <input id="ev-title" className="bnc-input mb-3" value={form.title} onChange={set('title')} required minLength={2} maxLength={120} />
              <div className="row g-2 mb-3">
                <div className="col-sm-6"><label className="bnc-label" htmlFor="ev-start">Bắt đầu</label><input id="ev-start" type="datetime-local" className="bnc-input" value={form.starts_at} onChange={set('starts_at')} required /></div>
                <div className="col-sm-6"><label className="bnc-label" htmlFor="ev-end">Kết thúc <span className="text-dim">(tuỳ chọn)</span></label><input id="ev-end" type="datetime-local" className="bnc-input" value={form.ends_at} onChange={set('ends_at')} min={form.starts_at} /></div>
              </div>
              <label className="bnc-label" htmlFor="ev-loc">Địa điểm <span className="text-dim">(VD: Spawn, /warp event)</span></label>
              <input id="ev-loc" className="bnc-input mb-3" value={form.location} onChange={set('location')} maxLength={80} />
              <label className="bnc-label" htmlFor="ev-desc">Mô tả</label>
              <textarea id="ev-desc" className="bnc-input mb-3" rows={4} value={form.description} onChange={set('description')} maxLength={2000} />
              <label className="bnc-label" htmlFor="ev-img">Ảnh (link, tuỳ chọn)</label>
              <input id="ev-img" className="bnc-input mb-4" value={form.image_url} onChange={set('image_url')} placeholder="https://..." />
              <button type="submit" className="bnc-btn bnc-btn-block"><BiSave /> Lưu</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

// ---------------- Mùa giải ----------------
const SeasonsAdmin = () => {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('starts_on', { ascending: false });
    if (error) setMissing(true);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

  const save = async (e) => {
    e.preventDefault();
    const payload = { name: form.name.trim(), starts_on: form.starts_on, ends_on: form.ends_on || null, note: form.note.trim() || null };
    const { error } = form.id ? await supabase.from('seasons').update(payload).eq('id', form.id) : await supabase.from('seasons').insert(payload);
    if (error) { toast(error.message, 'error'); return; }
    toast('Đã lưu mùa giải', 'success');
    setForm(null);
    load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Xoá mùa “${r.name}”? Số liệu giờ chơi không bị mất.`)) return;
    const { error } = await supabase.from('seasons').delete().eq('id', r.id);
    if (error) toast(error.message, 'error'); else load();
  };
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const state = (r) => (r.starts_on > today ? 'Sắp tới' : r.ends_on && r.ends_on < today ? 'Đã kết thúc' : 'Đang diễn ra');

  return (
    <>
      {missing && <Missing />}
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <p className="text-dim small mb-0">Mùa đang diễn ra hiện thành tab riêng trên Bảng xếp hạng. Mùa đã kết thúc: top 3 vào “Đại sảnh danh vọng”.</p>
        <button type="button" className="bnc-btn bnc-btn-sm" disabled={missing} onClick={() => setForm({ name: '', starts_on: today, ends_on: '', note: '' })}><BiPlus /> Thêm mùa</button>
      </div>
      {rows && rows.length === 0 && !missing && <div className="bnc-card bnc-empty">Chưa có mùa giải nào.</div>}
      <div className="d-flex flex-column gap-2">
        {(rows || []).map((r) => (
          <div key={r.id} className="bnc-card p-3 d-flex align-items-center gap-3">
            <div className="min-w-0 flex-grow-1">
              <div className="fw-bold">{r.name} <span className="bnc-badge ms-1">{state(r)}</span></div>
              <div className="small text-soft">{new Date(r.starts_on).toLocaleDateString('vi-VN')} → {r.ends_on ? new Date(r.ends_on).toLocaleDateString('vi-VN') : 'chưa đặt ngày kết thúc'}</div>
            </div>
            <button type="button" className="bnc-icon-btn" onClick={() => setForm({ ...r, ends_on: r.ends_on || '', note: r.note || '' })} title="Sửa"><BiEdit /></button>
            <button type="button" className="bnc-icon-btn danger" onClick={() => remove(r)} title="Xoá"><BiTrash /></button>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {form && (
          <Modal title={form.id ? 'Sửa mùa giải' : 'Thêm mùa giải'} onClose={() => setForm(null)}>
            <form className="bnc-modal-body" onSubmit={save}>
              <label className="bnc-label" htmlFor="ss-name">Tên mùa</label>
              <input id="ss-name" className="bnc-input mb-3" value={form.name} onChange={set('name')} required minLength={2} maxLength={40} placeholder="VD: Mùa đông 2026" />
              <div className="row g-2 mb-3">
                <div className="col-6"><label className="bnc-label" htmlFor="ss-from">Từ ngày</label><input id="ss-from" type="date" className="bnc-input" value={form.starts_on} onChange={set('starts_on')} required /></div>
                <div className="col-6"><label className="bnc-label" htmlFor="ss-to">Đến ngày</label><input id="ss-to" type="date" className="bnc-input" value={form.ends_on} onChange={set('ends_on')} min={form.starts_on} /></div>
              </div>
              <div className="bnc-help mb-4">Để trống “Đến ngày” nếu chưa biết khi nào kết thúc mùa.</div>
              <button type="submit" className="bnc-btn bnc-btn-block"><BiSave /> Lưu</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

// ---------------- Bản đồ & Bình chọn ----------------
const ConfigAdmin = () => {
  const toast = useToast();
  const [map, setMap] = useState({ url: '', note: '' });
  const [vote, setVote] = useState({ note: '', sites: [] });
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('bnc_config').select('key,value').in('key', ['map', 'vote']).then(({ data, error }) => {
      if (error) { setMissing(true); return; }
      const m = (data || []).find((r) => r.key === 'map')?.value;
      const v = (data || []).find((r) => r.key === 'vote')?.value;
      if (m) setMap({ url: m.url || '', note: m.note || '' });
      if (v) setVote({ note: v.note || '', sites: Array.isArray(v.sites) ? v.sites : [] });
    });
  }, []);

  const okUrl = (u) => !u || /^https?:\/\/[^\s]+$/i.test(u);
  const save = async () => {
    if (!okUrl(map.url) || vote.sites.some((s) => !okUrl(s.url))) { toast('Có link không hợp lệ (phải bắt đầu bằng http:// hoặc https://)', 'error'); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('bnc_config').upsert([
      { key: 'map', value: { url: map.url.trim(), note: map.note.trim() }, updated_at: now },
      { key: 'vote', value: { note: vote.note.trim(), sites: vote.sites.filter((s) => s.url.trim()).map((s) => ({ name: s.name.trim(), url: s.url.trim(), note: (s.note || '').trim() })) }, updated_at: now },
    ], { onConflict: 'key' });
    setBusy(false);
    if (error) toast(error.message, 'error'); else toast('Đã lưu', 'success');
  };
  const setSite = (i, k) => (e) => setVote((s) => ({ ...s, sites: s.sites.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));

  return (
    <>
      {missing && <Missing />}
      <div className="bnc-card bnc-card-pad mb-3">
        <h3 className="h6 mb-3">Bản đồ thế giới (trang /map)</h3>
        <label className="bnc-label" htmlFor="cf-map">Link bản đồ (BlueMap / Dynmap / squaremap)</label>
        <input id="cf-map" className="bnc-input mb-1" value={map.url} onChange={(e) => setMap((s) => ({ ...s, url: e.target.value }))} placeholder="https://map.buildnchill.id.vn" />
        <div className="bnc-help mb-3">Nên dùng https:// — link http:// sẽ không nhúng được vào trang (chỉ mở tab mới).</div>
        <label className="bnc-label" htmlFor="cf-map-note">Mô tả ngắn (tuỳ chọn)</label>
        <input id="cf-map-note" className="bnc-input" value={map.note} onChange={(e) => setMap((s) => ({ ...s, note: e.target.value }))} maxLength={200} />
      </div>

      <div className="bnc-card bnc-card-pad mb-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="h6 mb-0">Trang bình chọn (trang /vote)</h3>
          <button type="button" className="bnc-btn bnc-btn-sm bnc-btn-ghost" onClick={() => setVote((s) => ({ ...s, sites: [...s.sites, { name: '', url: '', note: '' }] }))}><BiPlus /> Thêm trang vote</button>
        </div>
        <label className="bnc-label" htmlFor="cf-vote-note">Lời nhắn đầu trang (tuỳ chọn)</label>
        <input id="cf-vote-note" className="bnc-input mb-3" value={vote.note} onChange={(e) => setVote((s) => ({ ...s, note: e.target.value }))} maxLength={300} />
        {vote.sites.length === 0 && <div className="small text-soft">Chưa có trang vote nào.</div>}
        {vote.sites.map((s, i) => (
          <div key={i} className="row g-2 align-items-end mb-2">
            <div className="col-sm-3"><label className="bnc-label">Tên</label><input className="bnc-input" value={s.name} onChange={setSite(i, 'name')} placeholder="VD: Minecraft-MP" /></div>
            <div className="col-sm-5"><label className="bnc-label">Link vote</label><input className="bnc-input" value={s.url} onChange={setSite(i, 'url')} placeholder="https://..." /></div>
            <div className="col-sm-3"><label className="bnc-label">Ghi chú</label><input className="bnc-input" value={s.note || ''} onChange={setSite(i, 'note')} placeholder="1 lần / 24h" /></div>
            <div className="col-sm-1"><button type="button" className="bnc-icon-btn danger" onClick={() => setVote((v) => ({ ...v, sites: v.sites.filter((_, j) => j !== i) }))} title="Xoá"><BiTrash /></button></div>
          </div>
        ))}
      </div>
      <button type="button" className="bnc-btn" onClick={save} disabled={busy || missing}><BiSave /> {busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
    </>
  );
};

const CommunityManagement = () => {
  const [tab, setTab] = useState('events');
  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Cộng đồng</h2>
          <p>Lịch sự kiện, mùa giải bảng xếp hạng, bản đồ và trang bình chọn. Công trình và clan được quản lý ngay trên trang của chúng (admin thấy nút Ẩn / Nổi bật / Giải tán).</p>
        </div>
      </div>
      <div className="bnc-lb-tabs mb-4" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`bnc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'events' && <EventsAdmin />}
      {tab === 'seasons' && <SeasonsAdmin />}
      {tab === 'config' && <ConfigAdmin />}
    </div>
  );
};

export default CommunityManagement;
