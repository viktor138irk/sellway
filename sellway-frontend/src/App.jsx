import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Header from './components/Layout/Header';
import { C, Spinner } from './components/UI';
import { syncPaymentReturn } from './api/payments';

const HomePage       = lazy(() => import('./pages/store/HomePage'));
const CatalogPage    = lazy(() => import('./pages/store/CatalogPage'));
const ProductPage    = lazy(() => import('./pages/store/ProductPage'));
const OrderPage      = lazy(() => import('./pages/order/OrderPage'));
const LoginPage    = lazy(() => import('./pages/auth/AuthPages').then(m=>({default:m.LoginPage})));
const RegisterPage = lazy(() => import('./pages/auth/AuthPages').then(m=>({default:m.RegisterPage})));
const SellerDashboard  = lazy(() => import('./pages/seller/DashboardPage'));
const ProductsPage     = lazy(() => import('./pages/seller/ProductsPage'));
const SellerOrders     = lazy(() => import('./pages/seller/OrdersPage'));
const SellerFinances   = lazy(() => import('./pages/seller/FinancesPage'));
const SellerReferrals  = lazy(() => import('./pages/seller/ReferralsPage'));
const SellerWithdrawal = lazy(() => import('./pages/seller/WithdrawalPage'));
const SellerSettings   = lazy(() => import('./pages/seller/SettingsPage'));
const SellerPlaceholder = lazy(() => import('./pages/seller/PlaceholderPage'));
const SettingsPage = lazy(() => import('./pages/profile/SettingsPage'));
const AdminDashboard    = lazy(() => import('./pages/admin/DashboardPage'));
const AdminUsers        = lazy(() => import('./pages/admin/UsersPage'));
const AdminProducts     = lazy(() => import('./pages/admin/ProductsModerationPage'));
const AdminOrders       = lazy(() => import('./pages/admin/OrdersPage'));
const AdminDisputes     = lazy(() => import('./pages/admin/DisputesPage'));
const AdminWithdrawals  = lazy(() => import('./pages/admin/WithdrawalsPage'));
const AdminReferrals    = lazy(() => import('./pages/admin/ReferralsPage'));
const AdminCategories   = lazy(() => import('./pages/admin/CategoriesPage'));
const AdminSettings     = lazy(() => import('./pages/admin/SettingsPage'));
const AdminLogs         = lazy(() => import('./pages/admin/LogsPage'));

const SELLER_ROLES = ['seller', 'freelancer', 'admin'];

function Loading() { return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}><Spinner size={40}/></div>; }
function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading/>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace/>;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace/>;
  return children;
}
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading/>;
  if (user) return <Navigate to={SELLER_ROLES.includes(user.role) ? '/seller' : '/'} replace/>;
  return children;
}

