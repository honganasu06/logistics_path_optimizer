import { useState, useCallback, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import Sidebar from './components/Sidebar';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface Waypoint {
  coords: [number, number];
  label: string;
  note: string;
  eta?: string;
  weather?: { temp: number; code: number; icon: string };
}

export interface RouteStats {
  distance: number;
  duration: number;
  stops: number;
  originalDistance?: number;
  optimizedDistance?: number;
  savingsPercent?: number;
  steps?: TurnStep[];
  isOptimized?: boolean;
  legDurations?: number[];
}

export interface TurnStep {
  instruction: string;
  distance: number;
  name: string;
}

function computeETAs(waypoints: Waypoint[], legDurations: number[]): Waypoint[] {
  const now = new Date();
  let elapsed = 0;
  return waypoints.map((wp, i) => {
    if (i === 0) return { ...wp, eta: 'Start' };
    
    let legDuration = legDurations[i - 1] ?? 0;
    
    // Apply weather penalty (e.g. +30% time for bad weather)
    if (wp.weather) {
      const code = wp.weather.code;
      // Rain, snow, thunderstorms
      if ((code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 95 && code <= 99)) {
        legDuration *= 1.3; 
      }
    }
    
    elapsed += legDuration;
    const eta = new Date(now.getTime() + elapsed * 1000);
    return { ...wp, eta: eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  });
}

export default function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [routeGeoJSONSeq, setRouteGeoJSONSeq] = useState<any>(null);
  const [tspOrder, setTspOrder] = useState<number[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [fitBoundsGeoJSON, setFitBoundsGeoJSON] = useState<any>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'street' | 'satellite'>('dark');
  const [osrmStatus, setOsrmStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Poll OSRM health every 10s
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        setOsrmStatus(data.osrm === 'online' ? 'online' : 'offline');
      } catch {
        setOsrmStatus('offline');
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  const points = waypoints.map(w => w.coords);

  const handleClear = useCallback(() => {
    setWaypoints([]);
    setRouteStats(null);
    setRouteGeoJSON(null);
    setRouteGeoJSONSeq(null);
    setTspOrder(null);
    setCompareMode(false);
    setFitBoundsGeoJSON(null);
  }, []);

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      const data = await res.json();
      if (data.current_weather) {
        const code = data.current_weather.weathercode;
        let icon = '☀️';
        if (code >= 1 && code <= 3) icon = '⛅';
        else if (code >= 45 && code <= 48) icon = '🌫️';
        else if (code >= 51 && code <= 67) icon = '🌧️';
        else if (code >= 71 && code <= 77) icon = '❄️';
        else if (code >= 80 && code <= 82) icon = '🌦️';
        else if (code >= 95 && code <= 99) icon = '⛈️';
        return { temp: data.current_weather.temperature, code, icon };
      }
    } catch(e) {
      console.error(e);
    }
    return undefined;
  };

  const handleAddPoint = useCallback((coords: [number, number]) => {
    // Add point immediately without weather
    setWaypoints(prev => [...prev, { coords, label: `Stop ${prev.length + 1}`, note: '' }]);
    setRouteStats(null);
    setRouteGeoJSON(null);
    setRouteGeoJSONSeq(null);
    setTspOrder(null);
    setFitBoundsGeoJSON(null);

    // Fetch weather asynchronously
    fetchWeather(coords[1], coords[0]).then(weather => {
      if (weather) {
        setWaypoints(prev => {
          const index = prev.findIndex(p => p.coords[0] === coords[0] && p.coords[1] === coords[1]);
          if (index !== -1) {
            const next = [...prev];
            next[index] = { ...next[index], weather };
            return next;
          }
          return prev;
        });
      }
    });
  }, []);

  const handleRemovePoint = useCallback((index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
    setRouteStats(null);
    setRouteGeoJSON(null);
    setRouteGeoJSONSeq(null);
    setTspOrder(null);
    setFitBoundsGeoJSON(null);
  }, []);

  const handleUpdateWaypoint = useCallback((index: number, updates: Partial<Waypoint>) => {
    setWaypoints(prev => prev.map((wp, i) => i === index ? { ...wp, ...updates } : wp));
  }, []);

  const handleRouteResult = useCallback((geo: any, stats: RouteStats, seqGeo?: any, order?: number[]) => {
    setRouteGeoJSON(geo);
    setRouteStats(stats);
    setFitBoundsGeoJSON(geo);
    if (stats.legDurations?.length) {
      setWaypoints(prev => computeETAs(prev, stats.legDurations!));
    }
    if (seqGeo) { setRouteGeoJSONSeq(seqGeo); setCompareMode(true); }
    else { setRouteGeoJSONSeq(null); setCompareMode(false); }
    setTspOrder(order ?? null);
  }, []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0b14' }}>

      {/* SIDEBAR */}
      {sidebarOpen && (
        <div style={{ width: '420px', flexShrink: 0, height: '100%', zIndex: 100 }}>
          <Sidebar
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            onRemovePoint={handleRemovePoint}
            onUpdateWaypoint={handleUpdateWaypoint}
            onRouteResult={handleRouteResult}
            onClear={handleClear}
            routeStats={routeStats}
            osrmStatus={osrmStatus}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* MAP AREA */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>

        {/* Map */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <MapComponent
            points={points}
            waypoints={waypoints}
            onAddPoint={handleAddPoint}
            routeGeoJSON={routeGeoJSON}
            routeGeoJSONSequential={compareMode ? routeGeoJSONSeq : null}
            fitBoundsGeoJSON={fitBoundsGeoJSON}
            onRemovePoint={handleRemovePoint}
            tspOrder={tspOrder}
            mapStyle={mapStyle}
          />
        </div>

        {/* Open sidebar button (when closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              position: 'absolute', top: 16, left: 16, zIndex: 500,
              background: '#0f1020', border: '1px solid rgba(255,255,255,0.15)',
              color: 'white', borderRadius: 10, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            ☰ Open Panel
          </button>
        )}

        {/* Map controls — top right */}
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* OSRM status */}
          <div style={{
            background: '#0f1020', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 600,
            color: osrmStatus === 'online' ? '#22c55e' : osrmStatus === 'offline' ? '#ef4444' : '#94a3b8',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <div className={`dot-${osrmStatus}`} style={{ width: 8, height: 8, borderRadius: '50%' }} />
            OSRM {osrmStatus === 'checking' ? '...' : osrmStatus}
          </div>

          {/* Map style toggle */}
          <div style={{
            background: '#0f1020', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            {(['dark', 'street', 'satellite'] as const).map(s => (
              <button
                key={s}
                onClick={() => setMapStyle(s)}
                style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  background: mapStyle === s ? '#252840' : 'transparent',
                  color: mapStyle === s ? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none', borderBottom: s !== 'satellite' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontSize: 12, fontWeight: 500, textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'dark' ? '🌑 Dark' : s === 'street' ? '🗺️ Street' : '🛰️ Satellite'}
              </button>
            ))}
          </div>
        </div>

        {/* Route legend when compare mode active */}
        {compareMode && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 500, background: '#0f1020', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '8px 16px', display: 'flex', gap: 20,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)', fontSize: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f97316', fontWeight: 600 }}>
              <div style={{ width: 24, height: 3, background: '#f97316', borderRadius: 2 }} />
              TSP Optimized
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontWeight: 600 }}>
              <div style={{ width: 24, height: 3, background: '#60a5fa', borderRadius: 2, borderTop: '2px dashed #60a5fa' }} />
              Sequential
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
