import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Label
} from '@smo/ui';
import { Loading03Icon, Bookmark01Icon } from 'hugeicons-react';

const DEFAULT_DURATION_MINUTES = 60;
const DURATION_PRESETS = [30, 45, 60, 90, 120];

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in local time
const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Next half-hour boundary from now, as a sensible default start
const nextHalfHour = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
};

export const ReserveTableDialog = ({ open, onOpenChange, storeId, table, onReserved }) => {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState('');
  const [notes, setNotes] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION_MINUTES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset the form each time the dialog opens
  useEffect(() => {
    if (open) {
      setGuestName('');
      setGuestPhone('');
      setPartySize('');
      setNotes('');
      setStartsAt(toLocalInputValue(nextHalfHour()));
      setDuration(DEFAULT_DURATION_MINUTES);
      setError('');
    }
  }, [open]);

  const endsAtLabel = useMemo(() => {
    if (!startsAt) return '';
    const end = new Date(new Date(startsAt).getTime() + duration * 60 * 1000);
    return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [startsAt, duration]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!table || !storeId) return;
    setError('');
    setIsSubmitting(true);

    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + duration * 60 * 1000);
      const res = await api.post(`/stores/${storeId}/reservations`, {
        tableId: table.id,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || null,
        partySize: partySize ? parseInt(partySize, 10) : null,
        notes: notes.trim() || null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString()
      });
      if (res.data.success) {
        onReserved?.(res.data.data);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to reserve table');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-slate-500/15 text-slate-600 dark:text-slate-400">
                <Bookmark01Icon size={16} />
              </span>
              Reserve Table {table?.tableNumber}
            </DialogTitle>
            <DialogDescription>
              The table will show as reserved from 5 minutes before the booking until it ends.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rsv-name">Guest name</Label>
                <Input
                  id="rsv-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rsv-phone">Phone</Label>
                <Input
                  id="rsv-phone"
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rsv-party">Party size</Label>
                <Input
                  id="rsv-party"
                  type="number"
                  min="1"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rsv-start">Date &amp; time</Label>
              <Input
                id="rsv-start"
                type="datetime-local"
                value={startsAt}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Duration</Label>
                {endsAtLabel && <span className="text-xs text-zinc-500">Ends at {endsAtLabel}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDuration(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      duration === m
                        ? 'bg-slate-700 border-slate-700 text-white'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`}
                  </button>
                ))}
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(15, parseInt(e.target.value, 10) || 15))}
                  className="w-24 h-8 text-xs"
                  aria-label="Custom duration in minutes"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rsv-notes">Notes</Label>
              <Input
                id="rsv-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Birthday, window seat, high chair…"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !guestName.trim() || !startsAt} className="bg-slate-700 hover:bg-slate-800 text-white">
              {isSubmitting ? <Loading03Icon className="animate-spin" size={16} /> : 'Reserve table'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
