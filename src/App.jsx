import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { DataProvider, useData } from './context/DataContext';
import TopBar from './components/TopBar';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import { Spinner, ToastProvider } from './components/ui';
import Home from './pages/Home';
import About from './pages/About';
import News from './pages/News';
import NewsDetail from './pages/NewsDetail';
import Contact from './pages/Contact';
import Shop from './pages/Shop';
import OrderStatus from './pages/OrderStatus';
import Recharge from './pages/Recharge';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import Rules from './pages/Rules';
import Faq from './pages/Faq';
import NotFound from './pages/NotFound';
import 'react-quill/dist/quill.snow.css';
import './styles/sunstone.css';
import './styles/pro.css';

const Admin = lazy(() => import('./pages/Admin'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Player = lazy(() => import('./pages/Player'));

const Page = ({ children }) => (
  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

const ScrollReset = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 80);
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

const AppContent = () => {
  const { isAuthenticated, userProfile, authInitialized } = useData();
  const loader = <div className="min-vh-100"><Spinner /></div>;

  return (
    <div className="bnc-app">
      <ScrollReset />
      <TopBar />
      <Navbar />
      <main className="bnc-main">
        <Routes>
          <Route path="/" element={<Page><Home /></Page>} />
          <Route path="/about" element={<Page><About /></Page>} />
          <Route path="/news" element={<Page><News /></Page>} />
          <Route path="/news/:slug" element={<Page><NewsDetail /></Page>} />
          <Route path="/rules" element={<Page><Rules /></Page>} />
          <Route path="/leaderboard" element={<Suspense fallback={loader}><Page><Leaderboard /></Page></Suspense>} />
          <Route path="/player/:name" element={<Suspense fallback={loader}><Page><Player /></Page></Suspense>} />
          <Route path="/faq" element={<Page><Faq /></Page>} />
          <Route path="/contact" element={<Page><Contact /></Page>} />
          <Route path="/shop" element={<Page><Shop /></Page>} />
          <Route path="/shop/order/:id" element={<Page><OrderStatus /></Page>} />
          <Route path="/recharge" element={<Page><Recharge /></Page>} />
          <Route path="/profile" element={<Page><Profile /></Page>} />
          <Route
            path="/login"
            element={!authInitialized ? loader : isAuthenticated ? <Navigate to="/" replace /> : <Page><Auth /></Page>}
          />
          <Route
            path="/admin"
            element={
              !authInitialized ? loader
                : isAuthenticated && userProfile?.role === 'admin' ? <Suspense fallback={loader}><Page><Admin /></Page></Suspense>
                  : isAuthenticated && !userProfile ? loader
                    : <Navigate to={isAuthenticated ? '/' : '/login'} replace />
            }
          />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Routes>
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};

function App() {
  return (
    <HelmetProvider>
      <DataProvider>
        <ToastProvider>
          <Router>
            <AppContent />
          </Router>
        </ToastProvider>
      </DataProvider>
    </HelmetProvider>
  );
}

export default App;
