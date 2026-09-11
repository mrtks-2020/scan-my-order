import React, { useState, useMemo, useRef } from 'react';
import {
  AlertCircleIcon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Restaurant01Icon,
  Tick02Icon,
  Cancel01Icon,
  Layers01Icon,
  GridIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  RefreshIcon,
  UserGroupIcon,
  BookmarkAdd01Icon,
  Bookmark01Icon,
  Call02Icon
} from 'hugeicons-react';

// Status configurations
export const TABLE_STATUS_CONFIG = {
  AVAILABLE: {
    label: 'Available',
    color: '#10B981',
    bgColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dotColor: 'bg-emerald-500',
    svgGrad: 'grad-available',
    description: 'Clean and ready for guests'
  },
  OCCUPIED: {
    label: 'Occupied',
    color: '#3B82F6',
    bgColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-500',
    svgGrad: 'grad-occupied',
    description: 'Guests seated & ordering'
  },
  NEEDS_VERIFICATION: {
    label: 'Needs Verification',
    color: '#8B5CF6',
    bgColor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
    dotColor: 'bg-violet-500',
    svgGrad: 'grad-verify',
    description: 'QR postpaid order awaiting waiter approval'
  },
  PROCESSING: {
    label: 'Cooking',
    color: '#F97316',
    bgColor: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
    dotColor: 'bg-orange-500',
    svgGrad: 'grad-processing',
    description: 'In kitchen preparation'
  },
  READY: {
    label: 'Food Ready',
    color: '#EAB308',
    bgColor: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    dotColor: 'bg-yellow-500',
    svgGrad: 'grad-ready',
    description: 'Ready on kitchen pass'
  },
  SERVED: {
    label: 'Served',
    color: '#06B6D4',
    bgColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
    dotColor: 'bg-cyan-500',
    svgGrad: 'grad-served',
    description: 'Dining in progress'
  },
  BILL_REQUESTED: {
    label: 'Bill Requested',
    color: '#EC4899',
    bgColor: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30',
    dotColor: 'bg-pink-500',
    svgGrad: 'grad-bill',
    description: 'Bill called / payment pending'
  },
  ATTENTION: {
    label: 'Waiter Called',
    color: '#EF4444',
    bgColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 animate-pulse',
    dotColor: 'bg-red-500',
    svgGrad: 'grad-attention',
    description: 'Needs staff assistance'
  },
  RESERVED: {
    label: 'Reserved',
    color: '#64748B',
    bgColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
    dotColor: 'bg-slate-500',
    svgGrad: 'grad-reserved',
    description: 'Held for a booked guest'
  }
};

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDateTime = (iso) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Silhouettes are drawn for 1..10 seats; bigger tables reuse the 10-seat layout (labels still show the real count)
export const MAX_DRAWN_SEATS = 10;

/**
 * Geometry for a table with `seats` chairs, centred on (0,0).
 * Returns { kind: 'round', r, chairs } or { kind: 'rect', w, h, chairs },
 * where each chair is { x, y, w, h, rotate } (centre point + rotation in degrees).
 */
