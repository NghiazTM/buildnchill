/** Chọn tài khoản ngân hàng nhận tiền khi có nhiều tài khoản. */
const BankPicker = ({ banks, value, onChange }) => {
  if (!banks || banks.length < 2) return null;
  return (
    <div className="bnc-bank-picker" role="radiogroup" aria-label="Chọn ngân hàng nhận tiền">
      <div className="bnc-bank-picker-label">Chọn ngân hàng nhận tiền</div>
      <div className="bnc-bank-pills">
        {banks.map((b) => {
          const active = b.id === value;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`bnc-bank-pill ${active ? 'active' : ''}`}
              onClick={() => onChange(b.id)}
            >
              <span className="n">{b.bank_name}</span>
              <span className="a">•••{String(b.account || '').slice(-4)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BankPicker;
