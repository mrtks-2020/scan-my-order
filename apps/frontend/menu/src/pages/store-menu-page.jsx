import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { getSessionId } from '../lib/session';
import { useCartStore } from '../store/cart-store';
import { useAuthStore } from '../store/authStore';
import { GoogleLogin } from '@react-oauth/google';
import { Skeleton, Button, Input, AnimatedThemeToggler } from '@smo/ui';
import { UserProfile } from '../components/user-profile';
import { LiveOrders } from '../components/live-orders';
import { CallWaiter } from '../components/call-waiter';
import {
  ShoppingCart01Icon,
  PlusSignIcon,
  MinusSignIcon,
  Store01Icon,
  Cancel01Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CreditCardIcon,
  UserGroupIcon
} from 'hugeicons-react';
import { FullWidthDivider } from '../components/full-width-divider';

// Accessible FSSAI-style dietary badge
const DietaryBadge = ({ type }) => {
  const isVeg = type === 'VEG' || type === 'VEGAN';
  const isEgg = type === 'EGG';

  const borderColor = isVeg ? 'border-emerald-600' : isEgg ? 'border-amber-600' : 'border-rose-600';
  const dotColor = isVeg ? 'bg-emerald-600' : isEgg ? 'bg-amber-600' : 'bg-rose-600';

  return (
    <span
      className={`w-4 h-4 border-2 ${borderColor} rounded flex items-center justify-center p-0.5 shrink-0`}
      title={type}
      aria-label={type}
    >
      <span className={`w-2 h-2 ${dotColor} ${isEgg ? 'rounded-xs' : 'rounded-full'}`} />
    </span>
  );
};

