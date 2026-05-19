import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Waypoint } from '../App';

// Fix Leaflet's default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;

const MARKER_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899',
  '#14b8a6', '#eab308', '#ef4444', '#6366f1', '#84cc16',
];

function createNumberedIcon(index: number, isOptimized = false) {
  const color = MARKER_COLORS[index % MARKER_COLORS.length];
  const label = index + 1;
  const ring = isOptimized ? `box-shadow:0 0 0 3px ${color}55,0 4px 16px rgba(0,0,0,0.6);` : 'box-shadow:0 4px 16px rgba(0,0,0,0.5);';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:34px; height:34px; border-radius:50% 50% 50% 0;
        background:${color}; transform:rotate(-45deg);
        border:2.5px solid rgba(255,255,255,0.7);
        ${ring}
        display:flex; align-items:center; justify-content:center;
        transition:all 0.2s;
      ">
        <span style="
          transform:rotate(45deg); color:white; font-size:12px;
          font-weight:800; font-family:Inter,system-ui,sans-serif;
          text-shadow:0 1px 3px rgba(0,0,0,0.6);
          line-height:1;
        ">${label}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -36],
  });
}

function ClickHandler({ onAddPoint }: { onAddPoint: (coords: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onAddPoint([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

function FitBoundsController({ geoJSON }: { geoJSON: any }) {
  const map = useMap();
  const prevRef = useRef<any>(null);
  useEffect(() => {
    if (!geoJSON || geoJSON === prevRef.current) return;
    prevRef.current = geoJSON;
    if (geoJSON.type === 'LineString' && geoJSON.coordinates?.length > 0) {
      const latLngs = geoJSON.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
      const bounds = L.latLngBounds(latLngs);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [geoJSON, map]);
  return null;
}

const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
};

interface MapComponentProps {
  points: [number, number][];
  waypoints: Waypoint[];
  onAddPoint: (coords: [number, number]) => void;
  routeGeoJSON: any;
  routeGeoJSONSequential: any;
  fitBoundsGeoJSON: any;
  onRemovePoint: (index: number) => void;
  tspOrder: number[] | null;
  mapStyle: 'dark' | 'satellite' | 'street';
}

export default function MapComponent({
  points,
  waypoints,
  onAddPoint,
  routeGeoJSON,
  routeGeoJSONSequential,
  fitBoundsGeoJSON,
  onRemovePoint,
  tspOrder,
  mapStyle,
}: MapComponentProps) {
  const geoToLatLngs = useCallback((geoJSON: any): [number, number][] => {
    if (!geoJSON || geoJSON.type !== 'LineString') return [];
    return geoJSON.coordinates.map((c: number[]) => [c[1], c[0]]);
  }, []);

  const getDisplayIndex = (pointIndex: number): number => {
    if (!tspOrder) return pointIndex;
    const pos = tspOrder.indexOf(pointIndex);
    return pos >= 0 ? pos : pointIndex;
  };

  const tile = TILE_LAYERS[mapStyle] ?? TILE_LAYERS.dark;

  return (
    <MapContainer center={[12.9716, 77.5946]} zoom={12} className="w-full h-full" zoomControl={false}>
      <TileLayer attribution={tile.attribution} url={tile.url} />

      {/* Custom zoom control position */}
      <ZoomControl />

      <ClickHandler onAddPoint={onAddPoint} />
      <FitBoundsController geoJSON={fitBoundsGeoJSON} />

      {points.map((p, i) => {
        const displayIndex = getDisplayIndex(i);
        const icon = createNumberedIcon(displayIndex, !!tspOrder);
        const wp = waypoints[i];
        return (
          <Marker
            key={`marker-${i}-${p[0]}-${p[1]}`}
            position={[p[1], p[0]]}
            icon={icon}
            eventHandlers={{
              click: (e) => {
                const popup = L.popup({ closeButton: false, className: 'custom-popup' })
                  .setLatLng(e.latlng)
                  .setContent(`
                    <div style="font-family:Inter,system-ui,sans-serif;min-width:180px;">
                      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <div style="
                          width:28px;height:28px;border-radius:50%;
                          background:${MARKER_COLORS[displayIndex % MARKER_COLORS.length]};
                          display:flex;align-items:center;justify-content:center;
                          font-size:12px;font-weight:700;color:white;flex-shrink:0;
                        ">${displayIndex + 1}</div>
                        <div>
                          <div style="font-weight:600;font-size:14px;color:#f1f5f9;">${wp?.label || `Stop ${i + 1}`}</div>
                          ${wp?.eta ? `<div style="font-size:11px;color:#94a3b8;">ETA: ${wp.eta}</div>` : ''}
                        </div>
                      </div>
                      ${wp?.note ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px;padding:6px 8px;background:rgba(255,255,255,0.05);border-radius:6px;">"${wp.note}"</div>` : ''}
                      <div style="font-size:11px;color:#475569;margin-bottom:10px;">${p[1].toFixed(5)}, ${p[0].toFixed(5)}</div>
                      <button onclick="window.__removePoint(${i})" style="
                        width:100%;padding:6px 10px;
                        background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);
                        color:#fca5a5;border-radius:8px;cursor:pointer;
                        font-size:12px;font-weight:600;font-family:Inter,system-ui,sans-serif;
                        transition:all 0.2s;
                      " onmouseover="this.style.background='rgba(239,68,68,0.35)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                        ✕ Remove Stop
                      </button>
                    </div>
                  `)
                  .openOn(e.target._map);

                (window as any).__removePoint = (idx: number) => {
                  popup.remove();
                  onRemovePoint(idx);
                };
              },
            }}
          />
        );
      })}

      {/* Optimized route */}
      {routeGeoJSON && (
        <Polyline
          positions={geoToLatLngs(routeGeoJSON)}
          pathOptions={{ color: '#f97316', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
        />
      )}

      {/* Sequential comparison route */}
      {routeGeoJSONSequential && (
        <Polyline
          positions={geoToLatLngs(routeGeoJSONSequential)}
          pathOptions={{ color: '#60a5fa', weight: 4, opacity: 0.65, dashArray: '10, 8' }}
        />
      )}
    </MapContainer>
  );
}

// Custom zoom control (bottom right)
function ZoomControl() {
  const map = useMap();
  return (
    <div className="leaflet-bottom leaflet-right" style={{ zIndex: 1000, margin: '16px' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '2px',
        background: 'rgba(10,12,28,0.85)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px', overflow: 'hidden', backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {[{ label: '+', action: () => map.zoomIn() }, { label: '−', action: () => map.zoomOut() }].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={{
              width: '36px', height: '36px', background: 'transparent',
              border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '18px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
