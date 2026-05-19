import { useState } from 'react';
import {
  Play, Route, MapPin, Eraser, Loader2, Car, Bike, PersonStanding,
  GitCompare, Download, Trash2, AlertTriangle, WifiOff, Copy, Check,
  ChevronDown, ChevronUp, Navigation
} from 'lucide-react';
import type { RouteStats, TurnStep, Waypoint } from '../App';
import SmartSearch from './SmartSearch';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type VehicleProfile = 'driving' | 'cycling' | 'foot';

interface RoutePanelProps {
  waypoints: Waypoint[];
  setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  onRemovePoint: (index: number) => void;
  onUpdateWaypoint: (index: number, updates: Partial<Waypoint>) => void;
  onRouteResult: (geo: any, stats: RouteStats, seqGeo?: any, order?: number[]) => void;
  onClear: () => void;
  routeStats: RouteStats | null;
  osrmStatus: 'checking' | 'online' | 'offline';
}

function extractSteps(routeData: any): TurnStep[] {
  const steps: TurnStep[] = [];
  try {
    const legs = routeData?.routes?.[0]?.legs ?? [];
    for (const leg of legs) {
      for (const step of (leg.steps ?? [])) {
        const maneuver = step.maneuver?.type ?? '';
        const modifier = step.maneuver?.modifier ?? '';
        const instruction = modifier
          ? `${maneuver.charAt(0).toUpperCase() + maneuver.slice(1)} ${modifier}`
          : maneuver.charAt(0).toUpperCase() + maneuver.slice(1);
        steps.push({ instruction, distance: step.distance ?? 0, name: step.name ?? '' });
      }
    }
  } catch { /* ignore */ }
  return steps;
}

function extractLegDurations(routeData: any, vehicle: VehicleProfile): number[] {
  try {
    return routeData?.routes?.[0]?.legs?.map((l: any) => {
      if (vehicle === 'foot') return (l.distance ?? 0) / 1.3888;
      if (vehicle === 'cycling') return (l.distance ?? 0) / 4.1666;
      return l.duration ?? 0;
    }) ?? [];
  } catch { return []; }
}

const MARKER_COLORS = [
  '#f97316','#3b82f6','#22c55e','#a855f7','#ec4899',
  '#14b8a6','#eab308','#ef4444','#6366f1','#84cc16',
];

