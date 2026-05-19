import { useState } from 'react';
import { Package, FileText, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import type { Waypoint, RouteStats } from '../App';

const MARKER_COLORS = [
  '#f97316','#3b82f6','#22c55e','#a855f7','#ec4899',
  '#14b8a6','#eab308','#ef4444','#6366f1','#84cc16',
];

const STATUS_OPTIONS = ['Pending', 'In Transit', 'Delivered', 'Failed'];
const STATUS_COLORS: Record<string, string> = {
  'Pending': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  'In Transit': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'Delivered': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'Failed': 'bg-red-500/15 text-red-300 border-red-500/30',
};


interface DeliveryPanelProps {
  waypoints: Waypoint[];
  onUpdateWaypoint: (index: number, updates: Partial<Waypoint>) => void;
  routeStats: RouteStats | null;
}

export default function DeliveryPanel({ waypoints, onUpdateWaypoint, routeStats }: DeliveryPanelProps) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [statuses, setStatuses] = useState<string[]>(() => waypoints.map(() => 'Pending'));

  // Keep statuses array synced with waypoints length
  const getStatus = (i: number) => statuses[i] ?? 'Pending';
  const setStatus = (i: number, s: string) => {
    setStatuses(prev => {
      const next = [...prev];
      next[i] = s;
      return next;
    });
  };

  if (waypoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Package size={28} className="text-white/20" />
        </div>
        <div>
          <p className="text-white/50 font-medium mb-1">No delivery stops yet</p>
          <p className="text-white/25 text-xs">Add stops in the Route Planner tab, then manage each delivery here.</p>
        </div>
      </div>
    );
  }

  const deliveredCount = statuses.filter(s => s === 'Delivered').length;
  const progressPct = waypoints.length > 0 ? Math.round((deliveredCount / waypoints.length) * 100) : 0;

  return (
    <div className="p-5 flex flex-col gap-4">

      {/* Progress bar */}
      <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/4">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-white">Delivery Progress</div>
              <div className="text-xs text-white/40">{deliveredCount} of {waypoints.length} stops completed</div>
            </div>
            <div className="text-3xl font-black text-white stat-value">{progressPct}%</div>
          </div>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-emerald-500 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {routeStats && (
          <div className="border-t border-white/8 px-4 py-2.5 flex gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-white/50">
              <Clock size={11} className="text-orange-400" />
              <span>{Math.round(routeStats.duration / 60)} min total</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/50">
              <MapPin size={11} className="text-blue-400" />
              <span>{(routeStats.distance / 1000).toFixed(1)} km total</span>
            </div>
          </div>
        )}
      </div>

      {/* Stop Cards */}
      <div className="flex flex-col gap-2">
        {waypoints.map((wp, i) => {
          const isOpen = expanded === i;
          const status = getStatus(i);
          return (
            <div key={i} className="rounded-xl border border-white/8 overflow-hidden">
              {/* Header row */}
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: MARKER_COLORS[i % MARKER_COLORS.length] }}
                >{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{wp.label || `Stop ${i + 1}`}</div>
                  {wp.eta && <div className="text-[11px] text-white/35">ETA: {wp.eta}</div>}
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[status]}`}>
                  {status}
                </div>
                {isOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
              </button>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-white/8 px-3 pb-3 pt-3 flex flex-col gap-3 bg-black/20">
                  {/* Status selector */}
                  <div>
                    <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5">Status</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => setStatus(i, s)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            status === s ? STATUS_COLORS[s] : 'bg-white/4 border-white/8 text-white/35 hover:bg-white/8'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Delivery note */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileText size={11} className="text-white/35" />
                      <span className="text-[10px] text-white/35 uppercase tracking-widest">Delivery Note</span>
                    </div>
                    <textarea
                      value={wp.note}
                      onChange={e => onUpdateWaypoint(i, { note: e.target.value })}
                      placeholder="e.g. Leave at door, ring bell, fragile package…"
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder-white/20 outline-none resize-none focus:border-orange-500/40 focus:bg-white/8 transition-all"
                    />
                  </div>

                  {/* Coordinates */}
                  <div className="text-[10px] text-white/25 font-mono">
                    📍 {wp.coords[1].toFixed(5)}, {wp.coords[0].toFixed(5)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Print button */}
      <button
        onClick={() => window.print()}
        className="glass-light hover:bg-white/10 transition-all text-white/60 hover:text-white px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 btn-press"
      >
        🖨️ Print Delivery Sheet
      </button>
    </div>
  );
}