function AppRoutes() {
  const location = useLocation();
  const isAdminPage  = location.pathname.startsWith('/admin');
  const showHeader   = !isAdminPage;
  return <>{showHeader && <Header/>}<Suspense fallback={<Loading/>}><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/catalog" element={<CatalogPage/>}/>
    <Route path="/product/:id" element={<ProductPage/>}/>
    <Route path="/login" element={<GuestOnly><LoginPage/></GuestOnly>}/>
    <Route path="/register" element={<GuestOnly><RegisterPage/></GuestOnly>}/>
    <Route path="/orders/:id" element={<Protected><OrderPage/></Protected>}/>
    <Route path="/seller" element={<Protected roles={SELLER_ROLES}><SellerDashboard/></Protected>}/>
    <Route path="/seller/products" element={<Protected roles={SELLER_ROLES}><ProductsPage/></Protected>}/>
    <Route path="/seller/products/new" element={<Protected roles={SELLER_ROLES}><ProductsPage mode="create"/></Protected>}/>
    <Route path="/seller/products/:id" element={<Protected roles={SELLER_ROLES}><ProductsPage mode="edit"/></Protected>}/>
    <Route path="/seller/orders" element={<Protected roles={SELLER_ROLES}><SellerOrders/></Protected>}/>
    <Route path="/seller/finances" element={<Protected roles={SELLER_ROLES}><SellerFinances/></Protected>}/>
    <Route path="/seller/referrals" element={<Protected roles={SELLER_ROLES}><SellerReferrals/></Protected>}/>
    <Route path="/seller/withdrawal" element={<Protected roles={SELLER_ROLES}><SellerWithdrawal/></Protected>}/>
    <Route path="/seller/reviews" element={<Protected roles={SELLER_ROLES}><SellerPlaceholder type="reviews"/></Protected>}/>
    <Route path="/seller/promo" element={<Protected roles={SELLER_ROLES}><SellerPlaceholder type="promo"/></Protected>}/>
    <Route path="/seller/settings" element={<Protected roles={SELLER_ROLES}><SellerSettings/></Protected>}/>
    <Route path="/profile/settings" element={<Protected><SettingsPage/></Protected>}/>
    <Route path="/admin" element={<Protected roles={['admin','moderator']}><AdminDashboard/></Protected>}/>
    <Route path="/admin/users" element={<Protected roles={['admin']}><AdminUsers/></Protected>}/>
    <Route path="/admin/products" element={<Protected roles={['admin','moderator']}><AdminProducts/></Protected>}/>
    <Route path="/admin/orders" element={<Protected roles={['admin','moderator']}><AdminOrders/></Protected>}/>
    <Route path="/admin/disputes" element={<Protected roles={['admin','moderator']}><AdminDisputes/></Protected>}/>
    <Route path="/admin/withdrawals" element={<Protected roles={['admin']}><AdminWithdrawals/></Protected>}/>
    <Route path="/admin/referrals" element={<Protected roles={['admin']}><AdminReferrals/></Protected>}/>
    <Route path="/admin/categories" element={<Protected roles={['admin']}><AdminCategories/></Protected>}/>
    <Route path="/admin/settings" element={<Protected roles={['admin']}><AdminSettings/></Protected>}/>
    <Route path="/admin/logs" element={<Protected roles={['admin']}><AdminLogs/></Protected>}/>
    <Route path="/payment/success" element={<PaymentSuccess/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Suspense></>;
}
function PaymentSuccess() {
  const { refreshUser } = useAuth();
  const [params] = useSearchParams();
  const paymentRef = params.get('payment_ref');
  const productId = params.get('product_id');
  const [state, setState] = useState({ loading: Boolean(paymentRef), status: paymentRef ? 'checking' : 'completed', error: '' });

  useEffect(() => {
    if (!paymentRef) return;
    let alive = true;
    syncPaymentReturn(paymentRef)
      .then(({ data }) => {
        if (!alive) return;
        setState({ loading: false, status: data.status, error: '' });
        if (data.status === 'completed') refreshUser().catch(() => {});
      })
      .catch((err) => {
        if (!alive) return;
        setState({ loading: false, status: 'error', error: err.response?.data?.error || 'Не удалось проверить платёж' });
      });
    return () => { alive = false; };
  }, [paymentRef]);

  const loading = state.loading;
  const ok = state.status === 'completed';
  const canceled = state.status === 'canceled';
  const title = loading ? 'Проверяем платёж...' : ok ? 'Баланс пополнен!' : canceled ? 'Платёж не завершён' : 'Платёж обрабатывается';
  const text = loading
    ? 'Запрашиваем статус в ЮKassa и синхронизируем баланс.'
    : ok
      ? 'Средства зачислены на ваш счёт.'
      : canceled
        ? 'ЮKassa вернула отмену платежа. Деньги на баланс не зачислялись.'
        : (state.error || 'Если оплата прошла, баланс обновится после подтверждения ЮKassa.');
  const href = productId ? `/product/${productId}` : '/';
  const button = productId ? 'Вернуться к товару' : 'На главную';

  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:16, padding:20, textAlign:'center' }}>
    <div style={{ fontSize:56 }}>{loading ? '⏳' : ok ? '🎉' : canceled ? '⚠️' : '⌛'}</div>
    <h1 style={{ fontSize:26, fontWeight:900, color:C.t1 }}>{title}</h1>
    <p style={{ fontSize:14, color:C.t2, maxWidth:420 }}>{text}</p>
    <a href={href} style={{ background:C.accent, color:'#fff', borderRadius:10, padding:'11px 24px', textDecoration:'none', fontSize:14, fontWeight:700 }}>← {button}</a>
  </div>;
}
function NotFound() { return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:16, padding:20 }}><div style={{ fontSize:56 }}>🔍</div><h1 style={{ fontSize:26, fontWeight:900, color:C.t1 }}>404</h1><p style={{ fontSize:14, color:C.t2 }}>Страница не найдена</p><a href="/" style={{ color:C.accent, textDecoration:'none', fontSize:14, fontWeight:700 }}>← На главную</a></div>; }
export default function App() { return <BrowserRouter><AuthProvider><ToastProvider><div style={{ minHeight:'100vh', background:C.bg, color:C.t1, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}><AppRoutes/><footer style={{ borderTop:`1px solid ${C.border}`, padding:'20px', textAlign:'center', fontSize:12, color:C.t3, marginTop:40 }}>© 2025 SellWay · sellway.pro · Безопасный маркетплейс цифровых товаров и услуг</footer></div></ToastProvider></AuthProvider></BrowserRouter>; }