function seatLayout(seats) {
  const n = Math.min(MAX_DRAWN_SEATS, Math.max(1, seats));

  // --- 1–4 seats: round table, chairs evenly around the rim, rotated to face inward ---
  if (n <= 4) {
    const r = n <= 2 ? 26 : 32;
    const chairW = n <= 2 ? 28 : 30;
    const chairH = 10;
    const dist = r + 4 + chairH / 2;          // chair centre sits just outside the rim
    const chairs = Array.from({ length: n }, (_, i) => {
      // start at the top (−90°) and go clockwise
      const angle = -90 + (360 / n) * i;
      const rad = (angle * Math.PI) / 180;
      return {
        x: Math.cos(rad) * dist,
        y: Math.sin(rad) * dist,
        w: chairW,
        h: chairH,
        rotate: angle + 90                    // tangent to the circle
      };
    });
    return { kind: 'round', r, chairs };
  }

  // --- 5–10 seats: rectangle. Chairs on the long edges; odd counts / 9+ put chairs at the ends ---
  const chairW = 22, chairH = 9, pitch = 26, gap = 3;
  let perSideTop, perSideBottom, ends;
  switch (n) {
    case 5:  perSideTop = 3; perSideBottom = 2; ends = 0; break;
    case 6:  perSideTop = 3; perSideBottom = 3; ends = 0; break;
    case 7:  perSideTop = 3; perSideBottom = 3; ends = 1; break;
    case 8:  perSideTop = 4; perSideBottom = 4; ends = 0; break;
    case 9:  perSideTop = 4; perSideBottom = 4; ends = 1; break;
    default: perSideTop = 4; perSideBottom = 4; ends = 2; break; // 10
  }
  const longest = Math.max(perSideTop, perSideBottom);
  const w = longest * pitch + 10;
  const h = 54;

  const rowChairs = (count, y) => {
    const span = (count - 1) * pitch;
    return Array.from({ length: count }, (_, i) => ({
      x: -span / 2 + i * pitch,
      y,
      w: chairW,
      h: chairH,
      rotate: 0
    }));
  };

  const chairs = [
    ...rowChairs(perSideTop, -h / 2 - gap - chairH / 2),
    ...rowChairs(perSideBottom, h / 2 + gap + chairH / 2)
  ];
  // End chairs (head of table): right first, then left
  if (ends >= 1) chairs.push({ x: w / 2 + gap + chairH / 2, y: 0, w: chairW, h: chairH, rotate: 90 });
  if (ends >= 2) chairs.push({ x: -w / 2 - gap - chairH / 2, y: 0, w: chairW, h: chairH, rotate: 90 });

  return { kind: 'rect', w, h, chairs };
}

// Computes geometric positions for restaurant tables evenly across the canvas
function computeFloorLayout(tables = []) {
  if (!tables || tables.length === 0) return [];

  const n = tables.length;
  // Calculate columns to arrange cleanly (e.g. 3 to 6 columns)
  const cols = n <= 4 ? Math.max(n, 2) : n <= 8 ? 4 : n <= 15 ? 5 : 6;
  const colWidth = 960 / cols;
  const rowHeight = 135;
  const startX = 70 + colWidth / 2;
  const startY = 100;

  return tables.map((tbl, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * colWidth;
    const y = startY + row * rowHeight;
    // Silhouette (shape + chair count) is derived from capacity in renderTableShape
    return {
      ...tbl,
      x,
      y,
      capacity: tbl.capacity || 4
    };
  });
}