const VEHICLE_OPTIONS = [
  { value: 'driving' as VehicleProfile, label: 'Drive', icon: <Car size={15} />, speed: '~60 km/h' },
  { value: 'cycling' as VehicleProfile, label: 'Cycle', icon: <Bike size={15} />, speed: '~15 km/h' },
  { value: 'foot' as VehicleProfile, label: 'Walk', icon: <PersonStanding size={15} />, speed: '~5 km/h' },
];

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex-1 rounded-xl p-3 bg-white/5 border border-white/8 min-w-0">
      <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-bold stat-value ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/35 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function RoutePanel({
  waypoints, setWaypoints, onRemovePoint, onUpdateWaypoint,
  onRouteResult, onClear, routeStats, osrmStatus,
}: RoutePanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [osrmOffline, setOsrmOffline] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleProfile>('driving');
  const [fleetSize, setFleetSize] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  const points = waypoints.map(w => w.coords);

  const handleOsrmError = (data: any) => {
    if (data?.error === 'OSRM_OFFLINE') {
      setOsrmOffline(true);
      throw new Error(data.message ?? 'OSRM is offline');
    }
    setOsrmOffline(false);
    throw new Error(data?.error ?? 'Unknown error');
  };

  const fetchSequential = async () => {
    if (points.length < 2) return;
    setLoading(true); setError(''); setOsrmOffline(false);
    try {
      const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');
      const res = await fetch(`${BACKEND_URL}/api/route?coordinates=${coordString}&profile=${vehicle}`);
      const data = await res.json();
      if (data.error) handleOsrmError(data);
      if (data.routes?.[0]) {
        const route = data.routes[0];
        let duration = route.duration;
        if (vehicle === 'foot') duration = route.distance / 1.3888;
        if (vehicle === 'cycling') duration = route.distance / 4.1666;

        onRouteResult(route.geometry, {
          distance: route.distance,
          duration: duration,
          stops: points.length,
          steps: extractSteps(data),
          legDurations: extractLegDurations(data, vehicle),
          isOptimized: false,
        });
      }
    } catch (err: any) {
      if (!osrmOffline) setError(err.message);
    } finally { setLoading(false); }
  };

  const fetchTSP = async (withCompare = false) => {
    if (points.length < 3) return;
    setLoading(true); setError(''); setOsrmOffline(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: points, profile: vehicle, vehicles: fleetSize }),
      });
      const data = await res.json();
      if (data.error) handleOsrmError(data);

      if (fleetSize > 1) {
        // Multi-vehicle response handling
        onRouteResult(
          {
            type: "FeatureCollection",
            features: data.routes.map((r: any) => ({
              type: "Feature",
              geometry: r.route.routes[0].geometry,
              properties: { vehicleIndex: r.vehicleIndex, color: r.color }
            }))
          },
          {
            distance: data.totalDistance,
            duration: data.totalDuration,
            stops: points.length,
            isOptimized: true,
          },
          undefined, // no sequential compare for multi
          data.order // all points ordered
        );
        return;
      }

      const route = data.route?.routes?.[0];
      if (!route) throw new Error('No route returned from optimizer');
      const seqRoute = data.sequentialRoute?.routes?.[0];

      let duration = route.duration;
      if (vehicle === 'foot') duration = route.distance / 1.3888;
      if (vehicle === 'cycling') duration = route.distance / 4.1666;

      onRouteResult(
        route.geometry,
        {
          distance: route.distance,
          duration: duration,
          stops: points.length,
          originalDistance: data.sequentialDistance,
          optimizedDistance: data.optimizedDistance,
          savingsPercent: data.savingsPercent,
          steps: extractSteps(data.route),
          legDurations: extractLegDurations(data.route, vehicle),
          isOptimized: true,
        },
        withCompare && seqRoute ? seqRoute.geometry : undefined,
        data.order,
      );
    } catch (err: any) {
      if (!osrmOffline) setError(err.message);
    } finally { setLoading(false); }
  };

  const exportGPX = async () => {
    if (points.length < 2) return;
    setExportLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/export/gpx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: points, profile: vehicle, name: 'Logistics Route' }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'logistics_route.gpx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.message); }
    finally { setExportLoading(false); }
  };

  const exportCSV = () => {
    if (waypoints.length < 1) return;
    const header = 'Stop,Label,Latitude,Longitude,ETA,Note';
    const rows = waypoints.map((wp, i) =>
      `${i + 1},"${wp.label}",${wp.coords[1]},${wp.coords[0]},"${wp.eta ?? ''}","${wp.note ?? ''}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'delivery_stops.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const copyShareLink = () => {
    const base = window.location.origin + window.location.pathname;
    const enc = encodeURIComponent(JSON.stringify(points));
    navigator.clipboard.writeText(`${base}?stops=${enc}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  return (
    <div className="p-5 flex flex-col gap-4">

      {/* OSRM warning */}
      {(osrmOffline || osrmStatus === 'offline') && (
        <div className="flex items-start gap-2.5 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs animate-fade-up">
          <WifiOff size={14} className="shrink-0 mt-0.5 text-red-400" />
          <span>
            <strong className="text-red-300">OSRM routing engine is offline.</strong>
            <br />Start the Docker container to enable real routing.
          </span>
        </div>
      )}

      {/* Smart Search */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Navigation size={13} className="text-orange-400" />
          <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">Add Stops</span>
        </div>
        <SmartSearch
          setPoints={(updater) => {
            const newPoints = typeof updater === 'function' ? updater(points) : updater;
            setWaypoints(prev => {
              // Merge new points with existing waypoints
              return newPoints.map((coords, i) => prev[i]
                ? { ...prev[i], coords }
                : { coords, label: `Stop ${i + 1}`, note: '' }
              );
            });
          }}
        />
        <p className="text-[11px] text-white/30 mt-2 text-center">or click anywhere on the map to drop a pin</p>
      </div>

      {/* Waypoint List */}
      {waypoints.length > 0 && (
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <div className="px-3 py-2.5 bg-white/5 flex items-center justify-between border-b border-white/8">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/60">
              <MapPin size={12} />
              <span>{waypoints.length} Stop{waypoints.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={onClear} className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1">
              <Eraser size={11} /> Clear all
            </button>
          </div>
          <div className="flex flex-col max-h-48 overflow-y-auto custom-scrollbar">
            {waypoints.map((wp, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/5 group transition-colors">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: MARKER_COLORS[i % MARKER_COLORS.length] }}
                >{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <input
                    value={wp.label}
                    onChange={e => onUpdateWaypoint(i, { label: e.target.value })}
                    className="w-full bg-transparent text-sm text-white font-medium outline-none truncate placeholder-white/20 hover:text-orange-200 focus:text-orange-200 transition-colors"
                    placeholder={`Stop ${i + 1}`}
                  />
                  <div className="flex items-center gap-2 mt-0.5">
                    {wp.eta && <span className="text-[10px] text-white/35">ETA: {wp.eta}</span>}
                    {wp.weather && (
                      <span className="text-[10px] text-sky-200 flex items-center gap-1 bg-sky-500/10 px-1.5 rounded" title="Live Weather">
                        {wp.weather.icon} {wp.weather.temp}°C
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onRemovePoint(i)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400/70 hover:text-red-400 p-1 rounded-lg hover:bg-red-400/10"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle Selector */}
      <div className="flex gap-2">
        <div className="flex-[2]">
          <div className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Transport Mode</div>
          <div className="flex gap-1.5">
            {VEHICLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setVehicle(opt.value)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all btn-press ${
                  vehicle === opt.value
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                    : 'bg-white/4 border-white/8 text-white/40 hover:bg-white/8 hover:text-white/60'
                }`}
              >
                {opt.icon}
                <span className="text-[10px] font-semibold">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Fleet</div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map(num => (
              <button
                key={num}
                onClick={() => setFleetSize(num)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all btn-press ${
                  fleetSize === num
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-white/4 border-white/8 text-white/40 hover:bg-white/8 hover:text-white/60'
                }`}
              >
                <span className="text-xs font-bold">{num}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TSP hint */}
      {waypoints.length === 2 && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/80 bg-amber-400/8 border border-amber-400/20 rounded-xl px-3 py-2.5">
          <AlertTriangle size={12} className="flex-shrink-0" />
          <span>Add 1 more stop to unlock TSP optimization</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        <button
          id="btn-sequential-route"
          disabled={waypoints.length < 2 || loading}
          onClick={fetchSequential}
          className="glass-light hover:bg-white/10 active:bg-white/15 transition-all text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-30 text-sm btn-press"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} className="text-blue-400" />}
          Sequential Route
        </button>

        <button
          id="btn-tsp-optimize"
          disabled={waypoints.length < 3 || loading}
          onClick={() => fetchTSP(false)}
          className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white shadow-lg shadow-orange-500/25 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all text-sm btn-press"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
          TSP Auto-Optimize
        </button>

        <button
          id="btn-compare-routes"
          disabled={waypoints.length < 3 || loading}
          onClick={() => fetchTSP(true)}
          className="bg-gradient-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-600/20 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all text-sm btn-press"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <GitCompare size={16} />}
          Compare Routes
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            id="btn-export-gpx"
            disabled={waypoints.length < 2 || exportLoading}
            onClick={exportGPX}
            className="glass-light hover:bg-white/10 transition-all text-white/70 hover:text-white px-2 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 btn-press"
            title="Export as GPX"
          >
            {exportLoading ? <Loader2 className="animate-spin" size={13} /> : <Download size={13} />}
            GPX
          </button>
          <button
            disabled={waypoints.length < 1}
            onClick={exportCSV}
            className="glass-light hover:bg-white/10 transition-all text-white/70 hover:text-white px-2 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 btn-press"
            title="Export stops as CSV"
          >
            <Download size={13} />
            CSV
          </button>
          <button
            disabled={waypoints.length < 1}
            onClick={copyShareLink}
            className="glass-light hover:bg-white/10 transition-all text-white/70 hover:text-white px-2 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 btn-press"
            title="Copy shareable link"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Route Stats */}
      {routeStats && (
        <div className="rounded-2xl overflow-hidden border border-white/8 animate-fade-up">
          {/* Main stats */}
          <div className="p-4 bg-white/4">
            <div className="flex gap-2 mb-3">
              <StatCard
                label="Distance"
                value={`${(routeStats.distance / 1000).toFixed(1)} km`}
                color="text-white"
              />
              <StatCard
                label="Duration"
                value={formatDuration(routeStats.duration)}
                color="text-white"
              />
              <StatCard
                label="Stops"
                value={`${routeStats.stops}`}
                sub={vehicle === 'driving' ? 'driving' : vehicle}
                color="text-white"
              />
            </div>

            {/* Optimization savings */}
            {routeStats.isOptimized && routeStats.originalDistance !== undefined && (
              <div className="mt-2 rounded-xl bg-gradient-to-r from-orange-500/15 to-pink-500/15 border border-orange-500/20 p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-orange-300/60 uppercase tracking-widest">Original</div>
                  <div className="text-sm text-white/50 line-through">{(routeStats.originalDistance / 1000).toFixed(1)} km</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-orange-400">{routeStats.savingsPercent ?? 0}%</div>
                  <div className="text-[10px] text-orange-300/60">distance saved</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-emerald-300/60 uppercase tracking-widest">CO₂ Saved</div>
                  <div className="text-sm text-emerald-400 font-semibold">
                    ~{(((routeStats.originalDistance ?? 0) - routeStats.distance) / 1000 * 120).toFixed(0)}g
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Turn-by-turn */}
          {routeStats.steps && routeStats.steps.length > 0 && (
            <div className="border-t border-white/8">
              <button
                onClick={() => setStepsOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
              >
                <span className="font-medium">Turn-by-turn ({routeStats.steps.length} steps)</span>
                {stepsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {stepsOpen && (
                <div className="max-h-48 overflow-y-auto custom-scrollbar bg-black/20">
                  {routeStats.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 border-t border-white/5 text-xs">
                      <span className="text-white/25 font-mono min-w-[22px] pt-0.5">{i + 1}.</span>
                      <div className="flex-1 text-white/65">{step.instruction}{step.name ? ` on ${step.name}` : ''}</div>
                      {step.distance > 0 && (
                        <span className="text-white/35 flex-shrink-0 tabular-nums">{(step.distance / 1000).toFixed(1)} km</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && !osrmOffline && (
        <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