export const StoreMenuPage = () => {
  const { brandSlug, storeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableNumber = searchParams.get('table');

  const [store, setStore] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeCategory, setActiveCategory] = useState('');
  const [toast, setToast] = useState(null);

  // Promo Code State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Cart Store
  const { items, setStoreId, addItem, updateQuantity, getTotalPrice, getTotalItems, clearCart } = useCartStore();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentModel, setPaymentModel] = useState('POSTPAID');
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Table Session / PIN State
  const [tableSessionInfo, setTableSessionInfo] = useState(null);
  const [activeTablePin, setActiveTablePin] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [sessionPinBanner, setSessionPinBanner] = useState('');

  const { token, setAuth } = useAuthStore();

  const categoryRefs = useRef({});
  // Sticky header (store info + search + category nav); its height is the scroll offset when jumping to a category
  const stickyHeaderRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMenuData = async () => {
    setLoading(true);
    setError('');
    try {
      const storeRes = await api.get(`/public/resolve/${brandSlug}/${storeSlug}`);
      const resolvedStore = storeRes.data.data;
      
      if (tableNumber) {
        const tableNumInt = parseInt(tableNumber, 10);
        const isValidTable = resolvedStore.tables?.some(t => t.tableNumber === tableNumInt);
        if (!isValidTable) {
          showToast(`Table ${tableNumber} is invalid or inactive. Removing from session.`, 'error');
          searchParams.delete('table');
          setSearchParams(searchParams);
        } else {
          try {
            const sessRes = await api.get(`/public/stores/${resolvedStore.id}/tables/${tableNumInt}/session`);
            if (sessRes.data.success) {
              setTableSessionInfo(sessRes.data.data);
              const savedPin = localStorage.getItem(`smo_table_pin_${resolvedStore.id}_${tableNumInt}`);
              if (savedPin) {
                setActiveTablePin(savedPin);
              }
            }
          } catch (e) {}
        }
      }

      setStore(resolvedStore);
      setStoreId(resolvedStore.id);

      const menuRes = await api.get(`/public/stores/${resolvedStore.id}/menu`);
      const menuCategories = menuRes.data.data || [];
      setCategories(menuCategories);
      if (menuCategories.length > 0) {
        setActiveCategory(menuCategories[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load menu. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuData();
  }, [brandSlug, storeSlug]);

  const scrollToCategory = (id) => {
    setActiveCategory(id);
    const target = categoryRefs.current[id];
    if (target) {
      const headerHeight = stickyHeaderRef.current?.offsetHeight || 0;
      const y = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  // ScrollSpy: the active category is the last section whose top has scrolled past the sticky header
  useEffect(() => {
    if (loading || filteredCategories.length === 0) return;

    let frame = null;
    const update = () => {
      frame = null;
      const headerHeight = stickyHeaderRef.current?.offsetHeight || 0;
      const line = headerHeight + 16;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      let current = filteredCategories[0].id;
      if (atBottom) {
        current = filteredCategories[filteredCategories.length - 1].id;
      } else {
        for (const cat of filteredCategories) {
          const el = categoryRefs.current[cat.id];
          if (el && el.getBoundingClientRect().top <= line) current = cat.id;
        }
      }
      setActiveCategory((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [loading, filteredCategories]);

  const submitOrder = async (overridePin) => {
    setIsPlacingOrder(true);
    const pinToUse = overridePin || activeTablePin || undefined;
    try {
      const payload = {
        tableNumber: parseInt(tableNumber, 10),
        paymentModel,
        type: 'DINE_IN',
        promoCode: appliedPromo?.code || undefined,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          kitchenNotes: '',
        })),
        sessionId: getSessionId(),
        pin: pinToUse
      };

      const res = await api.post(`/public/stores/${store.id}/orders`, payload);
      const { paymentIntent, tableSessionId, sessionPin } = res.data.data;

      if (sessionPin) {
        setActiveTablePin(sessionPin);
        localStorage.setItem(`smo_table_pin_${store.id}_${tableNumber}`, sessionPin);
        if (tableSessionId) {
          localStorage.setItem(`smo_table_session_${store.id}_${tableNumber}`, tableSessionId);
        }
        setSessionPinBanner(sessionPin);
        setTableSessionInfo(prev => ({ ...prev, hasActiveSession: true, tableSessionId }));
      }

      if (paymentModel === 'PREPAID' && res.data.data.order?.id) {
        const pKey = `smo_prepaid_orders_${store.id}_${tableNumber}`;
        const existingPaid = JSON.parse(localStorage.getItem(pKey) || '[]');
        localStorage.setItem(pKey, JSON.stringify([...existingPaid, res.data.data.order.id]));
      }

      if (paymentModel === 'PREPAID' && paymentIntent) {
        const options = {
          key: store.razorpayKeyId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          name: store.tenant?.name,
          description: `Order at ${store.name}`,
          image: store.tenant?.logo,
          order_id: paymentIntent.id,
          handler: async () => {
            try {
              await api.post(`/public/stores/${store.id}/orders/${paymentIntent.receipt}/verify-payment`);
              showToast('Payment successful! Order sent to kitchen.', 'success');
            } catch (err) {
              showToast('Payment verified, but there was a slight delay.', 'success');
            }
            clearCart();
            setIsCheckoutOpen(false);
          },
          prefill: { name: `Table ${tableNumber}` },
          theme: { color: store.tenant?.brandColor || '#059669' },
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          showToast(`Payment failed: ${resp.error.description}`, 'error');
        });
        rzp.open();
      } else {
        showToast('Order received! The kitchen is preparing your meal.', 'success');
        clearCart();
        setIsCheckoutOpen(false);
      }
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.message?.includes('Table PIN')) {
        setPinError(err.response?.data?.message || 'Invalid Table PIN');
        setShowPinModal(true);
      } else {
        showToast(err.response?.data?.message || 'Order failed. Please call a waiter.', 'error');
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    if (!tableNumber) {
      showToast('Scan a valid table QR code to place an order.', 'error');
      return;
    }

    if (paymentModel === 'PREPAID' && !token) {
      setShowAuthModal(true);
      return;
    }

    if (tableSessionInfo?.hasActiveSession && !activeTablePin) {
      setShowPinModal(true);
      return;
    }

    await submitOrder();
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await api.post('/auth/google', {
        idToken: credentialResponse.credential,
        tenantSlug: store.tenant.slug
      });
      if (res.data.success) {
        const { token: newToken, user } = res.data.data;
        setAuth(newToken, user);
        setShowAuthModal(false);
        showToast('Authenticated successfully!', 'success');
        await submitOrder();
      }
    } catch (err) {
      showToast('Authentication failed. Please try again.', 'error');
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setValidatingPromo(true);
    try {
      const res = await api.post(`/public/stores/${store.id}/validate-promo`, { code: promoCodeInput.trim(), subTotal: getTotalPrice() });
      setAppliedPromo(res.data.data);
      showToast('Promo code applied successfully!', 'success');
    } catch (err) {
      setAppliedPromo(null);
      showToast(err.response?.data?.message || 'Invalid promo code', 'error');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput('');
  };

  const brandColorHex = store?.tenant?.brandColor || '#059669';

  // DB id of the scanned table (waiter calls are keyed by tableId, not tableNumber)
  const scannedTableId = tableNumber
    ? store?.tables?.find((t) => t.tableNumber === parseInt(tableNumber, 10))?.id
    : undefined;

  // Math for Bill
  const subTotal = getTotalPrice();
  let discountAmount = 0;
  if (appliedPromo) {
    if (appliedPromo.discountType === 'PERCENTAGE') {
      discountAmount = Math.round(subTotal * (appliedPromo.discountValue / 100));
      if (appliedPromo.maxDiscount && discountAmount > appliedPromo.maxDiscount) {
        discountAmount = appliedPromo.maxDiscount;
      }
    } else {
      discountAmount = appliedPromo.discountValue;
    }
    if (discountAmount > subTotal) discountAmount = subTotal;
  }

  const taxAmount = store?.taxRules?.reduce((acc, tax) => {
    return acc + Math.round(subTotal * (tax.rate / 100));
  }, 0) || 0;

  const finalTotal = subTotal - discountAmount + taxAmount;

  // Loading Skeleton State
  if (loading) {
    return (
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col border-x">
        <FullWidthDivider contained={true} className="-top-px" />

        <Skeleton className="aspect-[16/9] w-full rounded-none" />

        <div className="sticky top-0 z-20 mx-auto flex w-full flex-col">
          <FullWidthDivider contained={true} className="-top-px" />
          <div className="border-b border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
            <div className="flex items-end justify-between gap-3 px-4 pb-4 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
                <div className="min-w-0 space-y-2 pb-1">
                  <Skeleton className="h-5 w-32 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
            </div>
            <div className="px-4 py-3">
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-2.5 no-scrollbar backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <FullWidthDivider contained={true} className="-bottom-px" />
        </div>

        <div className="relative mx-auto flex w-full flex-col">
          <FullWidthDivider contained={true} className="-top-px" />
          <div className="mt-2 space-y-0">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i}>
                <div className="px-4 py-3">
                  <Skeleton className="h-6 w-32 rounded" />
                </div>
                <div className="flex items-start gap-3.5 border-b border-zinc-100 bg-white p-4 last:border-b-0 dark:border-zinc-800/50 dark:bg-zinc-900">
                  <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch space-y-2 pr-1">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 w-3/4 rounded" />
                      </div>
                      <Skeleton className="h-4 w-1/4 rounded" />
                      <Skeleton className="h-3 w-full rounded" />
                      <Skeleton className="h-3 w-2/3 rounded" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-xl" />
                  </div>
                  <Skeleton className="h-24 w-24 shrink-0 rounded-xl border border-zinc-200/80 dark:border-zinc-800 sm:h-28 sm:w-28" />
                </div>
              </div>
            ))}
          </div>
          <FullWidthDivider contained={true} className="-bottom-px" />
        </div>
      </div>
    );
  }

  // Error State
  if (error || !store) {
    return (
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col border-x">
        <FullWidthDivider contained={true} className="-top-px" />

        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30">
            <AlertCircleIcon size={32} />
          </div>
          <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">Menu Unavailable</h2>
          <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
          <button
            onClick={fetchMenuData}
            className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-transform active:scale-95 dark:bg-white dark:text-zinc-900"
          >
            Try Again
          </button>
        </div>

        <FullWidthDivider contained={true} className="-bottom-px" />
      </div>
    );
  }

  return (
    <>
      <div className="relative mx-auto flex w-full max-w-md flex-col border-x">
        {/* Banner scrolls with the page; everything below it in the header is sticky */}
        <div className="relative mx-auto flex w-full flex-col">
          <FullWidthDivider contained={true} className="-top-px" />
          <div className="relative w-full overflow-hidden bg-white dark:bg-zinc-950">
            <img
              src={store.banner || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80'}
              alt={store.tenant?.name || 'Store banner'}
              className="h-auto w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent dark:from-zinc-950/80" />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <AnimatedThemeToggler />
              <UserProfile />
            </div>
          </div>
        </div>

        <div ref={stickyHeaderRef} className="sticky top-0 z-20 mx-auto flex w-full flex-col">
          <FullWidthDivider contained={true} className="-top-px" />
          <header className="relative w-full border-b border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
            <div className="relative flex items-end justify-between gap-3 px-4 pb-4 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                {store.tenant?.logo ? (
                  <img
                    src={store.tenant.logo}
                    alt={store.tenant.name}
                    className="h-16 w-16 shrink-0 rounded-2xl border-2 border-zinc-200/80 bg-white object-contain p-1 shadow-xl dark:border-white/20"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-zinc-200/80 bg-zinc-100 text-zinc-500 shadow-xl dark:border-white/20 dark:bg-zinc-800 dark:text-zinc-400">
                    <Store01Icon size={28} />
                  </div>
                )}
                <div className="min-w-0 pb-1">
                  <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">
                    {store.tenant?.name}
                  </h1>
                  <p className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-300">{store.name}</p>
                </div>
              </div>

              {tableNumber ? (
                <div className="flex shrink-0 items-stretch gap-2 self-stretch">
                  {/* Table + PIN stacked and left-aligned; the Call Waiter button fills the row height beside them */}
                  <div className="flex flex-col items-start justify-center gap-1.5">
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm backdrop-blur-md dark:border-emerald-400/30 dark:bg-emerald-500/20 dark:text-emerald-300">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
                      Table {tableNumber}
                    </div>
                    {activeTablePin && (
                      <div className="flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 backdrop-blur-md dark:border-indigo-400/30 dark:bg-indigo-500/20 dark:text-indigo-300" title="Table Session PIN">
                        PIN: {activeTablePin}
                      </div>
                    )}
                  </div>
                  <CallWaiter
                    storeId={store.id}
                    tableId={scannedTableId}
                    tableNumber={tableNumber}
                    brandColor={brandColorHex}
                    onToast={showToast}
                  />
                </div>
              ) : (
                <div className="shrink-0 rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 backdrop-blur-md dark:border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-300">
                  Browsing Menu
                </div>
              )}
            </div>

            <div className="px-4 py-3">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search dishes, drinks, ingredients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 rounded-xl border border-zinc-200/80 bg-zinc-50 pl-4 pr-10 text-sm text-zinc-900 placeholder-zinc-400 outline-none backdrop-blur-md transition focus:bg-white focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700/60 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:bg-zinc-900 dark:focus:ring-zinc-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <Cancel01Icon size={16} />
                  </button>
                )}
              </div>
            </div>
          </header>
          <nav className="flex gap-2 overflow-x-auto border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-2.5 no-scrollbar shadow-xs backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-150 active:scale-95 ${isActive
                    ? 'text-white shadow-sm'
                    : 'bg-zinc-200/70 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300'
                    }`}
                  style={{ backgroundColor: isActive ? brandColorHex : undefined }}
                >
                  {cat.name}
                </button>
              );
            })}
          </nav>
          <FullWidthDivider contained={true} className="-bottom-px" />
        </div>

        <div className="relative mx-auto flex w-full flex-col">
          <FullWidthDivider contained={true} className="-top-px" />

          {/* Active Session PIN Banner */}
          {sessionPinBanner && (
            <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/90 p-3 text-xs text-indigo-950 shadow-xs dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
              <div>
                <p className="font-bold">Table {tableNumber} Dining PIN: {sessionPinBanner}</p>
                <p className="text-[11px] opacity-80">Share this 4-digit PIN with anyone at your table to add more dishes.</p>
              </div>
              <button onClick={() => setSessionPinBanner('')} className="p-1 text-indigo-500 hover:text-indigo-700">
                <Cancel01Icon size={16} />
              </button>
            </div>
          )}

          <main className="mt-2 space-y-8 pb-28">
            {filteredCategories.length === 0 ? (
              <div className="space-y-2 py-12 text-center text-zinc-500">
                <p className="text-base font-medium">No dishes match "{searchQuery}"</p>
                <p className="text-xs">Try searching for a different keyword or category.</p>
              </div>
            ) : (
              filteredCategories.map((cat) => (
                <section
                  key={cat.id}
                  ref={(el) => (categoryRefs.current[cat.id] = el)}
                  data-category-id={cat.id}
                >
                  <h2 className="flex items-center gap-2 px-4 py-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {cat.name}
                    <span className="text-xs font-normal text-zinc-400">({cat.items.length})</span>
                  </h2>

                  <div>
                    {cat.items.map((item) => {
                      const cartItem = items.find((i) => i.menuItemId === item.id);
                      return (
                        <article
                          key={item.id}
                          className="flex items-start justify-between gap-3.5 border-b border-zinc-100 bg-white p-4 transition last:border-b-0 hover:bg-zinc-50/50 dark:border-zinc-800/50 dark:bg-zinc-900 dark:hover:bg-zinc-800/20"
                        >
                          <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch pr-1">
                            <div>
                              <div className="mb-1.5 flex items-center gap-2">
                                <DietaryBadge type={item.dietary || 'VEG'} />
                                <h3 className="truncate text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100 sm:text-base">
                                  {item.name}
                                </h3>
                              </div>
                              <p className="mb-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                ₹{item.price}
                              </p>
                              {item.description && (
                                <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <div className="mt-3">
                              {cartItem ? (
                                <div className="flex w-fit items-center gap-2 rounded-xl border border-zinc-200/60 bg-zinc-100 p-1 dark:border-zinc-700/60 dark:bg-zinc-800">
                                  <button
                                    onClick={() => updateQuantity(item.id, -1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-zinc-800 shadow-xs transition active:scale-90 dark:bg-zinc-700 dark:text-zinc-200"
                                    aria-label="Decrease quantity"
                                  >
                                    <MinusSignIcon size={14} />
                                  </button>
                                  <span className="w-5 text-center text-xs font-semibold">
                                    {cartItem.quantity}
                                  </span>
                                  <button
                                    onClick={() => updateQuantity(item.id, 1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-zinc-800 shadow-xs transition active:scale-90 dark:bg-zinc-700 dark:text-zinc-200"
                                    aria-label="Increase quantity"
                                  >
                                    <PlusSignIcon size={14} />
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  onClick={() => addItem(item)}
                                  size="sm"
                                >
                                  Add to cart
                                </Button>
                              )}
                            </div>
                          </div>

                          {item.image && (
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800 sm:h-28 sm:w-28">
                              <img
                                src={item.image}
                                alt={item.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </main>
          <FullWidthDivider contained={true} className="-bottom-px" />
        </div>

        {toast && (
          <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
            <div
              className={`flex items-center gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md ${toast.type === 'error'
                ? 'border-rose-600 bg-rose-500/90 text-white'
                : toast.type === 'success'
                  ? 'border-emerald-700 bg-emerald-600/90 text-white'
                  : 'border-zinc-800 bg-zinc-900/90 text-white'
                }`}
            >
              {toast.type === 'success' ? <CheckmarkCircle02Icon size={20} /> : <AlertCircleIcon size={20} />}
              <p className="flex-1 text-xs font-medium sm:text-sm">{toast.message}</p>
              <button onClick={() => setToast(null)} className="rounded-full p-1 hover:bg-white/20">
                <Cancel01Icon size={16} />
              </button>
            </div>
          </div>
        )}

        {getTotalItems() > 0 && (
          <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md animate-in slide-in-from-bottom-5 duration-200">
            <button
              onClick={() => setIsCheckoutOpen(true)}
              style={{ backgroundColor: brandColorHex }}
              className="flex w-full items-center justify-between rounded-2xl p-3.5 px-4 text-white shadow-xl transition-transform duration-150 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-sm font-bold">
                  {getTotalItems()}
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">Total Bill</p>
                  <p className="text-base font-bold leading-none">₹{finalTotal}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/20 px-3.5 py-2 text-sm font-semibold">
                View Cart <ShoppingCart01Icon size={18} />
              </div>
            </button>
          </div>
        )}

        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-full duration-250 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="relative flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
                <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="mt-1">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Review Your Order</h2>
                  {tableNumber && <p className="text-xs text-zinc-500">Delivering to Table {tableNumber}</p>}
                </div>
                <button
                  onClick={() => setIsCheckoutOpen(false)}
                  className="rounded-full bg-zinc-100 p-2 text-zinc-500 transition hover:text-zinc-800 dark:bg-zinc-800"
                >
                  <Cancel01Icon size={18} />
                </button>
              </div>

              <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto p-4 dark:divide-zinc-800/80">
                {items.map((item) => (
                  <div key={item.menuItemId} className="flex items-center justify-between gap-2 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <DietaryBadge type={item.dietary || 'VEG'} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                        <p className="text-xs text-zinc-500">₹{item.price} each</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-2 rounded-lg border border-zinc-200/50 bg-zinc-100 p-1 dark:border-zinc-700/50 dark:bg-zinc-800">
                        <button
                          onClick={() => updateQuantity(item.menuItemId, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-white shadow-2xs active:scale-90 dark:bg-zinc-700"
                        >
                          <MinusSignIcon size={12} />
                        </button>
                        <span className="w-4 text-center text-xs font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.menuItemId, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-white shadow-2xs active:scale-90 dark:bg-zinc-700"
                        >
                          <PlusSignIcon size={12} />
                        </button>
                      </div>
                      <span className="w-14 text-right text-sm font-bold">
                        ₹{item.price * item.quantity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 border-t border-zinc-200 bg-zinc-50/50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900/50">
                <div>
                  {!appliedPromo ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Got a Promo Code?"
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-zinc-400 placeholder:normal-case dark:border-zinc-700 dark:bg-zinc-800"
                      />
                      <button
                        onClick={handleApplyPromo}
                        disabled={validatingPromo || !promoCodeInput}
                        className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                      >
                        {validatingPromo ? 'Checking...' : 'Apply'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <div>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">{appliedPromo.code}</p>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-500/80">Code applied successfully</p>
                      </div>
                      <button onClick={handleRemovePromo} className="p-1 text-emerald-700 hover:text-emerald-900 dark:text-emerald-400">
                        <Cancel01Icon size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Subtotal</span>
                    <span>₹{subTotal}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between font-medium text-emerald-600 dark:text-emerald-400">
                      <span>Discount ({appliedPromo?.code})</span>
                      <span>-₹{discountAmount}</span>
                    </div>
                  )}
                  {store?.taxRules?.map((tax, idx) => (
                    <div key={idx} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>{tax.name} ({tax.rate}%)</span>
                      <span>₹{Math.round(subTotal * (tax.rate / 100))}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-base font-bold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                    <span>Total Amount</span>
                    <span>₹{finalTotal}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-200/60 p-1 dark:bg-zinc-800/60">
                  <button
                    type="button"
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${paymentModel === 'POSTPAID'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    onClick={() => setPaymentModel('POSTPAID')}
                  >
                    <UserGroupIcon size={16} /> Pay at Table
                  </button>
                  <button
                    type="button"
                    disabled={!store.razorpayConfigured}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${!store.razorpayConfigured
                      ? 'cursor-not-allowed text-zinc-400 opacity-40'
                      : paymentModel === 'PREPAID'
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white'
                        : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    onClick={() => store.razorpayConfigured && setPaymentModel('PREPAID')}
                  >
                    <CreditCardIcon size={16} /> Pay Online
                  </button>
                </div>

                <Button
                  className="h-12 w-full rounded-xl text-base font-bold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
                  style={{ backgroundColor: brandColorHex, border: 'none' }}
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder || items.length === 0 || !tableNumber}
                >
                  {isPlacingOrder
                    ? 'Placing your order...'
                    : !tableNumber
                      ? 'Scan Table QR to Order'
                      : paymentModel === 'PREPAID'
                        ? `Pay ₹${finalTotal} Now`
                        : 'Confirm & Place Order'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showAuthModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <CreditCardIcon size={24} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">Checkout Required</h3>
              <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
                To place a pre-paid order, please quickly verify your identity to secure your payment.
              </p>
              
              <div className="flex justify-center mb-4">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => showToast('Google login failed', 'error')}
                  theme="outline"
                  shape="rectangular"
                  text="continue_with"
                />
              </div>
              
              <button
                onClick={() => setShowAuthModal(false)}
                className="mt-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* PIN Entry Modal for Adding to Table Session */}
        {showPinModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <UserGroupIcon size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Table {tableNumber} Dining PIN</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                An active order already exists on Table {tableNumber}. Enter the 4-digit Table PIN to add your dishes.
              </p>

              <div className="my-5">
                <input
                  type="text"
                  maxLength={4}
                  autoFocus
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPinInput(val);
                    setPinError('');
                  }}
                  className="w-36 text-center text-2xl font-bold tracking-[0.4em] py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                {pinError && (
                  <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{pinError}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setPinError('');
                  }}
                  className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pinInput.length !== 4 || isPlacingOrder}
                  onClick={async () => {
                    setActiveTablePin(pinInput);
                    localStorage.setItem(`smo_table_pin_${store.id}_${tableNumber}`, pinInput);
                    setShowPinModal(false);
                    await submitOrder(pinInput);
                  }}
                  className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow-md transition disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  {isPlacingOrder ? 'Checking...' : 'Submit PIN'}
                </button>
              </div>
              <p className="mt-4 text-[11px] text-zinc-400">
                Ask your companions at the table or call a waiter for the PIN.
              </p>
            </div>
          </div>
        )}

        {/* Live Orders Floating Button & Panel */}
        <LiveOrders 
          storeId={store.id} 
          tableNumber={tableNumber} 
          activeSessionId={tableSessionInfo?.tableSessionId || localStorage.getItem(`smo_table_session_${store.id}_${tableNumber}`)} 
        />
      </div>
    </>
  );
};