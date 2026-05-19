import { useState } from 'react';
import {
  Play, Route, MapPin, Eraser, Loader2, Car, Truck, Bike,
  GitCompare, Download, Trash2, AlertTriangle, WifiOff
} from 'lucide-react';
import type { RouteStats, TurnStep } from '../App';
import SmartSearch from './SmartSearch';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type VehicleProfile = 'driving' | 'cycling' | 'foot';

interface ControlPanelProps {
  points: [number, number][];
  setPoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  onRouteResult: (geo: any, stats: RouteStats, seqGeo?: any, order?: number[]) => void;
  onClear: () => void;
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
        steps.push({
          instruction,
          distance: step.distance ?? 0,
          name: step.name ?? '',
        });
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return steps;
}

export default function ControlPanel({ points, setPoints, onRouteResult, onClear }: ControlPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [osrmOffline, setOsrmOffline] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleProfile>('driving');
  const [exportLoading, setExportLoading] = useState(false);

  const handleOsrmError = (data: any) => {
    if (data?.error === 'OSRM_OFFLINE') {
      setOsrmOffline(true);
      throw new Error(data.message ?? 'OSRM is offline');
    }
    setOsrmOffline(false);
    throw new Error(data?.error ?? 'Unknown error');
  };

  // ── Sequential Route ──────────────────────────────────────────────────
  const fetchSequential = async () => {
    if (points.length < 2) return;
    setLoading(true);
    setError('');
    setOsrmOffline(false);
    try {
      const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');
      const res = await fetch(`${BACKEND_URL}/api/route?coordinates=${coordString}&profile=${vehicle}`);
      const data = await res.json();
      if (data.error) handleOsrmError(data);
      if (data.routes?.[0]) {
        const route = data.routes[0];
        onRouteResult(
          route.geometry,
          {
            distance: route.distance,
            duration: route.duration,
            stops: points.length,
            steps: extractSteps(data),
            isOptimized: false,
          }
        );
      }
    } catch (err: any) {
      if (!osrmOffline) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── TSP Optimize ──────────────────────────────────────────────────────
  const fetchTSP = async (withCompare = false) => {
    if (points.length < 3) return;
    setLoading(true);
    setError('');
    setOsrmOffline(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: points, profile: vehicle }),
      });
      const data = await res.json();
      if (data.error) handleOsrmError(data);

      const route = data.route?.routes?.[0];
      if (!route) throw new Error('No route returned from optimizer');

      const seqRoute = data.sequentialRoute?.routes?.[0];

      onRouteResult(
        route.geometry,
        {
          distance: route.distance,
          duration: route.duration,
          stops: points.length,
          originalDistance: data.sequentialDistance,
          optimizedDistance: data.optimizedDistance,
          savingsPercent: data.savingsPercent,
          steps: extractSteps(data.route),
          isOptimized: true,
        },
        withCompare && seqRoute ? seqRoute.geometry : undefined,
        data.order,
      );
    } catch (err: any) {
      if (!osrmOffline) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Export GPX ────────────────────────────────────────────────────────
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
      a.href = url;
      a.download = 'logistics_route.gpx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const vehicleOptions: { value: VehicleProfile; label: string; icon: React.ReactNode }[] = [
    { value: 'driving', label: 'Car', icon: <Car size={14} /> },
    { value: 'cycling', label: 'Bicycle', icon: <Bike size={14} /> },
    { value: 'foot', label: 'Walking', icon: <Truck size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-3">

      {/* Smart Search (Nominatim) */}
      <SmartSearch setPoints={setPoints} />

      {/* OSRM Offline Warning (Issue #9 / Feature) */}
      {osrmOffline && (
        <div className="flex items-start gap-2 p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-xs">
          <WifiOff size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>OSRM is offline.</strong> Start the Docker container first:<br />
            <code className="text-red-200 text-[10px]">docker run -p 5000:5000 -v "%cd%:/data" ... osrm-routed</code>
          </span>
        </div>
      )}

      {/* Waypoint count & list (Issue #12 / Feature F4) */}
      <div className="bg-black/20 rounded-xl border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
            <MapPin size={13} />
            <span>{points.length} Waypoint{points.length !== 1 ? 's' : ''}</span>
            {points.length < 2 && (
              <span className="text-white/40 italic">(click on map to add)</span>
            )}
          </div>
        </div>

        {points.length > 0 && (
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
            {points.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors group">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#eab308','#ef4444','#6366f1','#84cc16'][i % 10] }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-white/50 font-mono truncate">
                    {p[1].toFixed(4)}, {p[0].toFixed(4)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPoints(prev => prev.filter((_, idx) => idx !== i));
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-0.5 rounded"
                  title="Remove this waypoint"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vehicle Type Selector (Feature F13 / Issue #10) */}
      <div className="flex gap-1.5">
        {vehicleOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setVehicle(opt.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-all ${
              vehicle === opt.value
                ? 'bg-white/20 border-white/30 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* TSP clarity hint (Issue #8) */}
      {points.length === 2 && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle size={12} />
          <span>Add 1 more stop (≥ 3) to enable TSP optimization</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        <button
          id="btn-sequential-route"
          disabled={points.length < 2 || loading}
          onClick={fetchSequential}
          className="bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all text-white border border-white/20 px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-40 text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
          Sequential Route
        </button>

        <button
          id="btn-tsp-optimize"
          disabled={points.length < 3 || loading}
          onClick={() => fetchTSP(false)}
          className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white shadow-lg border border-white/20 px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-40 transition-all text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
          TSP Auto-Optimize
        </button>

        {/* Compare Routes button (Feature F12) */}
        <button
          id="btn-compare-routes"
          disabled={points.length < 3 || loading}
          onClick={() => fetchTSP(true)}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg border border-white/20 px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-40 transition-all text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <GitCompare size={16} />}
          Compare Sequential vs TSP
        </button>

        <div className="flex gap-2">
          {/* Export GPX (Feature F14) */}
          <button
            id="btn-export-gpx"
            disabled={points.length < 2 || exportLoading}
            onClick={exportGPX}
            className="flex-1 bg-black/30 hover:bg-black/50 transition-colors text-white border border-white/10 px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
            title="Export route as GPX file"
          >
            {exportLoading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
            GPX
          </button>

          <button
            id="btn-clear-map"
            onClick={onClear}
            className="flex-1 bg-black/30 hover:bg-red-500/20 hover:border-red-400/30 transition-colors text-white border border-white/10 px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <Eraser size={14} />
            Clear All
          </button>
        </div>
      </div>

      {error && !osrmOffline && (
        <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