// Custom SVG Table Component
const SvgTableElement = ({ table, isSelected, onSelect }) => {
  const cfg = TABLE_STATUS_CONFIG[table.status] || TABLE_STATUS_CONFIG.AVAILABLE;
  const isAttention = table.status === 'ATTENTION' || table.hasWaiterCall;
  const isReady = table.status === 'READY';
  const isBill = table.status === 'BILL_REQUESTED';
  const isVerify = table.status === 'NEEDS_VERIFICATION';
  const isReserved = table.status === 'RESERVED';
  const reservedFor = table.reservation?.guestName || null;

  const glowId = isAttention
    ? 'url(#glow-red)'
    : isVerify
      ? 'url(#glow-verify)'
      : isReady
        ? 'url(#glow-ready)'
        : isSelected
          ? 'url(#glow-selected)'
          : 'url(#shadow-subtle)';

  // Renders the table silhouette with one chair per seat (1–10 drawn; larger capacities use the 10-chair layout).
  // 1–4 seats: round top, chairs spaced evenly around the rim.
  // 5–10 seats: rectangular top that grows with the count; chairs along the long edges,
  //             extras at the two ends (head of table).
  const renderTableShape = () => {
    const seats = Math.min(MAX_DRAWN_SEATS, Math.max(1, table.capacity || 4));
    const layout = seatLayout(seats);
    const chairFill = '#3f3f46';
    const chairStroke = '#27272a';

    const chairs = layout.chairs.map((c, i) => (
      <rect
        key={i}
        x={-c.w / 2}
        y={-c.h / 2}
        width={c.w}
        height={c.h}
        rx="3"
        fill={chairFill}
        stroke={chairStroke}
        strokeWidth="1.5"
        transform={`translate(${c.x} ${c.y}) rotate(${c.rotate || 0})`}
      />
    ));

    if (layout.kind === 'round') {
      const r = layout.r;
      return (
        <g className="table-shape-group">
          {chairs}
          <circle
            cx="0"
            cy="0"
            r={r}
            fill={`url(#${cfg.svgGrad})`}
            stroke={cfg.color}
            strokeWidth={isSelected ? 3 : 2}
            filter={glowId}
          />
          <circle cx="0" cy="0" r={r - 4} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        </g>
      );
    }

    const { w, h } = layout;
    return (
      <g className="table-shape-group">
        {chairs}
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          rx="8"
          fill={`url(#${cfg.svgGrad})`}
          stroke={cfg.color}
          strokeWidth={isSelected ? 3 : 2}
          filter={glowId}
        />
        <rect
          x={-w / 2 + 4}
          y={-h / 2 + 4}
          width={w - 8}
          height={h - 8}
          rx="6"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
      </g>
    );
  };

  return (
    <g
      id={`table-node-${table.tableNumber}`}
      transform={`translate(${table.x}, ${table.y})`}
      className="cursor-pointer select-none transition-opacity hover:opacity-80"
      onClick={() => onSelect(table)}
    >
      <title>{`Table ${table.tableNumber} · ${cfg.label} (${table.capacity} seats)`}</title>
      {/* Animated Radar Pulse Rings for ATTENTION / Waiter Call */}
      {isAttention && (
        <>
          <circle cx="0" cy="0" r="34" stroke="#EF4444" strokeWidth="2.5" fill="none" opacity="0.8">
            <animate attributeName="r" values="32;58;72" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.85;0.35;0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="0" cy="0" r="34" stroke="#EF4444" strokeWidth="1.5" fill="none" opacity="0.6">
            <animate attributeName="r" values="32;46;62" dur="1.8s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.65;0.25;0" dur="1.8s" begin="0.6s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Gentle Yellow Pulse for READY food */}
      {isReady && (
        <circle cx="0" cy="0" r="34" stroke="#EAB308" strokeWidth="2" fill="none" opacity="0.75">
          <animate attributeName="r" values="32;48;58" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.75;0.2;0" dur="2.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Selected Dashed Halo */}
      {isSelected && (
        <circle cx="0" cy="0" r="44" stroke="#ffffff" strokeWidth="2" strokeDasharray="4 3" fill="none" opacity="0.85">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite" />
        </circle>
      )}

      {/* The physical table SVG */}
      {renderTableShape()}

      {/* Table Label & Details in Center */}
      <g className="pointer-events-none">
        {/* Table Number */}
        <text
          x="0"
          y={table.currentOrder || reservedFor ? -4 : 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="14"
          fontWeight="800"
          letterSpacing="0.5"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
        >
          {table.tableNumber}
        </text>

        {/* Small badge / sub-label: running total, or the guest it is held for */}
        {table.currentOrder ? (
          <text
            x="0"
            y="11"
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.85)"
            fontSize="9"
            fontWeight="600"
          >
            ₹{table.currentOrder.totalAmount}
          </text>
        ) : reservedFor ? (
          <text
            x="0"
            y="11"
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.9)"
            fontSize="8"
            fontWeight="600"
          >
            {reservedFor.length > 10 ? `${reservedFor.slice(0, 9)}…` : reservedFor}
          </text>
        ) : null}

        {/* Status Indicator Icon Badge in Top-Right Corner */}
        {isAttention ? (
          <g transform="translate(18, -20)">
            <circle cx="0" cy="0" r="8" fill="#EF4444" stroke="#ffffff" strokeWidth="1.5" />
            <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">!</text>
          </g>
        ) : isBill ? (
          <g transform="translate(18, -20)">
            <circle cx="0" cy="0" r="8" fill="#EC4899" stroke="#ffffff" strokeWidth="1.5" />
            <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">₹</text>
          </g>
        ) : isVerify ? (
          <g transform="translate(18, -20)">
            <circle cx="0" cy="0" r="8" fill="#8B5CF6" stroke="#ffffff" strokeWidth="1.5" />
            <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">?</text>
          </g>
        ) : isReady ? (
          <g transform="translate(18, -20)">
            <circle cx="0" cy="0" r="8" fill="#EAB308" stroke="#ffffff" strokeWidth="1.5" />
            <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">✓</text>
          </g>
        ) : isReserved || reservedFor ? (
          <g transform="translate(18, -20)">
            <circle cx="0" cy="0" r="8" fill="#64748B" stroke="#ffffff" strokeWidth="1.5" />
            {/* bookmark glyph */}
            <path d="M-3 -4 h6 v8 l-3 -2.5 l-3 2.5 z" fill="#ffffff" />
          </g>
        ) : null}
      </g>
    </g>
  );
};

export const LiveTableFloorPlan = ({
  floorStatus,
  onSelectTable,
  onResolveWaiterCall,
  onOpenPOS,
  onReserveTable,          // (table) => void — opens the reserve dialog
  onSeatReservation,       // (reservationId) => Promise
  onCancelReservation,     // (reservationId) => Promise
  className = ''
}) => {
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [reservationBusyId, setReservationBusyId] = useState(null);
  const [viewMode, setViewMode] = useState('floor'); // 'floor' | 'grid'
  const [zoomLevel, setZoomLevel] = useState(1);
  const containerRef = useRef(null);

  const tables = floorStatus?.tables || [];
  const layoutTables = useMemo(() => computeFloorLayout(tables), [tables]);

  // Compute status summary counts
  const statusCounts = useMemo(() => {
    const counts = {
      ALL: tables.length,
      AVAILABLE: 0,
      OCCUPIED: 0,
      NEEDS_VERIFICATION: 0,
      PROCESSING: 0,
      READY: 0,
      SERVED: 0,
      BILL_REQUESTED: 0,
      ATTENTION: 0,
      RESERVED: 0
    };
    tables.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      } else {
        counts.AVAILABLE++;
      }
    });
    return counts;
  }, [tables]);

  // Filtered tables
  const displayedTables = useMemo(() => {
    if (filterStatus === 'ALL') return layoutTables;
    return layoutTables.filter((t) => t.status === filterStatus);
  }, [layoutTables, filterStatus]);

  // Always resolve the drawer's table from the latest floorStatus so it updates live
  const selectedTable = useMemo(
    () => (selectedTableId ? layoutTables.find((t) => t.id === selectedTableId) || null : null),
    [layoutTables, selectedTableId]
  );
  const setSelectedTable = (table) => setSelectedTableId(table ? table.id : null);

  const handleTableClick = (table) => {
    setSelectedTable(table);
    if (onSelectTable) onSelectTable(table);
  };

  const runReservationAction = async (fn, reservationId) => {
    if (!fn) return;
    setReservationBusyId(reservationId);
    try {
      await fn(reservationId);
    } finally {
      setReservationBusyId(null);
    }
  };

  return (
    <div className={`flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden ${className}`}>
      {/* Top Header & Interactive Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Restaurant01Icon size={20} />
          </div>
          <div>
            <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Live Restaurant Floor
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live Sync
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Live status overview of {tables.length} tables & customer activity.
            </p>
          </div>
        </div>

        {/* View Switcher & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          {viewMode === 'floor' && (
            <div className="flex items-center bg-zinc-200/80 dark:bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-300/60 dark:border-zinc-700/60">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.15))}
                className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Zoom Out"
              >
                <ZoomOutAreaIcon size={16} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="px-2 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                title="Reset Zoom"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.15))}
                className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Zoom In"
              >
                <ZoomInAreaIcon size={16} />
              </button>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex bg-zinc-200/80 dark:bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-300/60 dark:border-zinc-700/60">
            <button
              onClick={() => setViewMode('floor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'floor'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Layers01Icon size={14} />
              Floor Plan
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <GridIcon size={14} />
              Grid View
            </button>
          </div>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 overflow-x-auto border-b border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 scrollbar-none">
        <span className="text-xs font-semibold text-zinc-400 mr-1 shrink-0">Filter:</span>
        <button
          onClick={() => setFilterStatus('ALL')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${
            filterStatus === 'ALL'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-transparent shadow-sm'
              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          All ({statusCounts.ALL})
        </button>

        {Object.entries(TABLE_STATUS_CONFIG).map(([statusKey, cfg]) => {
          const count = statusCounts[statusKey] || 0;
          const isActive = filterStatus === statusKey;
          return (
            <button
              key={statusKey}
              onClick={() => setFilterStatus(statusKey)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all shrink-0 ${
                isActive
                  ? 'ring-2 ring-offset-1 ring-zinc-500 ' + cfg.bgColor
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
              <span>{cfg.label}</span>
              <span className="text-[10px] font-bold opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 min-h-[520px] overflow-hidden" ref={containerRef}>
        {tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Restaurant01Icon size={32} className="text-zinc-400" />
            </div>
            <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">No tables configured</h4>
            <p className="text-xs text-zinc-500 max-w-sm">
              Add tables in your Store Settings to activate the live architectural floor plan and QR dine-in tracking.
            </p>
          </div>
        ) : viewMode === 'floor' ? (
          /* SVG Architectural Floor Plan */
          <div className="w-full h-full min-h-[540px] flex items-center justify-center p-2 bg-[#09090b] relative select-none overflow-auto">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out'
              }}
              className="w-full max-w-[1100px]"
            >
              <svg
                viewBox="0 0 1100 660"
                className="w-full h-auto drop-shadow-2xl rounded-xl"
                style={{ background: '#09090b' }}
              >
                <defs>
                  {/* Floor Tile Pattern */}
                  <pattern id="floor-tile-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#18181b" strokeWidth="0.8" />
                    <circle cx="20" cy="20" r="0.8" fill="#27272a" />
                  </pattern>

                  {/* Wood Planks Pattern for Bar / Pass */}
                  <pattern id="wood-pattern" width="60" height="12" patternUnits="userSpaceOnUse">
                    <rect width="60" height="12" fill="#1c1917" stroke="#292524" strokeWidth="0.5" />
                  </pattern>

                  {/* Gradients for Table Statuses */}
                  <radialGradient id="grad-available" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="70%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#047857" />
                  </radialGradient>

                  <radialGradient id="grad-occupied" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="70%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#1D4ED8" />
                  </radialGradient>

                  <radialGradient id="grad-verify" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#A78BFA" />
                    <stop offset="70%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#7C3AED" />
                  </radialGradient>

                  <radialGradient id="grad-processing" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#FB923C" />
                    <stop offset="70%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </radialGradient>

                  <radialGradient id="grad-ready" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#FDE047" />
                    <stop offset="70%" stopColor="#EAB308" />
                    <stop offset="100%" stopColor="#CA8A04" />
                  </radialGradient>

                  <radialGradient id="grad-served" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#22D3EE" />
                    <stop offset="70%" stopColor="#06B6D4" />
                    <stop offset="100%" stopColor="#0891B2" />
                  </radialGradient>

                  <radialGradient id="grad-bill" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#F472B6" />
                    <stop offset="70%" stopColor="#EC4899" />
                    <stop offset="100%" stopColor="#DB2777" />
                  </radialGradient>

                  <radialGradient id="grad-attention" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#F87171" />
                    <stop offset="70%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#DC2626" />
                  </radialGradient>

                  <radialGradient id="grad-reserved" cx="40%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#94A3B8" />
                    <stop offset="70%" stopColor="#64748B" />
                    <stop offset="100%" stopColor="#475569" />
                  </radialGradient>

                  {/* Glow Filters */}
                  <filter id="glow-red" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="glow-ready" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="glow-verify" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="glow-selected" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="shadow-subtle" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
                  </filter>
                </defs>

                {/* Floor Tile Canvas */}
                <rect x="0" y="0" width="1100" height={Math.max(480, Math.ceil(displayedTables.length / (displayedTables.length <= 4 ? Math.max(displayedTables.length, 2) : displayedTables.length <= 8 ? 4 : displayedTables.length <= 15 ? 5 : 6)) * 135 + 70)} fill="url(#floor-tile-pattern)" rx="16" />

                {/* Outer Floor Perimeter */}
                <rect
                  x="12"
                  y="12"
                  width="1076"
                  height={Math.max(480, Math.ceil(displayedTables.length / (displayedTables.length <= 4 ? Math.max(displayedTables.length, 2) : displayedTables.length <= 8 ? 4 : displayedTables.length <= 15 ? 5 : 6)) * 135 + 70) - 24}
                  rx="14"
                  fill="none"
                  stroke="#27272a"
                  strokeWidth="2"
                />

                {/* Render the Table SVGs */}
                {displayedTables.map((tbl) => (
                  <SvgTableElement
                    key={tbl.id || tbl.tableNumber}
                    table={tbl}
                    isSelected={selectedTable?.id === tbl.id}
                    onSelect={handleTableClick}
                  />
                ))}
              </svg>
            </div>
          </div>
        ) : (
          /* Table Grid Cards View */
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 bg-zinc-50/50 dark:bg-zinc-950">
            {displayedTables.map((tbl) => {
              const cfg = TABLE_STATUS_CONFIG[tbl.status] || TABLE_STATUS_CONFIG.AVAILABLE;
              const isSelected = selectedTable?.id === tbl.id;
              return (
                <div
                  key={tbl.id || tbl.tableNumber}
                  onClick={() => handleTableClick(tbl)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-between gap-2 bg-white dark:bg-zinc-900 ${
                    isSelected
                      ? 'ring-2 ring-primary border-transparent shadow-md'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">
                      Table {tbl.tableNumber}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotColor} ${tbl.status === 'ATTENTION' ? 'animate-ping' : ''}`} />
                  </div>

                  {/* SVG Table graphic inside card */}
                  <div className="w-20 h-20 my-1 flex items-center justify-center pointer-events-none">
                    <svg viewBox="-55 -55 110 110" className="w-full h-full overflow-visible">
                      <SvgTableElement
                        table={{ ...tbl, x: 0, y: 0 }}
                        isSelected={isSelected}
                        onSelect={() => {}}
                      />
                    </svg>
                  </div>

                  <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.bgColor}`}>
                    {cfg.label}
                  </span>

                  <div className="w-full text-xs text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <span>{tbl.capacity} seats</span>
                    {tbl.currentOrder ? (
                      <span className="font-bold text-zinc-900 dark:text-zinc-200">
                        ₹{tbl.currentOrder.totalAmount}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Available</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Table Inspection Drawer / Modal */}
      {selectedTable && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-5 bg-zinc-50 dark:bg-zinc-900/70">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Left: Table Overview */}
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black text-xl text-white shadow-md"
                style={{ backgroundColor: TABLE_STATUS_CONFIG[selectedTable.status]?.color || '#10B981' }}
              >
                <span className="text-[10px] font-bold uppercase opacity-80 leading-none">Table</span>
                {selectedTable.tableNumber}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Table {selectedTable.tableNumber}
                  </h4>
                  {selectedTable.activePin && (
                    <span className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
                      PIN: {selectedTable.activePin}
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      TABLE_STATUS_CONFIG[selectedTable.status]?.bgColor
                    }`}
                  >
                    {TABLE_STATUS_CONFIG[selectedTable.status]?.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Capacity: {selectedTable.capacity || 4} seats ·{' '}
                  {TABLE_STATUS_CONFIG[selectedTable.status]?.description}
                </p>
              </div>
            </div>

            {/* Middle: Active Waiter Call or Order Status */}
            {selectedTable.hasWaiterCall && selectedTable.activeWaiterCalls?.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                <AlertCircleIcon size={20} className="shrink-0 animate-bounce" />
                <div className="text-xs">
                  <div className="font-bold">Active Assistance Call</div>
                  <div>Customer requested: {selectedTable.activeWaiterCalls[0].type}</div>
                </div>
                {onResolveWaiterCall && (
                  <button
                    onClick={() => onResolveWaiterCall(selectedTable.activeWaiterCalls[0].id)}
                    className="ml-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition-colors"
                  >
                    Resolve Call
                  </button>
                )}
              </div>
            )}

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center gap-2 self-end md:self-center">
              {onOpenPOS && (
                <button
                  onClick={() => onOpenPOS(selectedTable.tableNumber)}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs transition-colors shadow-sm"
                >
                  {selectedTable.currentOrder ? 'Manage in POS' : 'Punch Order in POS'}
                </button>
              )}
              {onReserveTable && (
                <button
                  onClick={() => onReserveTable(selectedTable)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <BookmarkAdd01Icon size={14} /> Reserve this table
                </button>
              )}
              <button
                onClick={() => setSelectedTable(null)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg text-xs"
                title="Close"
              >
                <Cancel01Icon size={16} />
              </button>
            </div>
          </div>

          {/* Reservations: the one holding the table now, plus upcoming ones */}
          {(selectedTable.reservation || selectedTable.upcomingReservations?.length > 0) && (
            <div className="mt-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800 space-y-2">
              {[
                ...(selectedTable.reservation ? [{ ...selectedTable.reservation, _active: true }] : []),
                ...(selectedTable.upcomingReservations || [])
              ].map((r) => {
                const busy = reservationBusyId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border text-xs ${
                      r._active
                        ? 'bg-slate-500/10 border-slate-500/30'
                        : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-slate-500/15 text-slate-600 dark:text-slate-400 shrink-0">
                      <Bookmark01Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{r.guestName}</span>
                        {r.partySize && (
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <UserGroupIcon size={12} /> {r.partySize}
                          </span>
                        )}
                        {r.guestPhone && (
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <Call02Icon size={12} /> {r.guestPhone}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            r.status === 'SEATED'
                              ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30'
                              : r._active
                                ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30'
                                : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30'
                          }`}
                        >
                          {r.status === 'SEATED' ? 'Seated' : r._active ? 'Holding table' : 'Upcoming'}
                        </span>
                      </div>
                      <div className="text-zinc-500 mt-0.5">
                        {formatDateTime(r.startsAt)} – {formatTime(r.endsAt)}
                        {r.notes && <span className="ml-2 italic text-zinc-400">· {r.notes}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {onSeatReservation && r.status === 'CONFIRMED' && (
                        <button
                          disabled={busy}
                          onClick={() => runReservationAction(onSeatReservation, r.id)}
                          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors"
                        >
                          Seat guest
                        </button>
                      )}
                      {onCancelReservation && (
                        <button
                          disabled={busy}
                          onClick={() => runReservationAction(onCancelReservation, r.id)}
                          className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 text-zinc-700 dark:text-zinc-300 font-semibold rounded-lg text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Order Breakdown */}
          {selectedTable.currentOrder && (
            <div className="mt-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800 flex flex-wrap gap-4 text-xs">
              <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-1 min-w-[200px]">
                <span className="text-zinc-500 text-[11px] block mb-1">Active Order Items:</span>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {selectedTable.currentOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between font-medium text-zinc-800 dark:text-zinc-200">
                      <span>{item.name}</span>
                      <span className="text-zinc-500">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 w-48 flex flex-col justify-between">
                <div>
                  <span className="text-zinc-500 text-[11px] block">Total Amount</span>
                  <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    ₹{selectedTable.currentOrder.totalAmount}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-2">
                  Origin: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{selectedTable.currentOrder.origin}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
