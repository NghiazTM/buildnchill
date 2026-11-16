import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BiPlus, BiTrash, BiEdit, BiSave, BiX, BiChevronUp, BiChevronDown, BiQrScan } from 'react-icons/bi';
import { supabase } from '../supabaseClient';
import { StatusBadge, useToast } from './ui';
import { BANKS, vietQrUrl } from '../lib/banks';

const EMPTY = { bank_code: 'MB', bank_name: 'MB Bank', account_number: '', account_name: '', note: '', is_active: true, display_order: 0 };

const PaymentAccountsManagement = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      setMissingTable(['PGRST205', '42P01'].includes(error.code) || /payment_accounts/.test(error.message || ''));
      setRows([]);
    } else {
      setMissingTable(false);
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => setForm({ ...EMPTY, display_order: rows.length });
  const openEdit = (r) => setForm({ ...r, note: r.note || '' });
  const close = () => setForm(null);

  const pickBank = (code) => {
    const b = BANKS.find((x) => x.code === code);
    setForm((f) => ({ ...f, bank_code: code, bank_name: b ? b.name : f.bank_name }));
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      bank_code: form.bank_code.trim().toUpperCase(),
      bank_name: form.bank_name.trim(),
      account_number: form.account_number.replace(/\s+/g, ''),
      account_name: form.account_name.trim().toUpperCase(),
      note: form.note.trim() || null,
      is_active: !!form.is_active,
      display_order: Number(form.display_order) || 0,
      updated_at: new Date().toISOString(),
    };
    if (!payload.bank_code || !payload.bank_name) { toast('Chọn ngân hàng', 'error'); return; }
    if (!/^[0-9A-Za-z]{4,30}$/.test(payload.account_number)) { toast('Số tài khoản không hợp lệ', 'error'); return; }
    if (payload.account_name.length < 3) { toast('Nhập tên chủ tài khoản', 'error'); return; }

    setSaving(true);
    const q = form.id
      ? supabase.from('payment_accounts').update(payload).eq('id', form.id)
      : supabase.from('payment_accounts').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast(`Lỗi lưu: ${error.message}`, 'error'); return; }
    toast(form.id ? 'Đã cập nhật tài khoản' : 'Đã thêm tài khoản', 'success');
    close();
    load();
  };

  const toggle = async (r) => {
    const { error } = await supabase.from('payment_accounts').update({ is_active: !r.is_active, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) toast(error.message, 'error'); else load();
  };

  const move = async (r, dir) => {
    const idx = rows.findIndex((x) => x.id === r.id);
    const other = rows[idx + (dir === 'up' ? -1 : 1)];
    if (!other) return;
    await Promise.all([
      supabase.from('payment_accounts').update({ display_order: other.display_order }).eq('id', r.id),
      supabase.from('payment_accounts').update({ display_order: r.display_order === other.display_order ? r.display_order + (dir === 'up' ? -1 : 1) : r.display_order }).eq('id', other.id),
    ]);
    load();
  };

  const remove = async (r) => {
    if (!window.confirm(`Xoá tài khoản ${r.bank_name} • ${r.account_number}?`)) return;
    const { error } = await supabase.from('payment_accounts').delete().eq('id', r.id);
    if (error) toast(error.message, 'error'); else { toast('Đã xoá', 'success'); load(); }
  };

  const active = rows.filter((r) => r.is_active).length;

  return (
    <div>
      <div className="bnc-admin-title">
        <div>
          <h2>Tài khoản nhận tiền</h2>
          <p>
            Người mua chọn ngân hàng muốn chuyển khoản; nội dung chuyển khoản (mã đơn) giống nhau nên SePay xác nhận được ở mọi tài khoản.
            {' '}<b className="text-accent">Mỗi tài khoản phải được liên kết trong SePay.</b>
          </p>
        </div>
        <button className="bnc-btn bnc-btn-sm" onClick={openAdd} disabled={missingTable}><BiPlus size={18} /> Thêm tài khoản</button>
      </div>

      {missingTable && (
        <div className="bnc-card bnc-card-pad mb-3">
          <b>Chưa có bảng payment_accounts.</b>
          <div className="text-soft small mt-1">Chạy file <code>STATUS_AND_BANKS_MIGRATION.sql</code> trong Supabase → SQL Editor rồi tải lại trang. Trong lúc chờ, cửa hàng dùng tài khoản trong biến môi trường VITE_BANK_*.</div>
        </div>
      )}

      {!missingTable && !loading && rows.length === 0 && (
        <div className="bnc-card bnc-empty">
          Chưa có tài khoản nào — cửa hàng đang dùng tài khoản mặc định trong biến môi trường (VITE_BANK_*). Bấm “Thêm tài khoản” để quản lý tại đây.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-dim small mb-2">{active}/{rows.length} tài khoản đang bật • tài khoản đầu tiên được chọn sẵn khi thanh toán</p>
          <div className="row g-3">
            {rows.map((r, i) => (
              <div key={r.id} className="col-md-6 col-xl-4">
                <div className="bnc-card h-100 p-3 d-flex flex-column gap-3" style={{ opacity: r.is_active ? 1 : 0.6 }}>
                  <div className="d-flex align-items-start gap-3">
                    <img src={vietQrUrl({ bin: r.bank_code, account: r.account_number, accountName: r.account_name, amount: 0, content: '' })}
                      alt="" width="76" height="76" style={{ borderRadius: 8, background: '#fff', padding: 4, objectFit: 'contain' }} loading="lazy" />
                    <div className="min-w-0 flex-grow-1">
                      <div className="fw-bold">{r.bank_name} <span className="bnc-code ms-1">{r.bank_code}</span></div>
                      <div className="bnc-mono mt-1">{r.account_number}</div>
                      <div className="small text-soft text-truncate">{r.account_name}</div>
                      {r.note && <div className="small text-dim mt-1">{r.note}</div>}
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mt-auto">
                    <button type="button" className="border-0 bg-transparent p-0" onClick={() => toggle(r)} title="Bật/tắt">
                      <StatusBadge status={r.is_active ? 'delivered' : 'cancelled'} label={r.is_active ? (i === 0 ? 'Đang bật • mặc định' : 'Đang bật') : 'Đang tắt'} />
                    </button>
                    <div className="d-flex gap-1">
                      <button className="bnc-icon-btn" onClick={() => move(r, 'up')} disabled={i === 0} title="Lên"><BiChevronUp size={18} /></button>
                      <button className="bnc-icon-btn" onClick={() => move(r, 'down')} disabled={i === rows.length - 1} title="Xuống"><BiChevronDown size={18} /></button>
                      <button className="bnc-icon-btn" onClick={() => openEdit(r)} title="Sửa"><BiEdit /></button>
                      <button className="bnc-icon-btn danger" onClick={() => remove(r)} title="Xoá"><BiTrash /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {form && (
          <div className="bnc-overlay" onClick={close}>
            <motion.div className="bnc-modal" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} onClick={(e) => e.stopPropagation()}>
              <div className="bnc-modal-head">
                <h3>{form.id ? 'Sửa tài khoản nhận tiền' : 'Thêm tài khoản nhận tiền'}</h3>
                <button className="bnc-x" onClick={close} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <form className="bnc-modal-body" onSubmit={save}>
                <div className="row g-3">
                  <div className="col-sm-6">
                    <label className="bnc-label">Ngân hàng</label>
                    <select className="bnc-select" value={BANKS.some((b) => b.code === form.bank_code) ? form.bank_code : '__custom'} onChange={(e) => (e.target.value === '__custom' ? setForm({ ...form, bank_code: '' }) : pickBank(e.target.value))}>
                      {BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                      <option value="__custom">Khác (nhập mã)</option>
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="bnc-label">Mã VietQR</label>
                    <input className="bnc-input" value={form.bank_code} onChange={(e) => setForm({ ...form, bank_code: e.target.value.toUpperCase() })} placeholder="VD: MB, VCB, TCB" />
                  </div>
                  <div className="col-12">
                    <label className="bnc-label">Tên hiển thị</label>
                    <input className="bnc-input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="VD: MB Bank" />
                  </div>
                  <div className="col-sm-6">
                    <label className="bnc-label">Số tài khoản</label>
                    <input className="bnc-input bnc-mono" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} inputMode="numeric" />
                  </div>
                  <div className="col-sm-6">
                    <label className="bnc-label">Chủ tài khoản</label>
                    <input className="bnc-input" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="NGUYEN VAN A" />
                  </div>
                  <div className="col-12">
                    <label className="bnc-label">Ghi chú (tuỳ chọn)</label>
                    <input className="bnc-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: Ưu tiên chuyển nhanh 24/7" />
                  </div>
                  <div className="col-6">
                    <label className="bnc-label">Thứ tự</label>
                    <input type="number" className="bnc-input" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
                  </div>
                  <div className="col-6 d-flex align-items-end">
                    <div className="form-check form-switch custom-toggle-switch mb-2">
                      <input className="form-check-input" type="checkbox" role="switch" id="bankActive" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                      <label className="form-check-label ms-2" htmlFor="bankActive">Đang bật</label>
                    </div>
                  </div>
                </div>
                {form.bank_code && form.account_number.length >= 4 && (
                  <div className="d-flex align-items-center gap-3 mt-3 p-2 rounded-3" style={{ border: '1px solid var(--bnc-border)' }}>
                    <img src={vietQrUrl({ bin: form.bank_code, account: form.account_number.replace(/\s+/g, ''), accountName: form.account_name, amount: 10000, content: 'TEST' })}
                      alt="QR thử" width="84" height="84" style={{ background: '#fff', borderRadius: 8, padding: 4, objectFit: 'contain' }} />
                    <div className="small text-soft"><BiQrScan /> QR thử 10.000đ — quét bằng app ngân hàng để kiểm tra đúng tên chủ tài khoản (không cần chuyển).</div>
                  </div>
                )}
                <div className="d-flex gap-2 mt-4">
                  <button type="submit" className="bnc-btn flex-grow-1" disabled={saving}><BiSave /> {saving ? 'Đang lưu...' : 'Lưu'}</button>
                  <button type="button" className="bnc-btn bnc-btn-dark" onClick={close}>Huỷ</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentAccountsManagement;
