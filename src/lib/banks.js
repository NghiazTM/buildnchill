import { supabase } from '../supabaseClient';

// Mã ngân hàng theo chuẩn VietQR (img.vietqr.io chấp nhận mã viết tắt này).
export const BANKS = [
  { code: 'MB', name: 'MB Bank' },
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'ICB', name: 'VietinBank' },
  { code: 'VBA', name: 'Agribank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'VIB', name: 'VIB' },
  { code: 'MSB', name: 'MSB' },
  { code: 'SHB', name: 'SHB' },
  { code: 'HDB', name: 'HDBank' },
  { code: 'OCB', name: 'OCB' },
  { code: 'SEAB', name: 'SeABank' },
  { code: 'LPB', name: 'LPBank' },
  { code: 'EIB', name: 'Eximbank' },
  { code: 'NAB', name: 'Nam A Bank' },
  { code: 'KLB', name: 'KienlongBank' },
  { code: 'CAKE', name: 'CAKE by VPBank' },
  { code: 'TIMO', name: 'Timo' },
];

export const vietQrUrl = ({ bin, account, accountName = '', amount = 0, content = '' }) => {
  const params = new URLSearchParams();
  if (amount) params.set('amount', String(Math.round(amount)));
  if (content) params.set('addInfo', content);
  if (accountName) params.set('accountName', accountName);
  const qs = params.toString();
  return `https://img.vietqr.io/image/${encodeURIComponent(bin)}-${encodeURIComponent(account)}-compact2.png${qs ? `?${qs}` : ''}`;
};

/** Tài khoản mặc định từ biến môi trường (dùng khi chưa cấu hình trong Admin). */
export const envBankAccount = () => {
  const account = import.meta.env.VITE_BANK_ACCOUNT;
  if (!account) return null;
  return {
    id: 'env',
    bank_code: import.meta.env.VITE_BANK_CODE || 'MB',
    bank_name: import.meta.env.VITE_BANK_NAME || 'MB Bank',
    account,
    account_name: import.meta.env.VITE_BANK_ACCOUNT_NAME || '',
    note: '',
  };
};

/** Danh sách tài khoản nhận tiền đang bật (công khai), fallback về biến môi trường. */
export const fetchBankAccounts = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('id, bank_code, bank_name, account_number, account_name, note')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error && data?.length) {
      return data.map((a) => ({ id: a.id, bank_code: a.bank_code, bank_name: a.bank_name, account: a.account_number, account_name: a.account_name, note: a.note || '' }));
    }
  } catch {
    /* fallback */
  }
  const env = envBankAccount();
  return env ? [env] : [];
};
