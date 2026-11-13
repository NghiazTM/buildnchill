// Nội dung tĩnh của website — chỉnh sửa trực tiếp tại đây.

export const FEATURES = [
  { icon: 'BiRocket', title: 'Mượt mà, ít lag', text: 'Máy chủ cấu hình mạnh, tối ưu plugin để trải nghiệm sinh tồn luôn ổn định 24/7.' },
  { icon: 'BiGroup', title: 'Cộng đồng thân thiện', text: 'Người chơi văn minh, đội ngũ hỗ trợ nhiệt tình, sự kiện cộng đồng diễn ra thường xuyên.' },
  { icon: 'BiBuildings', title: 'Xây dựng thoả thích', text: 'Bảo vệ đất, kinh tế người chơi, nhiệm vụ và vô số hoạt động để bạn chill cùng bạn bè.' },
  { icon: 'BiShieldQuarter', title: 'Công bằng & an toàn', text: 'Chống hack, chống grief, luật rõ ràng. Mọi giao dịch cửa hàng đều được giao tự động.' },
];

export const HOW_TO_JOIN = [
  { title: 'Mở Minecraft Java', text: 'Hỗ trợ bản chính hãng và TLauncher. Khuyến nghị phiên bản mới nhất.' },
  { title: 'Thêm máy chủ', text: 'Vào Multiplayer → Add Server, dán địa chỉ IP của BuildnChill.' },
  { title: 'Đăng ký & vào chơi', text: 'Dùng /register <mật khẩu> trong lần đầu, sau đó /login mỗi lần vào.' },
];

export const RULE_GROUPS = [
  {
    title: 'Luật chung',
    rules: [
      'Tôn trọng tất cả người chơi và đội ngũ quản trị.',
      'Không xúc phạm, phân biệt vùng miền, giới tính, tôn giáo hay chủ đề nhạy cảm.',
      'Không spam chat, quảng cáo server/website khác dưới mọi hình thức.',
      'Không mạo danh người chơi khác hoặc Ban quản trị.',
    ],
  },
  {
    title: 'Gameplay',
    rules: [
      'Nghiêm cấm sử dụng hack, client chỉnh sửa (X-ray, KillAura, Fly...) hoặc macro tự động.',
      'Không lợi dụng lỗi (bug/dupe). Phát hiện lỗi hãy báo ngay cho Admin để được thưởng.',
      'Không phá hoại (grief), trộm đồ trong khu vực đã được bảo vệ của người khác.',
      'Hạn chế xây farm gây lag; Admin có quyền gỡ bỏ công trình ảnh hưởng hiệu năng máy chủ.',
    ],
  },
  {
    title: 'Giao dịch & cửa hàng',
    rules: [
      'Mọi giao dịch mua bán giữa người chơi bằng tiền thật đều tự chịu trách nhiệm.',
      'Vật phẩm mua tại cửa hàng được giao tự động khi bạn đang online trong máy chủ.',
      'Nhập đúng tên nhân vật khi mua hàng — sai tên sẽ không được hoàn tiền.',
      'Cố tình gian lận thanh toán, chargeback sẽ bị khoá tài khoản vĩnh viễn.',
    ],
  },
  {
    title: 'Hình phạt',
    rules: [
      'Tuỳ mức độ vi phạm: cảnh cáo → mute → kick → ban có thời hạn → ban vĩnh viễn.',
      'Khiếu nại hình phạt vui lòng gửi qua mục Liên hệ hoặc Discord kèm bằng chứng.',
    ],
  },
];

export const FAQS = [
  {
    q: 'Làm sao để vào máy chủ BuildnChill?',
    a: 'Mở Minecraft Java Edition (bản chính hãng hoặc TLauncher), chọn Multiplayer → Add Server và nhập địa chỉ IP hiển thị trên trang chủ. Lần đầu vào game hãy dùng /register <mật khẩu>.',
  },
  {
    q: 'Server hỗ trợ phiên bản nào?',
    a: 'BuildnChill hỗ trợ phiên bản mới nhất được ghi trên trang chủ và một số phiên bản gần đó. Khuyến nghị dùng đúng phiên bản để trải nghiệm tốt nhất.',
  },
  {
    q: 'Mua vật phẩm xong bao lâu thì nhận được?',
    a: 'Thanh toán chuyển khoản được xác nhận tự động trong khoảng 10–60 giây. Vật phẩm được giao ngay khi bạn đang online trong máy chủ; nếu offline, hệ thống sẽ giao ở lần đăng nhập tiếp theo.',
  },
  {
    q: 'Tôi chuyển khoản nhưng chưa nhận được hàng?',
    a: 'Kiểm tra lại nội dung chuyển khoản phải đúng mã đơn (dạng BNCxxxxxx). Nếu đã quá 10 phút, gửi Liên hệ với mục "Thanh toán / Nạp tiền" kèm ảnh biên lai, Admin sẽ xử lý sớm nhất.',
  },
  {
    q: 'Nạp tiền vào ví website như thế nào?',
    a: 'Đăng nhập website → Nạp tiền, nhập số tiền và quét mã QR. Nội dung chuyển khoản là NAP <tên tài khoản>. Tiền được cộng tự động, sau đó bạn có thể mua mọi vật phẩm chỉ với 1 cú nhấp.',
  },
  {
    q: 'Tôi bị ban oan, phải làm sao?',
    a: 'Gửi đơn kháng cáo qua mục Liên hệ (danh mục Báo cáo) hoặc mở ticket trên Discord, kèm tên nhân vật và thời điểm bị xử phạt.',
  },
];
