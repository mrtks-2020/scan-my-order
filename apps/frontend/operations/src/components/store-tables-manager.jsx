import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { Card, CardContent, Button, Input, Skeleton } from '@smo/ui';
import { QrCodeIcon, Download01Icon, PlusSignIcon, Delete02Icon, AlertCircleIcon, DocumentCodeIcon, Loading03Icon, PencilEdit02Icon, UserGroupIcon, Tick02Icon, Cancel01Icon } from 'hugeicons-react';

const DEFAULT_CAPACITY = 4;

export const StoreTablesManager = ({ storeId, storeSlug, brandSlug }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState(String(DEFAULT_CAPACITY));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Inline capacity editing on a QR card
  const [editingTableId, setEditingTableId] = useState(null);
  const [editCapacity, setEditCapacity] = useState('');
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/stores/${storeId}/tables`);
      if (res.data.success) {
        setTables(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [storeId]);

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTableNumber || !newCapacity) return;
    setIsSubmitting(true);
    setError('');

    try {
      await api.post(`/stores/${storeId}/tables`, {
        tableNumber: parseInt(newTableNumber, 10),
        capacity: parseInt(newCapacity, 10)
      });
      setNewTableNumber('');
      setNewCapacity(String(DEFAULT_CAPACITY));
      fetchTables();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add table');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditCapacity = (table) => {
    setEditingTableId(table.id);
    setEditCapacity(String(table.capacity ?? DEFAULT_CAPACITY));
    setError('');
  };

  const cancelEditCapacity = () => {
    setEditingTableId(null);
    setEditCapacity('');
  };

  const saveCapacity = async (tableId) => {
    const capacity = parseInt(editCapacity, 10);
    if (!Number.isInteger(capacity) || capacity < 1) {
      setError('Capacity must be at least 1');
      return;
    }
    setIsSavingCapacity(true);
    setError('');
    try {
      const res = await api.patch(`/stores/${storeId}/tables/${tableId}`, { capacity });
      if (res.data.success) {
        // Patch locally so the card updates without a refetch flash
        setTables(prev => prev.map(t => (t.id === tableId ? { ...t, capacity: res.data.data.capacity } : t)));
        cancelEditCapacity();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update capacity');
    } finally {
      setIsSavingCapacity(false);
    }
  };

  const handleDelete = async (tableId) => {
    if (!window.confirm("Are you sure you want to delete this table?")) return;
    try {
      await api.delete(`/stores/${storeId}/tables/${tableId}`);
      fetchTables();
    } catch (err) {
      setError('Failed to delete table');
    }
  };

  const getQRUrl = (tableNumber) => {
    // Customer menu app (apps/frontend/menu) runs on 5175 locally. Override via VITE_MENU_APP_URL.
    const domain = import.meta.env.VITE_MENU_APP_URL
      || (window.location.hostname === 'localhost' ? 'http://localhost:5175' : 'https://menu.scanmyorder.com');
    return `${domain}/${brandSlug}/${storeSlug}?table=${tableNumber}`;
  };

  const getCanvasForTable = (tableNumber) => {
    return new Promise((resolve) => {
      const svg = document.getElementById(`qr-${tableNumber}`);
      if (!svg) return resolve(null);
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      // Load logo
      const logo = new Image();
      logo.crossOrigin = "anonymous";
      
      img.onload = () => {
        canvas.width = img.width + 80;
        canvas.height = img.height + 140;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "black";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Scan to Order`, canvas.width / 2, 40);
        ctx.font = "bold 28px Arial";
        ctx.fillText(`Table ${tableNumber}`, canvas.width / 2, 80);

        // Draw QR code
        ctx.drawImage(img, 40, 100);

        // Draw logo in center of QR code
        logo.onload = () => {
          const logoSize = 40;
          const qrX = 40;
          const qrY = 100;
          const qrSize = img.width;
          const logoX = qrX + (qrSize / 2) - (logoSize / 2);
          const logoY = qrY + (qrSize / 2) - (logoSize / 2);
          
          // Optional: Add white background behind logo for better visibility
          ctx.fillStyle = "white";
          ctx.fillRect(logoX - 2, logoY - 2, logoSize + 4, logoSize + 4);
          
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          resolve(canvas.toDataURL("image/png"));
        };

        logo.onerror = () => {
          // If logo fails to load, just draw QR code without logo
          resolve(canvas.toDataURL("image/png"));
        };

        logo.src = '/logo.svg';
      };

      img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
    });
  };

  const downloadAllQRsAsPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();

      const qrWidth = 80; // mm
      const qrHeight = 100; // mm
      const cols = 2;
      const margin = (pageWidth - (qrWidth * cols)) / (cols + 1); // evenly space columns
      const topMargin = 20;

      let x = margin;
      let y = topMargin;
      let qrsOnPage = 0;

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const dataUrl = await getCanvasForTable(table.tableNumber);

        if (dataUrl) {
          pdf.addImage(dataUrl, 'PNG', x, y, qrWidth, qrHeight);
          qrsOnPage++;

          if (qrsOnPage % 2 === 0) {
            // Move to next row
            x = margin;
            y += qrHeight + 10;
          } else {
            // Move to next column
            x += qrWidth + margin;
          }

          // Max 4 QRs per A4 page
          if (qrsOnPage === 4 && i < tables.length - 1) {
            pdf.addPage();
            qrsOnPage = 0;
            x = margin;
            y = topMargin;
          }
        }
      }

      pdf.save(`${storeSlug}-table-qrs.pdf`);
    } catch (err) {
      console.error(err);
      setError("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const downloadQR = async (tableNumber) => {
    const pngFile = await getCanvasForTable(tableNumber);
    if (!pngFile) return;
    const downloadLink = document.createElement("a");
    downloadLink.download = `table-${tableNumber}-qr.png`;
    downloadLink.href = pngFile;
    downloadLink.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Tables & QR Codes</h3>
          <p className="text-sm text-zinc-500">Manage your tables and print QR codes for dine-in ordering.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {tables.length > 0 && (
            <Button variant="link" onClick={downloadAllQRsAsPDF} disabled={isGeneratingPDF}>
              {isGeneratingPDF ? (
                <><Loading03Icon size={16} className="animate-spin" /> Generating PDF...</>
              ) : (
                <><DocumentCodeIcon size={16} /> Bulk Export PDF</>
              )}
            </Button>
          )}
          <form onSubmit={handleAddTable} className="flex items-center">
            <Input
              type="number"
              min="1"
              placeholder="Table No."
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              className="w-24 rounded-l-3xl rounded-r-none h-9 border-r-0"
              aria-label="Table number"
              required
            />
            <div className="relative">
              <UserGroupIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <Input
                type="number"
                min="1"
                max="50"
                placeholder="Seats"
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
                className="w-24 rounded-none h-9 pl-8"
                aria-label="Seating capacity"
                title="Seating capacity"
                required
              />
            </div>
            <Button type="submit" disabled={isSubmitting || !newTableNumber || !newCapacity} className="rounded-l-none h-9">
              <PlusSignIcon size={16} /> Add
            </Button>
          </form>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
          <AlertCircleIcon size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl">
          <QrCodeIcon size={48} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
          <h4 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No tables yet</h4>
          <p className="text-sm text-zinc-500">Add a table number above to generate your first QR code.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {tables.map(table => (
            <Card key={table.id} className="border-zinc-200 dark:border-zinc-800 text-center flex flex-col group">
              <CardContent className="p-6 flex-1 flex flex-col items-center justify-between gap-4">
                <div className="w-full flex justify-between items-start gap-2">
                  <div className="text-left min-w-0">
                    <h4 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">Table {table.tableNumber}</h4>

                    {editingTableId === table.id ? (
                      /* Inline capacity editor */
                      <form
                        onSubmit={(e) => { e.preventDefault(); saveCapacity(table.id); }}
                        className="mt-1 flex items-center gap-1"
                      >
                        <UserGroupIcon size={14} className="text-zinc-400 shrink-0" />
                        <Input
                          type="number"
                          min="1"
                          max="50"
                          value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') cancelEditCapacity(); }}
                          className="w-16 h-7 text-xs px-2"
                          autoFocus
                          disabled={isSavingCapacity}
                          aria-label="Seating capacity"
                        />
                        <button
                          type="submit"
                          disabled={isSavingCapacity}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                          title="Save"
                        >
                          {isSavingCapacity ? <Loading03Icon size={14} className="animate-spin" /> : <Tick02Icon size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditCapacity}
                          disabled={isSavingCapacity}
                          className="p-1 rounded text-zinc-400 hover:bg-zinc-500/10 disabled:opacity-50"
                          title="Cancel"
                        >
                          <Cancel01Icon size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditCapacity(table)}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                        title="Edit seating capacity"
                      >
                        <UserGroupIcon size={13} />
                        <span>{table.capacity ?? DEFAULT_CAPACITY} {(table.capacity ?? DEFAULT_CAPACITY) === 1 ? 'seat' : 'seats'}</span>
                        <PencilEdit02Icon size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {editingTableId !== table.id && (
                      <button
                        onClick={() => startEditCapacity(table)}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                        title="Edit capacity"
                      >
                        <PencilEdit02Icon size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(table.id)}
                      className="p-1 rounded text-zinc-400 hover:text-red-500"
                      title="Delete table"
                    >
                      <Delete02Icon size={16} />
                    </button>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl shadow-sm border border-zinc-100 mx-auto relative">
                  <QRCodeSVG
                    id={`qr-${table.tableNumber}`}
                    value={getQRUrl(table.tableNumber)}
                    size={140}
                    level="L"
                    includeMargin={false}
                    imageSettings={{
                      src: '/logo.png',
                      x: undefined,
                      y: undefined,
                      height: 20,
                      width: 20,
                      opacity: 1,
                      excavate: true,
                    }}
                  />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => downloadQR(table.tableNumber)}
                > Download QR
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};