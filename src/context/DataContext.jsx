import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { slugify } from '../utils/helpers';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children }) => {
  // Helper để lưu/lấy data từ localStorage giúp chống mất dữ liệu khi F5 hoặc để lâu
  const getPersistedData = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`bnc_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const persistData = (key, data) => {
    try {
      localStorage.setItem(`bnc_${key}`, JSON.stringify(data));
    } catch (err) {
      console.error('Persist error:', err);
    }
  };

  const [news, setNews] = useState(() => getPersistedData('news', []));
  const [serverStatus, setServerStatus] = useState(() => getPersistedData('status', {
    status: 'Online',
    players: '0',
    maxPlayers: '500',
    version: '1.20.4'
  }));
  const [contacts, setContacts] = useState(() => getPersistedData('contacts', []));
  const [siteSettings, setSiteSettings] = useState(() => getPersistedData('settings', {
    server_ip: 'buildnchill.id.vn',
    server_version: '1.20.4',
    contact_email: 'admin@buildnchill.vn',
    site_title: 'BuildnChill'
  }));
  const [carouselImages, setCarouselImages] = useState(() => getPersistedData('carousel', []));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync state với localStorage mỗi khi thay đổi
  useEffect(() => { persistData('news', news); }, [news]);
  useEffect(() => { persistData('status', serverStatus); }, [serverStatus]);
  useEffect(() => { persistData('contacts', contacts); }, [contacts]);
  useEffect(() => { persistData('settings', siteSettings); }, [siteSettings]);
  useEffect(() => { persistData('carousel', carouselImages); }, [carouselImages]);

  const fetchUserProfile = async (userId) => {
    if (!userId) {
      setUserProfile(null);
      return null;
    }
    try {
      // Sử dụng select().eq().maybeSingle() để tránh lỗi nếu chưa có profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const { data: walletData } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      const fullProfile = profileData ? {
        ...profileData,
        wallet_balance: walletData?.balance || 0
      } : null;

      setUserProfile(fullProfile);
      return fullProfile;
    } catch (err) {
      console.error('Error fetching profile:', err);
      return null;
    }
  };

  const login = async (username, password) => {
    try {
      const email = `${username.toLowerCase().trim()}@buildnchill.vn`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (username, password) => {
    try {
      const email = `${username.toLowerCase().trim()}@buildnchill.vn`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Register error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setIsAuthenticated(false);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update password error:', error);
      return false;
    }
  };

  const loadData = async (profile) => {
    try {
      const newsPromise = supabase.from('news').select('*').eq('is_deleted', false).order('date', { ascending: false });
      const settingsPromise = supabase.from('site_settings').select('*').eq('id', 1).maybeSingle();
      const statusPromise = supabase.from('server_status').select('*').eq('id', 1).maybeSingle();
      const contactsPromise = supabase.from('contacts').select('*').eq('is_deleted', false).order('created_at', { ascending: false });
      const carouselPromise = supabase.from('carousel_images').select('*').eq('is_active', true).order('display_order', { ascending: true });

      const [newsRes, settingsRes, statusRes, contactsRes, carouselRes] = await Promise.all([
        newsPromise, 
        settingsPromise, 
        statusPromise,
        contactsPromise,
        carouselPromise
      ]);

      // CHỈ CẬP NHẬT NẾU CÓ DỮ LIỆU TRẢ VỀ, KHÔNG OVERWRITE BẰNG NULL/EMPTY KHI LỖI
      if (newsRes.data && newsRes.data.length > 0) {
        setNews(newsRes.data.map(item => ({ ...item, slug: item.slug || slugify(item.title) })));
      }
      
      if (contactsRes.data && contactsRes.data.length > 0) {
        setContacts(contactsRes.data);
      }
      
      if (carouselRes.data && carouselRes.data.length > 0) {
        setCarouselImages(carouselRes.data);
      }
      
      if (settingsRes.data) {
        setSiteSettings(settingsRes.data);
        refreshMinecraftStatus(settingsRes.data.server_ip, profile);
      }
      
      if (statusRes.data) {
        setServerStatus({ 
          status: statusRes.data.status, 
          players: statusRes.data.players, 
          maxPlayers: statusRes.data.max_players, 
          version: statusRes.data.version 
        });
      }
    } catch (error) {
      console.error('Data persistence layer: API fail, keeping existing state.', error);
      // Giữ nguyên state cũ, không set về []
    }
  };

  const refreshMinecraftStatus = async (ip, profile) => {
    const activeProfile = profile || userProfile;
    const serverIp = ip || siteSettings?.server_ip || 'buildnchill.id.vn';
    try {
      const response = await fetch(`https://api.mcsrvstat.us/3/${serverIp}`);
      const data = await response.json();
      
      console.log('MC API Response:', data);

      if (data && data.online !== undefined) {
        const newStatus = {
          status: data.online ? 'Online' : 'Offline',
          players: data.players?.online?.toString() || '0',
          max_players: data.players?.max?.toString() || '500',
          version: data.version || '1.20.4'
        };

        setServerStatus({
          status: newStatus.status,
          players: newStatus.players,
          maxPlayers: newStatus.max_players,
          version: newStatus.version
        });

        // Chỉ Admin mới được quyền ghi đè trạng thái lên Database để tránh xung đột
        if (activeProfile?.role === 'admin') {
          await supabase.from('server_status').update(newStatus).eq('id', 1);
        }
      }
    } catch (error) {
      console.error('Error fetching Minecraft status:', error);
    }
  };

  // News Management
  const addNews = async (newsData) => {
    try {
      const { data, error } = await supabase
        .from('news')
        .insert([{
          ...newsData,
          slug: slugify(newsData.title),
          is_deleted: false
        }])
        .select();

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error adding news:', error);
      return false;
    }
  };

  const updateNews = async (id, newsData) => {
    try {
      const { error } = await supabase
        .from('news')
        .update({
          ...newsData,
          slug: slugify(newsData.title)
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating news:', error);
      return false;
    }
  };

  const deleteNews = async (id) => {
    try {
      const { error } = await supabase
        .from('news')
        .update({ is_deleted: true })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting news:', error);
      return false;
    }
  };

  // Admin Tools
  const updateServerStatus = async (statusData) => {
    try {
      const { error } = await supabase
        .from('server_status')
        .update({
          status: statusData.status,
          players: statusData.players,
          max_players: statusData.maxPlayers,
          version: statusData.version
        })
        .eq('id', 1);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating server status:', error);
      return false;
    }
  };

  const updateSiteSettings = async (settingsData) => {
    try {
      const { error } = await supabase
        .from('site_settings')
        .update(settingsData)
        .eq('id', 1);

      if (error) throw error;
      setSiteSettings(settingsData);
      return true;
    } catch (error) {
      console.error('Error updating site settings:', error);
      return false;
    }
  };

  // Contact Management
  const markContactAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
      setContacts(prev => prev.map(c => c.id === id ? { ...c, read: true } : c));
      return true;
    } catch (error) {
      console.error('Error marking contact as read:', error);
      return false;
    }
  };

  const updateContactStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setContacts(prev => prev.map(c => c.id === id ? { ...c, status } : c));

      // Discord notification update
      const contact = contacts.find(c => c.id === id);
      if (contact && contact.discord_message_id) {
        const CONTACT_WEBHOOK_URL = import.meta.env.VITE_DISCORD_CONTACT_WEBHOOK;
        
        const statusLabel = status === 'resolved' ? 'Đã Giải Quyết' : 
                           status === 'processing' ? 'Đang Kiểm Tra' : 'Đã Nhận';
        const statusColor = status === 'resolved' ? 3066993 : 
                           status === 'processing' ? 16766720 : 15158332;
        const statusEmoji = status === 'resolved' ? '🟢' : 
                           status === 'processing' ? '🟡' : '🔴';

        const categoryLabel = contact.category === 'report' ? 'Báo Cáo (Report)' :
                            contact.category === 'bug' ? 'Báo Lỗi (Bug)' :
                            contact.category === 'help' ? 'Trợ Giúp (Help)' :
                            contact.category === 'suggestion' ? 'Đề Xuất (Suggestion)' : 'Khác';

        const embed = {
          title: `${statusEmoji} ${statusLabel} | LIÊN HỆ: ${categoryLabel}`,
          description: `🔔 **Yêu cầu hỗ trợ từ Website**`,
          color: statusColor,
          fields: [
            { name: '👤 Người chơi', value: contact.ign || 'Không rõ', inline: true },
            { name: '📂 Danh mục', value: categoryLabel, inline: true },
            { name: '💬 Tin nhắn', value: contact.message || 'Không có nội dung' }
          ],
          footer: { text: `BuildnChill Support System • ${new Date(contact.created_at).toLocaleString('vi-VN')}` }
        };

        if (contact.image_url) {
          embed.image = { url: contact.image_url };
        }

        try {
          await fetch(`${CONTACT_WEBHOOK_URL}/messages/${contact.discord_message_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              content: `🔔 <@741299302495813662> **CẬP NHẬT LIÊN HỆ [${statusLabel.toUpperCase()}]**`,
              embeds: [embed] 
            })
          });
        } catch (err) {
          console.error('Error updating Discord message:', err);
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating contact status:', error);
      return false;
    }
  };

  const deleteContact = async (id) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ is_deleted: true })
        .eq('id', id);

      if (error) throw error;
      setContacts(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting contact:', error);
      return false;
    }
  };

  // Carousel Management
  const addCarouselImage = async (imageData) => {
    try {
      const { data, error } = await supabase
        .from('carousel_images')
        .insert([imageData])
        .select();

      if (error) throw error;
      setCarouselImages(prev => [...prev, data[0]]);
      return true;
    } catch (error) {
      console.error('Error adding carousel image:', error);
      return false;
    }
  };

  const updateCarouselImage = async (id, imageData) => {
    try {
      const { error } = await supabase
        .from('carousel_images')
        .update(imageData)
        .eq('id', id);

      if (error) throw error;
      setCarouselImages(prev => prev.map(img => img.id === id ? { ...img, ...imageData } : img));
      return true;
    } catch (error) {
      console.error('Error updating carousel image:', error);
      return false;
    }
  };

  const deleteCarouselImage = async (id) => {
    try {
      const { error } = await supabase
        .from('carousel_images')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCarouselImages(prev => prev.filter(img => img.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting carousel image:', error);
      return false;
    }
  };

  const submitContact = async (contactData) => {
    try {
      let image_url = null;
      
      // Handle image upload if exists
      if (contactData.image) {
        try {
          const file = contactData.image;
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const filePath = fileName;

          const { error: uploadError } = await supabase.storage
            .from('contact-images')
            .upload(filePath, file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('contact-images')
              .getPublicUrl(filePath);
            image_url = publicUrl;
          }
        } catch (err) {
          console.error('Upload failed, continuing without image:', err);
        }
      }

      // Gửi ign để tương thích với database
      const { data, error } = await supabase
        .from('contacts')
        .insert([{
          ign: contactData.ign,
          email: contactData.email,
          phone: contactData.phone,
          category: contactData.category,
          subject: contactData.subject || contactData.category || 'Liên hệ mới',
          message: contactData.message,
          image_url: image_url,
          status: 'pending',
          read: false,
          is_deleted: false
        }])
        .select()
        .single();

      if (error) throw error;

      // Discord notification - Chạy ngầm để không làm chậm UI
      (async () => {
        try {
          const CONTACT_WEBHOOK_URL = import.meta.env.VITE_DISCORD_CONTACT_WEBHOOK;
          
          const categoryLabel = contactData.category === 'report' ? 'Báo Cáo (Report)' :
                              contactData.category === 'bug' ? 'Báo Lỗi (Bug)' :
                              contactData.category === 'help' ? 'Trợ Giúp (Help)' :
                              contactData.category === 'suggestion' ? 'Đề Xuất (Suggestion)' : 'Khác';
  
          const embed = {
            title: `🔴 Đã Nhận | LIÊN HỆ: ${categoryLabel}`,
            description: `🔔 **Yêu cầu hỗ trợ từ Website**`,
            color: 15158332,
            fields: [
              { name: '👤 Người chơi', value: contactData.ign || 'Không rõ', inline: true },
              { name: '📂 Danh mục', value: categoryLabel, inline: true },
              { name: '💬 Tin nhắn', value: contactData.message || 'Không có nội dung' }
            ],
            footer: { text: `BuildnChill Support System • ${new Date().toLocaleString('vi-VN')}` }
          };
  
          if (image_url) embed.image = { url: image_url };
  
          // Bỏ wait=true để Discord phản hồi nhanh hơn
          const response = await fetch(CONTACT_WEBHOOK_URL + '?wait=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `🔔 <@741299302495813662> **CÓ LIÊN HỆ MỚI!**`,
              embeds: [embed]
            })
          });
  
          if (response.ok) {
            const result = await response.json();
            if (result.id) {
              await supabase.from('contacts').update({ discord_message_id: result.id }).eq('id', data.id);
            }
          }
        } catch (discordError) {
          console.error('Discord notification background error:', discordError);
        }
      })();

      return true;
    } catch (error) {
      console.error('Error submitting contact:', error);
      throw error;
    }
  };

  useEffect(() => {
    let authSubscription = null;
    let statusInterval = null;

    const initializeAuth = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        let currentProfile = null;
        if (session?.user) {
          setUser(session.user);
          setIsAuthenticated(true);
          currentProfile = await fetchUserProfile(session.user.id);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setUserProfile(null);
        }
        
        // Chỉ load data một lần duy nhất khi khởi tạo hoặc khi user thay đổi (đăng nhập/đăng xuất)
        await loadData(currentProfile);
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }

      // Tự động làm mới trạng thái server mỗi 5 phút (tăng thời gian để giảm tải)
      if (statusInterval) clearInterval(statusInterval);
      statusInterval = setInterval(() => {
        refreshMinecraftStatus();
      }, 300000);

      // Thiết lập listener sau khi đã init xong
      if (authSubscription) return; // Tránh tạo nhiều listener
      
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        const currentUser = session?.user ?? null;
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setUser(currentUser);
          setIsAuthenticated(true);
          await fetchUserProfile(currentUser.id);
          await loadData(); // Load lại data khi user mới vào
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setUserProfile(null);
          setNews([]); // Clear data nhạy cảm
          setContacts([]);
        }
        setLoading(false);
      });
      authSubscription = data.subscription;
    };

    initializeAuth();

    // CHỈ SỬ DỤNG REAL-TIME CHO NHỮNG THỨ CẦN THIẾT NHẤT
    // Gom nhóm các table vào 1 channel để giảm số lượng WebSocket connections
    const dbChanges = supabase.channel('system_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_status' }, (payload) => {
        if (payload.new) {
          setServerStatus({
            status: payload.new.status,
            players: payload.new.players,
            maxPlayers: payload.new.max_players,
            version: payload.new.version
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, (payload) => {
        const currentUserId = user?.id;
        if (currentUserId && (payload.new.user_id === currentUserId || payload.old?.user_id === currentUserId)) {
          fetchUserProfile(currentUserId);
        }
        window.dispatchEvent(new CustomEvent('wallet_updated'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recharges' }, () => {
        window.dispatchEvent(new CustomEvent('recharge_updated'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        window.dispatchEvent(new CustomEvent('orders_updated'));
      })
      .subscribe();

    return () => {
      if (authSubscription) authSubscription.unsubscribe();
      if (statusInterval) clearInterval(statusInterval);
      supabase.removeChannel(dbChanges);
    };
  }, [user?.id]); // Chỉ phụ thuộc vào user.id, bỏ siteSettings.server_ip để tránh loop


  return (
    <DataContext.Provider value={{
      news, serverStatus, contacts, siteSettings, carouselImages,
      isAuthenticated, user, userProfile, loading,
      fetchUserProfile, login, register, logout, refreshMinecraftStatus,
      addNews, updateNews, deleteNews, updateServerStatus, updateSiteSettings,
      markContactAsRead, updateContactStatus, deleteContact, submitContact,
      updatePassword,
      addCarouselImage, updateCarouselImage, deleteCarouselImage
    }}>
      {children}
    </DataContext.Provider>
  );
};
