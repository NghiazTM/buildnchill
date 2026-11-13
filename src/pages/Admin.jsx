import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useData } from '../context/DataContext';
import { generateContactCode, generateOrderCode } from '../utils/helpers';
import RichTextEditor from '../components/RichTextEditor';
import ShopCategoriesManagement from '../components/ShopCategoriesManagement';
import ShopProductsManagement from '../components/ShopProductsManagement';
import ShopOrdersManagement from '../components/ShopOrdersManagement';
import UserManagement from '../components/UserManagement';
import CarouselManagement from '../components/CarouselManagement';
import WalletManagement from '../components/WalletManagement';
import RechargeManagement from '../components/RechargeManagement';
import { Seo, StatusBadge, useToast } from '../components/ui';
import { ORDER_STATUS, formatVnd, mcHead } from '../lib/api';
import '../styles/admin.css';
import {
  BiBarChart, BiNews, BiServer, BiCog, BiPlus, BiTrash, BiLogOutCircle, BiCheckCircle, BiEnvelope,
  BiCheck, BiImage, BiShoppingBag, BiUser, BiShow, BiWallet, BiCreditCard, BiRefresh, BiX,
  BiCategory, BiPackage, BiErrorCircle, BiTime, BiEdit,
} from 'react-icons/bi';

const CONTACT_STATUS = {
  pending: { label: 'Chờ phản hồi', cls: 'pending' },
  processing: { label: 'Đang kiểm tra', cls: 'paid' },
  resolved: { label: 'Đã xử lý', cls: 'delivered' },
};

const CONTACT_CATEGORY = {
  report: 'Báo cáo', bug: 'Báo lỗi', help: 'Trợ giúp', suggestion: 'Đề xuất', payment: 'Thanh toán', other: 'Khác',
};

