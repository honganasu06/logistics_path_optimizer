import { useState } from 'react';
import type { Waypoint, RouteStats } from '../App';
import RoutePanel from './RoutePanel';
import DeliveryPanel from './DeliveryPanel';
import DAASimulation from './DAASimulation';

interface SidebarProps {
  waypoints: Waypoint[];
  setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  onRemovePoint: (index: number) => void;
  onUpdateWaypoint: (index: number, updates: Partial<Waypoint>) => void;
  onRouteResult: (geo: any, stats: RouteStats, seqGeo?: any, order?: number[]) => void;
  onClear: () => void;
  routeStats: RouteStats | null;
  osrmStatus: 'checking' | 'online' | 'offline';
  onClose: () => void;
}

type TabId = 'route' | 'delivery' | 'daa';

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: 'route',    label: 'Route Planner', emoji: '🗺️' },
  { id: 'delivery', label: 'Deliveries',    emoji: '📦' },
  { id: 'daa',      label: 'Algorithm Lab', emoji: '⚡' },
];

export default function Sidebar({
  waypoints, setWaypoints, onRemovePoint, onUpdateWaypoint,
  onRouteResult, onClear, routeStats, osrmStatus, onClose,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('route');

  return (
    <div className="sidebar animate-slide-in" style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '18px 20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f97316, #ec4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
              boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
            }}>🚚</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>
                LogiRoute
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                Smart delivery optimizer
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Collapse sidebar"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)', borderRadius: 8, width: 30, height: 30,
              cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 4px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? '2px solid #f97316'
                  : '2px solid transparent',
                color: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 16 }}>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'route' && (
          <RoutePanel
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            onRemovePoint={onRemovePoint}
            onUpdateWaypoint={onUpdateWaypoint}
            onRouteResult={onRouteResult}
            onClear={onClear}
            routeStats={routeStats}
            osrmStatus={osrmStatus}
          />
        )}
        {activeTab === 'delivery' && (
          <DeliveryPanel
            waypoints={waypoints}
            onUpdateWaypoint={onUpdateWaypoint}
            routeStats={routeStats}
          />
        )}
        {activeTab === 'daa' && (
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16, lineHeight: 1.6 }}>
              Compare Dijkstra vs A* pathfinding on a 10×10 grid. Click/drag to draw obstacles, then run both simultaneously.
            </p>
            <DAASimulation />
          </div>
        )}
      </div>
    </div>
  );
}
