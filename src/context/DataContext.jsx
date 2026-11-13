import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { slugify } from '../utils/helpers';
import { notifyDiscord } from '../lib/api';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children }) => {
  // STALE TIME: 5 phút (300.000ms)
  const CACHE_STALE_TIME = 300000;
  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const isProfileFetchingRef = useRef(false);
  const lastFocusTimeRef = useRef(0);
  const userIdRef = useRef(null);
  const isInitializingRef = useRef(false);

  // Helper để lưu/lấy data từ localStorage giúp chống mất dữ liệu khi F5 hoặc để lâu
  const getPersistedData = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`bnc_pub_${key}`);
      if (!saved) return defaultValue;
      
      const { data, cachedAt } = JSON.parse(saved);
      // Kiểm tra nếu dữ liệu quá cũ (> 5 phút) thì vẫn trả về nhưng đánh dấu là stale
      return data || defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const persistData = (key, data) => {
    // Chỉ cache dữ liệu public, không cache dữ liệu nhạy cảm
    const publicKeys = ['news', 'status', 'settings', 'carousel'];
    if (!publicKeys.includes(key)) return;

    try {
      const cacheObject = {
        data,
        cachedAt: Date.now()
      };
      localStorage.setItem(`bnc_pub_${key}`, JSON.stringify(cacheObject));
    } catch (err) {
      console.error(`Persist error for ${key}:`, err);
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
  const [loading, setLoading] = useState(true); // Global auth loading
  const [profileLoading, setProfileLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [mcStatusLoading, setMcStatusLoading] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isDataStale, setIsDataStale] = useState(false);

  // Cập nhật userIdRef khi user thay đổi
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user]);

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
    
    if (isProfileFetchingRef.current) {
      console.log('[DATA] Profile fetch already in progress, skipping...');
      return userProfile;
    }

    try {
      isProfileFetchingRef.current = true;
      setProfileLoading(true);
      console.log(`[DATA] START Fetching profile for user: ${userId}`);
      
      const [profilePromise, walletPromise] = [
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle()
      ];

      const [profRes, walletRes] = await Promise.all([profilePromise, walletPromise]);

      if (profRes.error) {
        console.error('[DATA] Profile fetch error (URL: profiles/select):', profRes.error);
        if (profRes.error.status === 401 || profRes.error.status === 403) {
          console.error('[AUTH] Unauthorized detected during profile fetch, signing out...');
          logout();
        }
      }

      if (walletRes.error) {
        console.warn('[DATA] Wallet fetch error (URL: wallets/select):', walletRes.error);
      }

      if (profRes.data) {
        const fullProfile = {
          ...profRes.data,
          wallet_balance: walletRes.data?.balance || 0
        };
        setUserProfile(fullProfile);
        console.log('[DATA] END Profile fetched successfully');
        return fullProfile;
      }
      
      return userProfile;
    } catch (err) {
      console.error('[DATA] Unexpected error fetching profile:', err);
      return userProfile;
    } finally {
      isProfileFetchingRef.current = false;
      setProfileLoading(false);
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

  const loadData = async (profile, force = false) => {
    // Prevent multiple concurrent fetches or too frequent fetches
    const now = Date.now();
    if (!force && (isFetchingRef.current || (now - lastFetchTimeRef.current < 15000))) {
      console.log('[DATA] Data is still fresh or fetching in progress, skipping...');
      return;
    }

    try {
      isFetchingRef.current = true;
      setDataLoading(true);
      console.log('[DATA] START loading site data...');
      
      const [newsPromise, settingsPromise, statusPromise, contactsPromise, carouselPromise] = [
        supabase.from('news').select('*').eq('is_deleted', false).order('date', { ascending: false }),
        supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('server_status').select('*').eq('id', 1).maybeSingle(),
        supabase.from('contacts').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
        supabase.from('carousel_images').select('*').eq('is_active', true).order('display_order', { ascending: true })
      ];

      const [newsRes, settingsRes, statusRes, contactsRes, carouselRes] = await Promise.all([
        newsPromise, settingsPromise, statusPromise, contactsPromise, carouselPromise
      ]);

      // Logging failures
      if (newsRes.error) console.error('[DATA] News fetch error (URL: news/select):', newsRes.error);
      if (settingsRes.error) console.error('[DATA] Settings fetch error (URL: site_settings/select):', settingsRes.error);
      if (statusRes.error) console.error('[DATA] Server status fetch error (URL: server_status/select):', statusRes.error);
      if (contactsRes.error) console.error('[DATA] Contacts fetch error (URL: contacts/select):', contactsRes.error);
      if (carouselRes.error) console.error('[DATA] Carousel fetch error (URL: carousel_images/select):', carouselRes.error);

      // CHỈ CẬP NHẬT NẾU CÓ DỮ LIỆU TRẢ VỀ
      if (newsRes.data) setNews(newsRes.data.map(item => ({ ...item, slug: item.slug || slugify(item.title) })));
      if (contactsRes.data) setContacts(contactsRes.data);
      if (carouselRes.data) setCarouselImages(carouselRes.data);
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
      setIsDataStale(false);
      lastFetchTimeRef.current = Date.now();
      console.log('[DATA] END site data loaded successfully');
    } catch (error) {
      console.error('[DATA] Unexpected loading error:', error);
      setIsDataStale(true); 
    } finally {
      setDataLoading(false);
      isFetchingRef.current = false;
    }
  };

  const refreshMinecraftStatus = async (ip, profile) => {
    const activeProfile = profile || userProfile;
    const serverIp = ip || siteSettings?.server_ip;
    
    if (!serverIp || serverIp === 'undefined') {
      console.warn('[MC-API] Invalid server IP, skipping fetch');
      return;
    }

    try {
      setMcStatusLoading(true);
      console.log(`[MC-API] START Fetching status for: ${serverIp}`);
      const response = await fetch(`https://api.mcsrvstat.us/3/${serverIp}`);
      
      if (!response.ok) {
        console.warn(`[MC-API] Failed to fetch MC status (URL: https://api.mcsrvstat.us/3/${serverIp}): ${response.status}`);
        return;
      }

      const data = await response.json();
      console.log('[MC-API] Response received');

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

        // Chỉ Admin mới được quyền ghi đè trạng thái lên Database
        // Cẩn thận loop: fetch -> update db -> realtime event -> set state -> render
        if (activeProfile?.role === 'admin') {
          console.log('[MC-API] Admin detected, updating database status...');
          await supabase.from('server_status').update(newStatus).eq('id', 1);
        }
      }
    } catch (error) {
      console.error('[MC-API] Error fetching Minecraft status:', error);
    } finally {
      setMcStatusLoading(false);
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
      if (data?.[0]?.id) notifyDiscord('news_published', data[0].id);
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

      // Cập nhật tin nhắn Discord (xử lý phía server)
      notifyDiscord('contact_status', id);

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

      // Thông báo Discord (xử lý phía server, không lộ webhook)
      notifyDiscord('contact_new', data.id);

      return true;
    } catch (error) {
      console.error('Error submitting contact:', error);
      throw error;
    }
  };

  useEffect(() => {
    let statusInterval = null;

    const initializeAuth = async () => {
      if (isInitializingRef.current) return;
      isInitializingRef.current = true;
      
      setLoading(true);
      console.log('[AUTH] START Initializing session...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('[AUTH] Session found for user:', session.user.id);
          userIdRef.current = session.user.id;
          setUser(session.user);
          setIsAuthenticated(true);
          setAuthInitialized(true); 
          await fetchUserProfile(session.user.id);
        } else {
          console.log('[AUTH] No active session.');
          userIdRef.current = null;
          setUser(null);
          setIsAuthenticated(false);
          setUserProfile(null);
          setAuthInitialized(true);
        }
        
        loadData();
      } catch (err) {
        console.error('[AUTH] Initialization error:', err);
        setAuthInitialized(true); 
      } finally {
        setLoading(false);
        isInitializingRef.current = false;
        console.log('[AUTH] END Initialization lifecycle');
      }

      if (statusInterval) clearInterval(statusInterval);
      statusInterval = setInterval(() => {
        refreshMinecraftStatus();
      }, 300000);
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      console.log(`[AUTH EVENT] ${event}`, { userId: currentUser?.id });
      
      if (event === 'SIGNED_IN') {
        if (currentUser) {
          // Check for change to prevent loops
          if (userIdRef.current !== currentUser.id) {
            console.log('[AUTH] Sign in detected for new user:', currentUser.id);
            userIdRef.current = currentUser.id;
            setUser(currentUser);
            setIsAuthenticated(true);
            // Không await truy vấn Supabase trong callback này: supabase-js giữ khoá auth khi phát sự kiện,
            // gọi supabase.from() ở đây sẽ bị treo (deadlock) khi tải lại trang lúc đã đăng nhập.
            setTimeout(async () => {
              await fetchUserProfile(currentUser.id);
              setAuthInitialized(true);
            }, 0);
          } else {
            console.log('[AUTH] Sign in detected for existing user, skipping profile fetch.');
          }
        }
      } else if (event === 'TOKEN_REFRESHED') {
        if (currentUser) {
          userIdRef.current = currentUser.id;
          setUser(currentUser);
          setIsAuthenticated(true);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH] User signed out, clearing session data.');
        userIdRef.current = null;
        setUser(null);
        setIsAuthenticated(false);
        setUserProfile(null);
        setNews([]);
        setContacts([]);
        const publicKeys = ['news', 'status', 'settings', 'carousel'];
        publicKeys.forEach(k => localStorage.removeItem(`bnc_pub_${k}`));
        setAuthInitialized(true);
      }
    });

    const handleFocus = () => {
      const now = Date.now();
      // Chỉ refetch nếu:
      // 1. Đã login
      // 2. Không đang loading/fetching
      // 3. Đã qua ít nhất 30s kể từ lần focus cuối hoặc 15s kể từ lần fetch cuối
      const timeSinceLastFocus = now - lastFocusTimeRef.current;
      const timeSinceLastFetch = now - lastFetchTimeRef.current;
      
      if (timeSinceLastFocus > 30000 && timeSinceLastFetch > 15000 && !isFetchingRef.current) {
        console.log('[DATA] Window focused and stale, checking for updates...');
        loadData();
      }
      lastFocusTimeRef.current = now;
    };
    window.addEventListener('focus', handleFocus);

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
        const currentId = userIdRef.current;
        if (payload.new && payload.new.user_id === currentId) {
           console.log('[REALTIME] Wallet update for current user detected');
           fetchUserProfile(currentId);
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
      if (authListener) authListener.subscription.unsubscribe();
      if (statusInterval) clearInterval(statusInterval);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(dbChanges);
    };
  }, []); 


  return (
    <DataContext.Provider value={{
      news, serverStatus, contacts, siteSettings, carouselImages,
      isAuthenticated, user, userProfile, loading, authInitialized,
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