const Admin = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    news, serverStatus, contacts, siteSettings, isAuthenticated, userProfile, logout,
    updateNews, addNews, deleteNews, updateServerStatus, updateSiteSettings,
    markContactAsRead, updateContactStatus, deleteContact,
  } = useData();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [formData, setFormData] = useState({
    title: '', content: '', image: '', date: new Date().toISOString().split('T')[0], description: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [serverForm, setServerForm] = useState({ status: 'Online', players: '', maxPlayers: '500', version: '1.20.4' });
  const [settingsForm, setSettingsForm] = useState({
    server_ip: '', server_version: '', contact_email: '', contact_phone: '', discord_url: '', site_title: '',
  });
  const [selectedContact, setSelectedContact] = useState(null);
  const [topDateRange, setTopDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [stats, setStats] = useState({
    pendingOrders: 0, monthlyOrders: 0, yearlyOrders: 0, totalOrders: 0,
    monthlyRevenue: 0, yearlyRevenue: 0, totalRevenue: 0,
    revenueByDay: [], topProducts: [], topDonators: [], recentOrders: [], recentContacts: [],
    pendingRecharges: 0, deliveryQueue: 0, deliveryFailed: 0, unpaidOrders: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  const loadDashboardStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [ordersRes, contactsRes, rechargesRes, queueRes, failedRes] = await Promise.all([
        supabase.from('orders')
          .select('id, created_at, paid_at, price, status, delivered, product, mc_username, payment_code, payment_method, products(name)')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase.from('contacts').select('*').eq('is_deleted', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('recharges').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('deliveries').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing']),
        supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ]);

      const allOrders = ordersRes.data || [];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let mOrders = 0; let yOrders = 0; let mRevenue = 0; let yRevenue = 0; let tRevenue = 0;
      const productCounts = {};
      const userSpending = {};

      const topStartDate = topDateRange.start ? new Date(topDateRange.start) : null;
      if (topStartDate) topStartDate.setHours(0, 0, 0, 0);
      const topEndDate = topDateRange.end ? new Date(topDateRange.end) : null;
      if (topEndDate) topEndDate.setHours(23, 59, 59, 999);

      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return {
          date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
          revenue: 0,
          fullDate: d.toLocaleDateString('en-CA'),
        };
      }).reverse();

      allOrders.forEach((order) => {
        const isPaid = order.status === 'paid' || order.status === 'delivered';
        const orderDate = new Date(order.paid_at || order.created_at);
        const price = Math.round(Number(order.price || 0));

        if (orderDate.getFullYear() === currentYear) {
          yOrders++;
          if (orderDate.getMonth() === currentMonth) mOrders++;
        }
        if (!isPaid) return;

        tRevenue += price;
        const pName = order.product || order.products?.name || 'Ẩn danh';
        productCounts[pName] = (productCounts[pName] || 0) + 1;

        const inRange = (!topStartDate || orderDate >= topStartDate) && (!topEndDate || orderDate <= topEndDate);
        if (inRange) {
          const username = order.mc_username || 'Ẩn danh';
          userSpending[username] = (userSpending[username] || 0) + price;
        }

        if (orderDate.getFullYear() === currentYear) {
          yRevenue += price;
          if (orderDate.getMonth() === currentMonth) mRevenue += price;
        }

        const dayStat = last7Days.find((d) => d.fullDate === orderDate.toLocaleDateString('en-CA'));
        if (dayStat) dayStat.revenue += price;
      });

      const topProducts = Object.entries(productCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const topDonators = Object.entries(userSpending)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setStats({
        pendingOrders: allOrders.filter((o) => o.status === 'paid').length,
        unpaidOrders: allOrders.filter((o) => o.status === 'pending' || o.status === 'underpaid').length,
        monthlyOrders: mOrders,
        yearlyOrders: yOrders,
        totalOrders: allOrders.length,
        monthlyRevenue: mRevenue,
        yearlyRevenue: yRevenue,
        totalRevenue: tRevenue,
        revenueByDay: last7Days,
        topProducts,
        topDonators,
        recentOrders: allOrders.slice(0, 6),
        recentContacts: contactsRes.data || [],
        pendingRecharges: rechargesRes.count || 0,
        deliveryQueue: queueRes.count || 0,
        deliveryFailed: failedRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [topDateRange]);

  useEffect(() => {
    if (isAuthenticated && userProfile?.role === 'admin') {
      setServerForm({
        status: serverStatus?.status || 'Online',
        players: serverStatus?.players || '0',
        maxPlayers: serverStatus?.maxPlayers || '500',
        version: serverStatus?.version || '1.20.4',
      });
      if (siteSettings) {
        setSettingsForm({
          server_ip: siteSettings.server_ip || '',
          server_version: siteSettings.server_version || '',
          contact_email: siteSettings.contact_email || '',
          contact_phone: siteSettings.contact_phone || '',
          discord_url: siteSettings.discord_url || '',
          site_title: siteSettings.site_title || '',
        });
      }
    }
  }, [isAuthenticated, userProfile, serverStatus, siteSettings]);

  useEffect(() => {
    if (isAuthenticated && userProfile?.role === 'admin') loadDashboardStats();
  }, [isAuthenticated, userProfile?.role, loadDashboardStats]);

  useEffect(() => {
    const onUpdate = () => { if (activeTab === 'dashboard') loadDashboardStats(); };
    window.addEventListener('orders_updated', onUpdate);
    window.addEventListener('recharge_updated', onUpdate);
    return () => {
      window.removeEventListener('orders_updated', onUpdate);
      window.removeEventListener('recharge_updated', onUpdate);
    };
  }, [activeTab, loadDashboardStats]);

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleServerChange = (e) => setServerForm({ ...serverForm, [e.target.name]: e.target.value });
  const handleSettingsChange = (e) => setSettingsForm({ ...settingsForm, [e.target.name]: e.target.value });
  const handleImageChange = (e) => { if (e.target.files[0]) setImageFile(e.target.files[0]); };

  const uploadImage = async () => {
    if (!imageFile) return formData.image;
    try {
      setUploading(true);
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('news').upload(fileName, imageFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('news').getPublicUrl(fileName);
      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast('Tải ảnh lên thất bại, giữ ảnh cũ', 'error');
      return formData.image;
    } finally {
      setUploading(false);
    }
  };

  const handleSettingsSave = async () => {
    const success = await updateSiteSettings(settingsForm);
    toast(success ? 'Đã lưu cài đặt website' : 'Lưu cài đặt thất bại', success ? 'success' : 'error');
  };

  const handleAddNew = () => {
    setEditingPost(null);
    setImageFile(null);
    setFormData({ title: '', content: '', image: '', date: new Date().toISOString().split('T')[0], description: '' });
    setShowModal(true);
  };

  const handleEdit = (post) => {
    setEditingPost(post);
    setImageFile(null);
    setFormData({ title: post.title, content: post.content, image: post.image, date: post.date, description: post.description });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast('Vui lòng nhập tiêu đề bài viết', 'error');
      return;
    }
    const finalImageUrl = await uploadImage();
    const finalFormData = { ...formData, image: finalImageUrl };
    const success = editingPost ? await updateNews(editingPost.id, finalFormData) : await addNews(finalFormData);
    if (success) {
      toast(editingPost ? 'Đã cập nhật bài viết' : 'Đã đăng bài viết mới (đã gửi thông báo Discord nếu có cấu hình)', 'success');
      setShowModal(false);
    } else {
      toast('Lưu bài viết thất bại', 'error');
    }
  };

  const handleDelete = async (postId) => {
    if (window.confirm('Xóa bài viết này?')) {
      const ok = await deleteNews(postId);
      toast(ok ? 'Đã xoá bài viết' : 'Xoá thất bại', ok ? 'success' : 'error');
    }
  };

  const handleServerSave = async () => {
    const success = await updateServerStatus(serverForm);
    toast(success ? 'Đã cập nhật trạng thái máy chủ' : 'Cập nhật thất bại', success ? 'success' : 'error');
  };

  const handleContactStatus = async (id, status) => {
    const ok = await updateContactStatus(id, status);
    toast(ok ? 'Đã cập nhật trạng thái liên hệ' : 'Cập nhật thất bại', ok ? 'success' : 'error');
    if (ok) setSelectedContact((c) => (c && c.id === id ? { ...c, status } : c));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const unreadContacts = contacts.filter((c) => !c.read).length;

  const groups = [
    {
      label: 'Tổng quan',
      tabs: [{ id: 'dashboard', label: 'Bảng điều khiển', icon: BiBarChart }],
    },
    {
      label: 'Cửa hàng',
      tabs: [
        { id: 'orders', label: 'Đơn hàng', icon: BiPackage, count: stats.deliveryFailed || 0 },
        { id: 'products', label: 'Sản phẩm', icon: BiShoppingBag },
        { id: 'categories', label: 'Danh mục', icon: BiCategory },
        { id: 'recharges', label: 'Nạp tiền', icon: BiCreditCard, count: stats.pendingRecharges || 0 },
        { id: 'wallets', label: 'Ví người dùng', icon: BiWallet },
      ],
    },
    {
      label: 'Nội dung',
      tabs: [
        { id: 'news', label: 'Tin tức', icon: BiNews },
        { id: 'carousel', label: 'Ảnh trình chiếu', icon: BiImage },
        { id: 'contacts', label: 'Liên hệ', icon: BiEnvelope, count: unreadContacts },
      ],
    },
    {
      label: 'Hệ thống',
      tabs: [
        { id: 'users', label: 'Người dùng', icon: BiUser },
        { id: 'server', label: 'Trạng thái server', icon: BiServer },
        { id: 'settings', label: 'Cài đặt website', icon: BiCog },
      ],
    },
  ];
  const allTabs = groups.flatMap((g) => g.tabs);

  const TabButton = ({ tab }) => (
    <button className={`bnc-admin-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
      <tab.icon size={19} />
      <span>{tab.label}</span>
      {tab.count > 0 && <span className="count">{tab.count}</span>}
    </button>
  );

  const maxDay = Math.max(1, ...stats.revenueByDay.map((d) => d.revenue));
  const maxProduct = Math.max(1, ...stats.topProducts.map((p) => p.count));

  return (
    <div className="bnc-admin">
      <Seo title="Quản trị" />
      <aside className="bnc-admin-side">
        <div className="head">
          <div className="t">ADMIN PANEL</div>
          <div className="s">BUILDNCHILL</div>
        </div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="grp">{g.label}</div>
            {g.tabs.map((t) => <TabButton key={t.id} tab={t} />)}
          </div>
        ))}
        <button className="bnc-admin-tab logout" onClick={handleLogout}>
          <BiLogOutCircle size={19} /> <span>Đăng xuất</span>
        </button>
      </aside>

      <nav className="bnc-admin-mobilebar" aria-label="Menu quản trị">
        {allTabs.map((t) => <TabButton key={t.id} tab={t} />)}
      </nav>

      <div className="bnc-admin-main">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {activeTab === 'dashboard' && (
            <div>
              <div className="bnc-admin-title">
                <div>
                  <h2>Tổng quan hệ thống</h2>
                  <p>Xin chào <b className="text-accent">{userProfile?.username}</b>, đây là tình hình hôm nay.</p>
                </div>
                <button className="bnc-btn bnc-btn-dark bnc-btn-sm" onClick={loadDashboardStats} disabled={statsLoading}>
                  <BiRefresh size={18} className={statsLoading ? 'spin' : ''} /> Làm mới
                </button>
              </div>

              <div className="row g-3 mb-4">
                {[
                  { label: 'Doanh thu tháng', value: formatVnd(stats.monthlyRevenue), icon: BiCreditCard, cls: 'green' },
                  { label: 'Doanh thu năm', value: formatVnd(stats.yearlyRevenue), icon: BiBarChart, cls: '' },
                  { label: 'Hàng đợi giao', value: stats.deliveryQueue, icon: BiTime, cls: 'blue', tab: 'orders' },
                  { label: 'Giao lỗi', value: stats.deliveryFailed, icon: BiErrorCircle, cls: 'red', tab: 'orders' },
                  { label: 'Đơn chờ thanh toán', value: stats.unpaidOrders, icon: BiShoppingBag, cls: '', tab: 'orders' },
                  { label: 'Đơn tháng này', value: stats.monthlyOrders, icon: BiPackage, cls: 'blue' },
                  { label: 'Nạp tiền chờ duyệt', value: stats.pendingRecharges, icon: BiWallet, cls: '', tab: 'recharges' },
                  { label: 'Liên hệ chưa đọc', value: unreadContacts, icon: BiEnvelope, cls: 'red', tab: 'contacts' },
                ].map((s) => (
                  <div key={s.label} className="col-6 col-xl-3">
                    <div
                      className={`bnc-card ${s.tab ? 'bnc-card-hover cursor-pointer' : ''} bnc-stat`}
                      onClick={s.tab ? () => setActiveTab(s.tab) : undefined}
                    >
                      <div className={`ico ${s.cls}`}><s.icon size={24} /></div>
                      <div className="min-w-0">
                        <div className="lbl">{s.label}</div>
                        <div className="val text-truncate">{s.value}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="row g-3">
                <div className="col-lg-7">
                  <div className="bnc-card bnc-card-pad h-100">
                    <div className="d-flex justify-content-between align-items-center">
                      <h5 className="fw-black m-0">Doanh thu 7 ngày</h5>
                      <span className="text-dim small fw-bold">Tổng: <span className="text-accent">{formatVnd(stats.totalRevenue)}</span></span>
                    </div>
                    <div className="bnc-chart">
                      {stats.revenueByDay.map((d) => (
                        <div className="col" key={d.fullDate}>
                          <div className="b" data-v={formatVnd(d.revenue)} style={{ height: `${Math.max(2, (d.revenue / maxDay) * 100)}%` }} />
                          <div className="d">{d.date}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="col-lg-5">
                  <div className="bnc-card bnc-card-pad h-100">
                    <h5 className="fw-black mb-3">Sản phẩm bán chạy</h5>
                    {stats.topProducts.length === 0 && <div className="bnc-empty py-3">Chưa có dữ liệu</div>}
                    <div className="d-flex flex-column gap-3">
                      {stats.topProducts.map((p) => (
                        <div key={p.name}>
                          <div className="d-flex justify-content-between small fw-bold mb-1">
                            <span className="text-truncate me-2">{p.name}</span>
                            <span className="text-accent">{p.count}</span>
                          </div>
                          <div className="bnc-bar"><span style={{ width: `${(p.count / maxProduct) * 100}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="col-lg-5">
                  <div className="bnc-card bnc-card-pad h-100">
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                      <h5 className="fw-black m-0">Top ủng hộ</h5>
                      <div className="bnc-date-range">
                        <input type="date" className="bnc-input py-1 px-2 small" value={topDateRange.start}
                          onChange={(e) => setTopDateRange({ ...topDateRange, start: e.target.value })} />
                        <span className="text-dim">→</span>
                        <input type="date" className="bnc-input py-1 px-2 small" value={topDateRange.end}
                          onChange={(e) => setTopDateRange({ ...topDateRange, end: e.target.value })} />
                      </div>
                    </div>
                    {stats.topDonators.length === 0 && <div className="bnc-empty py-3">Chưa có dữ liệu trong khoảng này</div>}
                    <div className="d-flex flex-column gap-2">
                      {stats.topDonators.map((d, i) => (
                        <div key={d.name} className="bnc-rank">
                          <span className={`bnc-rank-no ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                          <img src={mcHead(d.name, 32)} alt="" />
                          <span className="fw-bold flex-grow-1 text-truncate">{d.name}</span>
                          <span className="fw-black text-success">{formatVnd(d.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="col-lg-7">
                  <div className="bnc-card h-100">
                    <div className="d-flex justify-content-between align-items-center p-3 pb-0">
                      <h5 className="fw-black m-0 ps-2">Đơn hàng gần đây</h5>
                      <button className="bnc-btn bnc-btn-ghost bnc-btn-sm" onClick={() => setActiveTab('orders')}>Xem tất cả</button>
                    </div>
                    <div className="table-responsive">
                      <table className="bnc-admin-table">
                        <thead>
                          <tr><th>Mã</th><th>Người chơi</th><th>Sản phẩm</th><th className="text-end">Giá</th><th>Trạng thái</th></tr>
                        </thead>
                        <tbody>
                          {stats.recentOrders.map((o) => (
                            <tr key={o.id}>
                              <td><span className="bnc-code">{o.payment_code || generateOrderCode(o.id)}</span></td>
                              <td>
                                <div className="d-flex align-items-center gap-2">
                                  <img className="avatar" src={mcHead(o.mc_username, 32)} alt="" />
                                  <span className="fw-bold">{o.mc_username}</span>
                                </div>
                              </td>
                              <td className="small">{o.product || o.products?.name}</td>
                              <td className="text-end fw-bold text-accent">{formatVnd(o.price)}</td>
                              <td><StatusBadge status={o.status} label={ORDER_STATUS[o.status] || o.status} /></td>
                            </tr>
                          ))}
                          {stats.recentOrders.length === 0 && (
                            <tr><td colSpan="5" className="bnc-empty">Chưa có đơn hàng</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'categories' && <ShopCategoriesManagement />}
          {activeTab === 'products' && <ShopProductsManagement />}
          {activeTab === 'orders' && <ShopOrdersManagement />}
          {activeTab === 'recharges' && <RechargeManagement />}
          {activeTab === 'wallets' && <WalletManagement />}
          {activeTab === 'carousel' && <CarouselManagement />}

          {activeTab === 'news' && (
            <div>
              <div className="bnc-admin-title">
                <div>
                  <h2>Quản lý tin tức</h2>
                  <p>Bài mới sẽ được tự động thông báo lên kênh Discord tin tức (nếu đã cấu hình).</p>
                </div>
                <button className="bnc-btn bnc-btn-sm" onClick={handleAddNew}><BiPlus size={18} /> Viết bài mới</button>
              </div>
              <div className="row g-3">
                {news.map((post) => (
                  <div key={post.id} className="col-md-6 col-xl-4">
                    <div className="bnc-card h-100 d-flex flex-column">
                      <img src={post.image || '/img/blog-cover.jpg'} className="bnc-admin-thumb" alt={post.title} />
                      <div className="p-3 d-flex flex-column flex-grow-1">
                        <span className="text-dim small fw-bold mb-1">{post.date}</span>
                        <h6 className="fw-black text-truncate-2 mb-2">{post.title}</h6>
                        <p className="small text-soft text-truncate-2 mb-3">{post.description}</p>
                        <div className="d-flex gap-2 mt-auto">
                          <button className="bnc-btn bnc-btn-dark bnc-btn-sm flex-grow-1" onClick={() => handleEdit(post)}><BiEdit /> Sửa</button>
                          <button className="bnc-icon-btn danger" onClick={() => handleDelete(post.id)} aria-label="Xoá"><BiTrash /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {news.length === 0 && <div className="col-12 bnc-empty">Chưa có bài viết nào</div>}
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div>
              <div className="bnc-admin-title">
                <div>
                  <h2>Liên hệ & hỗ trợ</h2>
                  <p>Cập nhật trạng thái sẽ đồng bộ màu tin nhắn trên kênh Discord liên hệ.</p>
                </div>
              </div>
              <div className="bnc-card">
                <div className="table-responsive">
                  <table className="bnc-admin-table">
                    <thead>
                      <tr><th>Mã</th><th>Người gửi</th><th>Danh mục</th><th>Tiêu đề</th><th>Ngày gửi</th><th>Trạng thái</th><th className="text-end">Thao tác</th></tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => {
                        const st = CONTACT_STATUS[c.status] || CONTACT_STATUS.pending;
                        return (
                          <tr key={c.id} style={!c.read ? { boxShadow: 'inset 3px 0 0 var(--bnc-accent)' } : undefined}>
                            <td><span className="bnc-code">{generateContactCode(c.id)}</span></td>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <img className="avatar" src={mcHead(c.ign || c.name, 32)} alt="" />
                                <span className={c.read ? 'fw-semibold' : 'fw-black'}>{c.ign || c.name}</span>
                              </div>
                            </td>
                            <td className="small text-soft">{CONTACT_CATEGORY[c.category] || 'Khác'}</td>
                            <td className="text-truncate small" style={{ maxWidth: 220 }}>{c.subject}</td>
                            <td className="small text-soft">{new Date(c.created_at).toLocaleDateString('vi-VN')}</td>
                            <td><StatusBadge status={st.cls} label={st.label} /></td>
                            <td className="text-end">
                              <div className="d-inline-flex gap-2">
                                <button className="bnc-icon-btn" aria-label="Xem" onClick={() => {
                                  setSelectedContact(c);
                                  if (!c.read) markContactAsRead(c.id);
                                }}><BiShow /></button>
                                <button className="bnc-icon-btn danger" aria-label="Xoá" onClick={async () => {
                                  if (!window.confirm('Xoá liên hệ này?')) return;
                                  const ok = await deleteContact(c.id);
                                  toast(ok ? 'Đã xoá liên hệ' : 'Xoá thất bại', ok ? 'success' : 'error');
                                }}><BiTrash /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {contacts.length === 0 && <tr><td colSpan="7" className="bnc-empty">Chưa có liên hệ nào</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'server' && (
            <div>
              <div className="bnc-admin-title">
                <div>
                  <h2>Trạng thái máy chủ</h2>
                  <p>Trạng thái thực tế được cập nhật tự động từ mcsrvstat khi admin truy cập website.</p>
                </div>
                <button className="bnc-btn bnc-btn-sm" onClick={handleServerSave}><BiCheck size={18} /> Lưu thay đổi</button>
              </div>
              <div className="bnc-card bnc-card-pad">
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="bnc-label">Trạng thái hiển thị</label>
                    <select className="bnc-select" name="status" value={serverForm.status} onChange={handleServerChange}>
                      <option value="Online">Hoạt động (Online)</option>
                      <option value="Offline">Bảo trì (Offline)</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Phiên bản hỗ trợ</label>
                    <input className="bnc-input" name="version" value={serverForm.version} onChange={handleServerChange} placeholder="VD: 1.21.4" />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Số người chơi hiện tại</label>
                    <input className="bnc-input" name="players" value={serverForm.players} onChange={handleServerChange} placeholder="VD: 15" />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Giới hạn người chơi</label>
                    <input className="bnc-input" name="maxPlayers" value={serverForm.maxPlayers} onChange={handleServerChange} placeholder="VD: 500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              <div className="bnc-admin-title">
                <div>
                  <h2>Cài đặt website</h2>
                  <p>Thông tin hiển thị trên toàn bộ website (menu, chân trang, trang chủ).</p>
                </div>
                <button className="bnc-btn bnc-btn-sm" onClick={handleSettingsSave}><BiCheck size={18} /> Lưu cấu hình</button>
              </div>
              <div className="bnc-card bnc-card-pad">
                <div className="row g-4">
                  <div className="col-md-12">
                    <label className="bnc-label">Tiêu đề trang web</label>
                    <input className="bnc-input" name="site_title" value={settingsForm.site_title} onChange={handleSettingsChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Địa chỉ IP máy chủ</label>
                    <input className="bnc-input" name="server_ip" value={settingsForm.server_ip} onChange={handleSettingsChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Phiên bản</label>
                    <input className="bnc-input" name="server_version" value={settingsForm.server_version} onChange={handleSettingsChange} placeholder="VD: 1.21.4" />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Email liên hệ</label>
                    <input className="bnc-input" name="contact_email" value={settingsForm.contact_email} onChange={handleSettingsChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="bnc-label">Số điện thoại / Zalo</label>
                    <input className="bnc-input" name="contact_phone" value={settingsForm.contact_phone} onChange={handleSettingsChange} />
                  </div>
                  <div className="col-md-12">
                    <label className="bnc-label">Link Discord</label>
                    <input className="bnc-input" name="discord_url" value={settingsForm.discord_url} onChange={handleSettingsChange} placeholder="https://discord.gg/..." />
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Modal tin tức */}
      <AnimatePresence>
        {showModal && (
          <div className="bnc-overlay" onClick={() => setShowModal(false)}>
            <motion.div
              className="bnc-modal bnc-modal-lg"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>{editingPost ? 'Sửa bài viết' : 'Thêm tin tức mới'}</h3>
                <button className="bnc-x" onClick={() => setShowModal(false)} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <div className="bnc-modal-body">
                <div className="row g-3 mb-3">
                  <div className="col-md-8">
                    <label className="bnc-label">Tiêu đề bài viết</label>
                    <input className="bnc-input" name="title" value={formData.title} onChange={handleInputChange} />
                  </div>
                  <div className="col-md-4">
                    <label className="bnc-label">Ngày đăng</label>
                    <input type="date" className="bnc-input" name="date" value={formData.date || ''} onChange={handleInputChange} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Mô tả ngắn</label>
                  <textarea className="bnc-textarea" rows="2" name="description" value={formData.description} onChange={handleInputChange} />
                </div>
                <div className="mb-3">
                  <label className="bnc-label">Hình ảnh minh hoạ</label>
                  <div className="d-flex gap-3 align-items-center">
                    <div className="rounded-3 overflow-hidden flex-shrink-0" style={{ width: 120, height: 80, background: 'var(--bnc-bg-deep)' }}>
                      <img src={imageFile ? URL.createObjectURL(imageFile) : (formData.image || '/img/blog-cover.jpg')} className="w-100 h-100 object-fit-cover" alt="" />
                    </div>
                    <div className="flex-grow-1 min-w-0">
                      <input type="file" className="form-control form-control-sm mb-2" onChange={handleImageChange} accept="image/*" />
                      <input className="bnc-input py-2 small" name="image" value={formData.image} onChange={handleInputChange} placeholder="Hoặc dán URL ảnh..." />
                    </div>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="bnc-label">Nội dung chi tiết</label>
                  <RichTextEditor value={formData.content} onChange={(val) => setFormData((f) => ({ ...f, content: val }))} />
                </div>
                <div className="d-flex gap-2">
                  <button className="bnc-btn flex-grow-1" onClick={handleSave} disabled={uploading}>
                    {uploading ? 'Đang tải ảnh...' : 'Lưu bài viết'}
                  </button>
                  <button className="bnc-btn bnc-btn-dark" onClick={() => setShowModal(false)}>Huỷ</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {selectedContact && (
          <div className="bnc-overlay" onClick={() => setSelectedContact(null)}>
            <motion.div
              className="bnc-modal"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bnc-modal-head">
                <h3>Liên hệ {generateContactCode(selectedContact.id)}</h3>
                <button className="bnc-x" onClick={() => setSelectedContact(null)} aria-label="Đóng"><BiX size={20} /></button>
              </div>
              <div className="bnc-modal-body">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <img src={mcHead(selectedContact.ign || selectedContact.name, 64)} alt="" width="52" height="52" className="rounded-3" />
                  <div className="min-w-0">
                    <div className="fw-black">{selectedContact.ign || selectedContact.name}</div>
                    <div className="small text-soft text-truncate">
                      {[selectedContact.email, selectedContact.phone].filter(Boolean).join(' • ') || 'Không có thông tin liên lạc'}
                    </div>
                  </div>
                  <div className="ms-auto">
                    <StatusBadge
                      status={(CONTACT_STATUS[selectedContact.status] || CONTACT_STATUS.pending).cls}
                      label={(CONTACT_STATUS[selectedContact.status] || CONTACT_STATUS.pending).label}
                    />
                  </div>
                </div>
                <div className="bnc-kv"><span className="k">Danh mục</span><span className="v">{CONTACT_CATEGORY[selectedContact.category] || 'Khác'}</span></div>
                <div className="bnc-kv"><span className="k">Thời gian</span><span className="v">{new Date(selectedContact.created_at).toLocaleString('vi-VN')}</span></div>
                {selectedContact.subject && (
                  <div className="bnc-kv"><span className="k">Tiêu đề</span><span className="v">{selectedContact.subject}</span></div>
                )}
                <label className="bnc-label mt-3">Nội dung</label>
                <div className="bnc-pre" style={{ fontFamily: 'inherit', fontSize: '.92rem' }}>{selectedContact.message}</div>
                {selectedContact.image_url && (
                  <a href={selectedContact.image_url} target="_blank" rel="noopener noreferrer" className="d-block mt-3">
                    <img src={selectedContact.image_url} alt="Ảnh đính kèm" className="w-100 rounded-3" style={{ maxHeight: 260, objectFit: 'cover' }} />
                  </a>
                )}
                <div className="d-flex flex-wrap gap-2 mt-4">
                  {selectedContact.status !== 'processing' && selectedContact.status !== 'resolved' && (
                    <button className="bnc-btn bnc-btn-dark bnc-btn-sm" onClick={() => handleContactStatus(selectedContact.id, 'processing')}>
                      <BiTime /> Đang kiểm tra
                    </button>
                  )}
                  {selectedContact.status !== 'resolved' && (
                    <button className="bnc-btn bnc-btn-green bnc-btn-sm flex-grow-1" onClick={() => handleContactStatus(selectedContact.id, 'resolved')}>
                      <BiCheckCircle /> Đánh dấu đã giải quyết
                    </button>
                  )}
                  <button className="bnc-btn bnc-btn-ghost bnc-btn-sm" onClick={() => setSelectedContact(null)}>Đóng</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Admin;
