import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import {
  Notification03Icon,
  DropletIcon,
  Invoice01Icon,
  CustomerService01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon
} from 'hugeicons-react';

// Matches the WaiterCallType enum on the backend
const CALL_OPTIONS = [
  {
    type: 'WATER',
    label: 'Water',
    description: 'Ask for a refill at your table',
    icon: DropletIcon,
    accent: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
  },
  {
    type: 'BILL',
    label: 'Bill',
    description: 'Request the bill for your table',
    icon: Invoice01Icon,
    accent: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
  },
  {
    type: 'CALL_WAITER',
    label: 'Call Waiter',
    description: 'Need help with something else',
    icon: CustomerService01Icon,
    accent: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
  }
];

// How long a request stays marked as "Requested" in the sheet (the backend
// de-duplicates pending calls anyway, this is just feedback for the guest).
const REQUESTED_TTL_MS = 60 * 1000;

export const CallWaiter = ({ storeId, tableId, tableNumber, brandColor, onToast }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [submittingType, setSubmittingType] = useState(null);
  const [requestedAt, setRequestedAt] = useState({}); // { [type]: timestamp }

  if (!tableId) return null;

  const isRequested = (type) => {
    const at = requestedAt[type];
    return at && Date.now() - at < REQUESTED_TTL_MS;
  };

  const sendCall = async (type) => {
    if (submittingType) return;
    setSubmittingType(type);
    try {
      const res = await api.post(`/public/stores/${storeId}/calls`, { tableId, type });
      setRequestedAt((prev) => ({ ...prev, [type]: Date.now() }));
      onToast?.(res.data?.data?.message || 'A waiter is on the way.', 'success');
      setIsOpen(false);
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Could not reach the staff. Please try again.', 'error');
    } finally {
      setSubmittingType(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Call a waiter"
        style={{ backgroundColor: brandColor }}
        className="flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-xl px-3 text-white shadow-md transition active:scale-95"
      >
        <Notification03Icon size={22} />
        <span className="text-[10px] font-bold uppercase leading-none tracking-wide">Call Waiter</span>
      </button>

      {/* Portaled so it escapes the sticky header's stacking context and sits above the cart / live-orders layers */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !submittingType && setIsOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-full duration-250 dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="mt-1">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Need assistance?</h2>
                <p className="text-xs text-zinc-500">We'll notify the staff for Table {tableNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={!!submittingType}
                className="rounded-full bg-zinc-100 p-2 text-zinc-500 transition hover:text-zinc-800 disabled:opacity-50 dark:bg-zinc-800"
              >
                <Cancel01Icon size={18} />
              </button>
            </div>

            <div className="space-y-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {CALL_OPTIONS.map(({ type, label, description, icon: Icon, accent }) => {
                const requested = isRequested(type);
                const submitting = submittingType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => sendCall(type)}
                    disabled={!!submittingType}
                    className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left transition active:scale-[0.98] disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50"
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
                    </div>
                    {submitting ? (
                      <Loading03Icon size={18} className="shrink-0 animate-spin text-zinc-400" />
                    ) : requested ? (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: brandColor }}
                      >
                        <CheckmarkCircle02Icon size={12} /> Requested
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
