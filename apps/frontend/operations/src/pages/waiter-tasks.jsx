import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Card, CardContent, Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Skeleton } from '@smo/ui';
import { Tick02Icon, Cancel01Icon, Store01Icon, Clock01Icon, Money01Icon, QrCodeIcon, CheckmarkBadge01Icon, PrinterIcon } from 'hugeicons-react';
import { QRCodeSVG } from 'qrcode.react';
import { Receipt } from '../components/receipt';

// Toast component for notifications
const Toast = ({ message, type, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  if (!isVisible) return null;

  const bgColor = type === 'success'
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    : type === 'error'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';

  const textColor = type === 'success'
    ? 'text-green-800 dark:text-green-400'
    : type === 'error'
      ? 'text-red-800 dark:text-red-400'
      : 'text-blue-800 dark:text-blue-400';

  const iconColor = type === 'success'
    ? 'text-green-500'
    : type === 'error'
      ? 'text-red-500'
      : 'text-blue-500';

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 p-4 rounded-lg border ${bgColor} shadow-lg animate-slide-in`}>
      {type === 'success' ? (
        <Tick02Icon size={20} className={iconColor} />
      ) : type === 'error' ? (
        <Cancel01Icon size={20} className={iconColor} />
      ) : (
        <Clock01Icon size={20} className={iconColor} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{message}</span>
      <button onClick={() => { setIsVisible(false); onClose(); }} className="ml-2">
        <Cancel01Icon size={16} className="text-zinc-400 hover:text-zinc-600" />
      </button>
    </div>
  );
};

// Loading skeleton component
const OrderSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <Skeleton className="h-16 w-full mb-4" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

// Empty state component
const EmptyState = ({ title, description, icon: Icon }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
      {Icon ? <Icon size={32} className="text-zinc-400" /> : (
        <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
    </div>
    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{title}</h3>
    <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm">{description}</p>
  </div>
);

export const WaiterTasks = () => {
  const { user, token } = useAuthStore();
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(user?.store?.id || null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storesLoading, setStoresLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // Payment Modal State
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('SERVE');
  
  const [storeData, setStoreData] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const receiptRef = useRef();

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const fetchOrders = useCallback(async (storeIdToFetch, silent = false) => {
    if (!storeIdToFetch) return;

    if (!silent) setLoading(true);
    setError('');

    try {
      const res = await api.get(`/stores/${storeIdToFetch}/orders?statuses=PENDING_VERIFICATION,READY,SERVED`);
      if (res.data.success) {
        setOrders(res.data.data);
      }
    } catch (err) {
      setError('Failed to fetch orders. Please try again.');
      showToast('Failed to fetch orders', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStores = useCallback(async () => {
    setStoresLoading(true);
    try {
      const res = await api.get('/stores');
      if (res.data.success && res.data.data.length > 0) {
        setStores(res.data.data);
        if (!selectedStoreId) {
          setSelectedStoreId(res.data.data[0].id);
        }
      }
    } catch (err) {
      showToast('Failed to fetch stores', 'error');
    } finally {
      setStoresLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    if (!user?.store) {
      fetchStores();
    }
  }, [user, fetchStores]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchOrders(selectedStoreId);
      
      api.get(`/stores/${selectedStoreId}`).then(res => {
        if (res.data.success) setStoreData(res.data.data);
      }).catch(err => console.error("Failed to fetch store data", err));

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      let eventSource;

      try {
        eventSource = new EventSource(`${baseUrl}/stores/${selectedStoreId}/orders/stream?token=${token}`);

        eventSource.onopen = () => {
          setConnectionStatus('connected');
        };

        eventSource.onerror = () => {
          setConnectionStatus('disconnected');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (['ORDER_PENDING_VERIFICATION', 'ORDER_READY', 'ORDER_SERVED', 'ORDER_PROCESSING', 'ORDER_CANCELLED', 'ORDER_SETTLED'].includes(data.type)) {
              fetchOrders(selectedStoreId, true);
              
              // If we are currently showing a payment modal for this order and it was settled
              if (data.type === 'ORDER_SETTLED') {
                 setPaymentOrder(prev => {
                   if (prev && prev.id === data.data.id) {
                     showToast('Payment verified successfully!', 'success');
                     
                     // Show receipt
                     api.get(`/stores/${selectedStoreId}/orders/${data.data.id}`).then(orderRes => {
                       if (orderRes.data.success) {
                         setReceiptOrder(orderRes.data.data);
                       }
                     });
                     
                     return null;
                   }
                   return prev;
                 });
                 setQrUrl(null);
              }
            }
          } catch (e) {
            // Silently ignore
          }
        };
      } catch (err) {
        setConnectionStatus('disconnected');
      }

      return () => {
        if (eventSource) eventSource.close();
      };
    }
  }, [selectedStoreId, token, fetchOrders]);

  const updateStatus = async (orderId, status) => {
    setActionLoading(orderId);
    setError('');

    try {
      await api.patch(`/stores/${selectedStoreId}/orders/${orderId}/status`, { status });
      setOrders(prev => prev.filter(o => o.id !== orderId));

      const statusMessages = {
        'CANCELLED': 'Order cancelled successfully',
        'PROCESSING': 'Order approved successfully',
        'SERVED': 'Order marked as served',
        'SETTLED': 'Order settled successfully'
      };

      showToast(statusMessages[status] || 'Order updated successfully', 'success');
      
      if (status === 'SETTLED' && paymentOrder?.id === orderId) {
        setPaymentOrder(null);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.message || 'Failed to update order';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const generatePaymentQr = async (orderOrGroup) => {
    setQrLoading(true);
    setQrUrl(null);
    try {
      let res;
      if (orderOrGroup?.tableSessionId) {
        res = await api.post(`/stores/${selectedStoreId}/orders/sessions/${orderOrGroup.tableSessionId}/payment-link`);
      } else {
        const orderId = orderOrGroup?.id || orderOrGroup;
        res = await api.post(`/stores/${selectedStoreId}/orders/${orderId}/payment-link`);
      }
      if (res.data.success && res.data.data.short_url) {
        setQrUrl(res.data.data.short_url);
      } else {
        showToast('Failed to generate QR', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to generate QR', 'error');
    } finally {
      setQrLoading(false);
    }
  };

  const handleSettlePayment = async (orderOrGroup) => {
    setActionLoading('settle');
    try {
      if (orderOrGroup?.tableSessionId) {
        const sessId = orderOrGroup.tableSessionId;
        await api.post(`/stores/${selectedStoreId}/orders/sessions/${sessId}/settle`);
        const billRes = await api.get(`/stores/${selectedStoreId}/orders/sessions/${sessId}`);
        if (billRes.data.success) {
          const b = billRes.data.data;
          setReceiptOrder({
            id: `TAB-${b.session.pin}`,
            createdAt: b.session.createdAt,
            type: 'DINE_IN',
            paymentModel: 'POSTPAID',
            table: { tableNumber: b.session.tableNumber },
            subTotal: b.subTotal,
            discountAmount: b.discountAmount,
            taxAmount: b.taxAmount,
            totalAmount: b.totalAmount,
            items: b.aggregatedItems.map(i => ({
              quantity: i.quantity,
              priceAtOrder: i.price,
              menuItem: { name: i.name },
              modifiers: (i.modifiers || []).map(m => ({ modifierOption: { name: m } }))
            }))
          });
        }
        setPaymentOrder(null);
        setQrUrl(null);
        showToast('Table settled successfully!', 'success');
        fetchOrders(selectedStoreId, true);
      } else {
        await updateStatus(orderOrGroup.id, 'SETTLED');
      }
    } catch (err) {
      showToast('Failed to settle table', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Payment Polling logic
  useEffect(() => {
    let intervalId;
    let attempts = 0;
    
    if (qrUrl && paymentOrder && selectedStoreId) {
      intervalId = setInterval(async () => {
        attempts++;
        if (attempts > 100) {
          clearInterval(intervalId);
          showToast('Payment QR Expired (timeout). Please generate again.', 'error');
          setQrUrl(null);
          return;
        }
        
        try {
          if (paymentOrder.tableSessionId) {
            const res = await api.post(`/stores/${selectedStoreId}/orders/sessions/${paymentOrder.tableSessionId}/verify-payment`);
            if (res.data.success && res.data.data.status === 'SETTLED') {
              clearInterval(intervalId);
              showToast('Payment verified successfully!', 'success');
              const sessId = paymentOrder.tableSessionId;
              setPaymentOrder(null);
              setQrUrl(null);
              
              const billRes = await api.get(`/stores/${selectedStoreId}/orders/sessions/${sessId}`);
              if (billRes.data.success) {
                const b = billRes.data.data;
                setReceiptOrder({
                  id: `TAB-${b.session.pin}`,
                  createdAt: b.session.createdAt,
                  type: 'DINE_IN',
                  paymentModel: 'POSTPAID',
                  table: { tableNumber: b.session.tableNumber },
                  subTotal: b.subTotal,
                  discountAmount: b.discountAmount,
                  taxAmount: b.taxAmount,
                  totalAmount: b.totalAmount,
                  items: b.aggregatedItems.map(i => ({
                    quantity: i.quantity,
                    priceAtOrder: i.price,
                    menuItem: { name: i.name },
                    modifiers: (i.modifiers || []).map(m => ({ modifierOption: { name: m } }))
                  }))
                });
              }
              fetchOrders(selectedStoreId, true);
            }
          } else {
            const res = await api.get(`/stores/${selectedStoreId}/orders/${paymentOrder.id}/payment-status`);
            if (res.data.success && res.data.data.status === 'success') {
              clearInterval(intervalId);
              showToast('Payment verified successfully!', 'success');
              
              const orderId = paymentOrder.id;
              setPaymentOrder(null);
              setQrUrl(null);
              
              const orderRes = await api.get(`/stores/${selectedStoreId}/orders/${orderId}`);
              if (orderRes.data.success) {
                setReceiptOrder(orderRes.data.data);
              }
              fetchOrders(selectedStoreId, true);
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000); // Poll every 3 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [qrUrl, paymentOrder, selectedStoreId, fetchOrders]);

  const handleStoreChange = (storeId) => {
    setSelectedStoreId(storeId);
    setOrders([]);
  };

  const pendingOrders = orders.filter(o => o.status === 'PENDING_VERIFICATION');
  const readyOrders = orders.filter(o => o.status === 'READY');
  
  // Group served postpaid orders by table session or table
  const servedGroups = useMemo(() => {
    const postPaidServed = orders.filter(o => o.status === 'SERVED' && o.paymentModel === 'POSTPAID');
    const groups = [];
    const map = new Map();
    for (const ord of postPaidServed) {
      const key = ord.tableSessionId || (ord.table ? `tbl_${ord.table.id}` : `ord_${ord.id}`);
      if (map.has(key)) {
        map.get(key).orders.push(ord);
      } else {
        const grp = {
          key,
          tableSessionId: ord.tableSessionId,
          tableSession: ord.tableSession,
          table: ord.table,
          orders: [ord]
        };
        map.set(key, grp);
        groups.push(grp);
      }
    }
    return groups;
  }, [orders]);

  return (
    <div className="flex flex-col h-full relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Payment Modal overlay */}
      {paymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-full animate-slide-in">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Collect Payment</h2>
                <p className="text-zinc-500 text-sm">Table {paymentOrder.table?.tableNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-1">Total Due</p>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">₹{paymentOrder.totalAmount}</h2>
              </div>
            </div>
            
            <div className="p-6 flex flex-col items-center gap-6 overflow-y-auto">
              {!qrUrl ? (
                 <Button 
                   className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                   onClick={() => generatePaymentQr(paymentOrder.id)}
                   disabled={qrLoading}
                 >
                   {qrLoading ? (
                     <div className="flex items-center">
                       <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                       Generating...
                     </div>
                   ) : (
                     <><QrCodeIcon size={24} className="mr-2" /> Generate Razorpay QR</>
                   )}
                 </Button>
              ) : (
                 <div className="flex flex-col items-center gap-4 p-4 bg-white rounded-xl shadow-inner border border-zinc-200 w-full">
                    <QRCodeSVG value={qrUrl} size={200} />
                    <p className="text-sm text-zinc-500 font-medium text-center">Scan to pay via UPI or Cards</p>
                    <p className="text-xs text-zinc-400 text-center">Waiting for payment confirmation...</p>
                 </div>
              )}
              
              <div className="w-full flex items-center justify-between text-zinc-400 text-sm">
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1"></div>
                <span className="px-3">OR</span>
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1"></div>
              </div>
              
              <Button 
                 className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                 onClick={() => handleSettlePayment(paymentOrder)}
                 disabled={actionLoading === 'settle'}
               >
                 <Money01Icon size={24} className="mr-2" /> Collect Cash & Settle
               </Button>
               
               <Button 
                 className="w-full" variant="ghost"
                 onClick={() => { setPaymentOrder(null); setQrUrl(null); }}
               >
                 Cancel
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal Overlay */}
      {receiptOrder && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col w-full max-w-md max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <h3 className="font-bold flex items-center gap-2"><Tick02Icon size={20}/> Payment Successful</h3>
              <button onClick={() => setReceiptOrder(null)} className="p-1 hover:bg-green-100 dark:hover:bg-green-800 rounded-full">
                <Cancel01Icon size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-zinc-100 dark:bg-black">
              {receiptOrder && storeData && (
                <Receipt ref={receiptRef} order={receiptOrder} storeData={storeData} />
              )}
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setReceiptOrder(null)}
              >
                Close
              </Button>
              <Button 
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white flex items-center justify-center gap-2"
                onClick={() => {
                  const printWindow = window.open('', '', 'width=400,height=600');
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Receipt</title>
                        <style>
                          body { font-family: monospace; font-size: 14px; margin: 0; padding: 20px; }
                          .flex { display: flex; }
                          .justify-between { justify-content: space-between; }
                          .text-center { text-align: center; }
                          .text-right { text-align: right; }
                          .font-bold { font-weight: bold; }
                          .text-xl { font-size: 1.25rem; }
                          .text-lg { font-size: 1.125rem; }
                          .mb-4 { margin-bottom: 1rem; }
                          .mb-2 { margin-bottom: 0.5rem; }
                          .mb-1 { margin-bottom: 0.25rem; }
                          .pb-2 { padding-bottom: 0.5rem; }
                          .pl-2 { padding-left: 0.5rem; }
                          .uppercase { text-transform: uppercase; }
                          .border-b { border-bottom: 1px dashed black; }
                          .flex-1 { flex: 1; }
                          .w-10 { width: 2.5rem; }
                          .w-16 { width: 4rem; }
                          .text-xs { font-size: 0.75rem; }
                          .pr-2 { padding-right: 0.5rem; }
                        </style>
                      </head>
                      <body>${receiptRef.current.innerHTML}</body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.focus();
                  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
                }}
              >
                <PrinterIcon size={18} /> Print Receipt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header moved to WaiterLayout */}
      <div className="flex justify-end items-center mb-6">
        <div className="flex items-center gap-4 w-full md:justify-end justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected'
                ? 'bg-green-500 animate-pulse'
                : connectionStatus === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
              }`} />
            <span className="text-zinc-500 capitalize">{connectionStatus}</span>
          </div>

          {!user?.store && (
            <Select value={selectedStoreId} onValueChange={handleStoreChange} disabled={storesLoading}>
              <SelectTrigger className="w-[200px] h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                <Store01Icon size={16} className="mr-1 text-zinc-400" />
                <SelectValue placeholder={storesLoading ? "Loading stores..." : "Select a store"} />
              </SelectTrigger>
              <SelectContent>
                {stores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg shadow-sm">
          <Cancel01Icon size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto">
            <Cancel01Icon size={16} className="text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* Mobile Tabs */}
      <div className="flex lg:hidden bg-zinc-100 dark:bg-zinc-900 p-1 mb-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab('VERIFY')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'VERIFY'
              ? 'bg-white dark:bg-zinc-800 text-yellow-600 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Verify <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 px-1.5 py-0.5 rounded-full text-xs ml-1">{pendingOrders.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('SERVE')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'SERVE'
              ? 'bg-white dark:bg-zinc-800 text-green-600 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Serve <span className="bg-green-100 dark:bg-green-900/30 text-green-700 px-1.5 py-0.5 rounded-full text-xs ml-1">{readyOrders.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('COLLECT')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'COLLECT'
              ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Collect <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 px-1.5 py-0.5 rounded-full text-xs ml-1">{servedGroups.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* Verification Inbox */}
        <div className={`flex-col h-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden transition-all hover:shadow-xl ${activeTab === 'VERIFY' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 px-4 py-4 border-b border-yellow-200 dark:border-yellow-800/50 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-yellow-800 dark:text-yellow-400 text-lg">Needs Verification</h2>
              <p className="text-xs text-yellow-600 dark:text-yellow-500">Review and approve incoming orders</p>
            </div>
            <span className="bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-300 text-sm px-3 py-1.5 rounded-full font-bold shadow-sm">
              {pendingOrders.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <OrderSkeleton />
            ) : pendingOrders.length === 0 ? (
              <EmptyState title="No Pending Orders" description="All caught up!" />
            ) : (
              pendingOrders.map(order => (
                <Card key={order.id} className="border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-lg transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-lg flex items-center gap-2">
                          Table {order.table?.tableNumber || 'N/A'}
                        </div>
                        <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Clock01Icon size={12} /> {Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)} min ago
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">₹{order.totalAmount}</div>
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full inline-block mt-1">
                          {order.paymentModel}
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 mb-4 max-h-32 overflow-y-auto space-y-1">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-zinc-700 dark:text-zinc-300">
                            <span className="font-semibold mr-2">{item.quantity}x</span>{item.menuItem?.name}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1" variant="outline" onClick={() => updateStatus(order.id, 'CANCELLED')} disabled={actionLoading === order.id}>
                         <Cancel01Icon size={16} className="mr-1 text-red-500" /> Reject
                      </Button>
                      <Button className="flex-1 bg-gradient-to-r from-yellow-500 to-amber-500 text-white" onClick={() => updateStatus(order.id, 'PROCESSING')} disabled={actionLoading === order.id}>
                         <Tick02Icon size={16} className="mr-1" /> Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Service Queue */}
        <div className={`flex-col h-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden transition-all hover:shadow-xl ${activeTab === 'SERVE' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 px-4 py-4 border-b border-green-200 dark:border-green-800/50 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-green-800 dark:text-green-400 text-lg">Ready to Serve</h2>
              <p className="text-xs text-green-600 dark:text-green-500">Deliver orders to their tables</p>
            </div>
            <span className="bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-300 text-sm px-3 py-1.5 rounded-full font-bold shadow-sm">
              {readyOrders.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <OrderSkeleton />
            ) : readyOrders.length === 0 ? (
              <EmptyState title="No Orders Ready" description="Kitchen is cooking!" />
            ) : (
              readyOrders.map(order => (
                <Card key={order.id} className="border-green-200 dark:border-green-900/30 shadow-sm hover:shadow-lg transition-all duration-200 bg-green-50/30 dark:bg-green-900/10">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="font-bold text-2xl text-green-900 dark:text-green-100 mb-1">
                          Table {order.table?.tableNumber || 'N/A'}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                          <Clock01Icon size={12} /> Ready since {new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">₹{order.totalAmount}</div>
                        {order.paymentModel === 'PREPAID' ? (
                          <div className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full mt-1 flex items-center gap-1">
                            <CheckmarkBadge01Icon size={12} /> PREPAID
                          </div>
                        ) : (
                          <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full inline-block mt-1">
                            TO COLLECT
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="mb-4 bg-white/50 dark:bg-zinc-950/50 p-3 rounded-lg border border-green-100 dark:border-green-900/30 space-y-1">
                       {order.items.map(item => (
                         <div key={item.id} className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
                           <span><span className="font-semibold mr-1">{item.quantity}x</span> {item.menuItem?.name}</span>
                         </div>
                       ))}
                    </div>

                    <Button
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-md text-base h-12"
                      onClick={() => updateStatus(order.id, 'SERVED')}
                      disabled={actionLoading === order.id}
                    >
                      <Tick02Icon size={20} className="mr-2" /> Mark as Served
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Pending Payment Queue */}
        <div className={`flex-col h-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden transition-all hover:shadow-xl ${activeTab === 'COLLECT' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-4 py-4 border-b border-blue-200 dark:border-blue-800/50 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-blue-800 dark:text-blue-400 text-lg">Pending Payment</h2>
              <p className="text-xs text-blue-600 dark:text-blue-500">Collect payment from served tables</p>
            </div>
            <span className="bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-300 text-sm px-3 py-1.5 rounded-full font-bold shadow-sm">
              {servedGroups.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <OrderSkeleton />
            ) : servedGroups.length === 0 ? (
              <EmptyState title="No Pending Payments" description="All tables settled!" />
            ) : (
              servedGroups.map(group => {
                const groupTotal = group.orders.reduce((sum, o) => sum + o.totalAmount, 0);
                return (
                  <Card key={group.key} className="border-blue-200 dark:border-blue-900/30 shadow-sm hover:shadow-lg transition-all duration-200 bg-blue-50/30 dark:bg-blue-900/10">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-2xl text-blue-900 dark:text-blue-100 mb-1 flex items-center gap-2">
                            Table {group.table?.tableNumber || 'N/A'}
                            {group.tableSession?.pin && (
                              <span className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 px-2 py-0.5 rounded-md font-bold">
                                PIN: {group.tableSession.pin}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-500 flex items-center gap-2">
                            <span>{group.orders.length} Batch{group.orders.length > 1 ? 'es' : ''}</span>
                            <span>•</span>
                            <span>Last served {new Date(group.orders[group.orders.length - 1].updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">₹{groupTotal}</div>
                          <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full inline-block mt-1">
                            TOTAL DUE
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-4 bg-white/60 dark:bg-zinc-950/50 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 max-h-32 overflow-y-auto space-y-1">
                        {group.orders.map(order => order.items.map(item => (
                          <div key={item.id} className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
                            <span><span className="font-semibold mr-1">{item.quantity}x</span> {item.menuItem?.name}</span>
                            <span className="text-zinc-400 text-xs">₹{item.priceAtOrder * item.quantity}</span>
                          </div>
                        )))}
                      </div>

                      <Button
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md text-base h-12 font-bold"
                        onClick={() => {
                          setPaymentOrder({
                            id: group.orders[0].id,
                            tableSessionId: group.tableSessionId,
                            table: group.table,
                            totalAmount: groupTotal,
                            orders: group.orders
                          });
                          setQrUrl(null);
                        }}
                      >
                        <Money01Icon size={20} className="mr-2" /> Collect Payment (₹{groupTotal})
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

      </div>

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.2s ease-out; }
      `}</style>
    </div>
  );
};