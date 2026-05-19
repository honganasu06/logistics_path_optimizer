import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Navigation, Plus, Loader2, X } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
}

interface LocationInputProps {
  placeholder: string;
  icon: React.ReactNode;
  accentColor: string;
  onSelect: (coords: [number, number], displayName: string) => void;
}

function LocationInput({ placeholder, icon, accentColor, onSelect }: LocationInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=0`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
      setHighlightIdx(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 450);
  };

  const handleSelect = (result: NominatimResult) => {
    const coords: [number, number] = [parseFloat(result.lon), parseFloat(result.lat)];
    const short = result.display_name.split(',').slice(0, 2).join(',').trim();
    setQuery(short);
    setOpen(false);
    setResults([]);
    onSelect(coords, short);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: open ? accentColor : 'rgba(255,255,255,0.1)',
          boxShadow: open ? `0 0 0 2px ${accentColor}28` : 'none',
        }}
      >
        <span className="shrink-0" style={{ color: accentColor }}>{icon}</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/25 min-w-0"
        />
        {loading && <Loader2 size={14} className="animate-spin text-white/35 shrink-0" />}
        {query && !loading && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="text-white/25 hover:text-white/60 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-[9999] rounded-xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: 'rgba(8,10,24,0.97)', backdropFilter: 'blur(24px)' }}
        >
          {results.map((r, i) => (
            <button
              key={r.place_id}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-white/5 last:border-b-0 transition-colors ${
                highlightIdx === i ? 'bg-white/10' : 'hover:bg-white/6'
              }`}
            >
              <MapPin size={13} className="shrink-0 mt-0.5" style={{ color: accentColor }} />
              <div className="min-w-0">
                <div className="text-sm text-white/90 font-medium truncate">{r.display_name.split(',')[0]}</div>
                <div className="text-[11px] text-white/35 truncate">{r.display_name.split(',').slice(1, 3).join(',').trim()}</div>
              </div>
              <div className="shrink-0 text-[9px] text-white/20 mt-0.5 ml-auto capitalize">{r.type}</div>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[9px] text-white/15 text-right">© OpenStreetMap Nominatim</div>
        </div>
      )}
    </div>
  );
}

interface SmartSearchProps {
  setPoints: (updater: ((prev: [number, number][]) => [number, number][]) | [number, number][]) => void;
}

export default function SmartSearch({ setPoints }: SmartSearchProps) {
  const handleStartSelect = (coords: [number, number]) => {
    setPoints(prev => {
      if (prev.length === 0) return [coords];
      return [coords, ...prev.slice(1)];
    });
  };

  const handleStopSelect = (coords: [number, number]) => {
    setPoints(prev => [...prev, coords]);
  };

  return (
    <div className="flex flex-col gap-2">
      <LocationInput
        placeholder="Search start location…"
        icon={<Navigation size={14} />}
        accentColor="#22c55e"
        onSelect={handleStartSelect}
      />
      <LocationInput
        placeholder="Search & add a stop…"
        icon={<Plus size={14} />}
        accentColor="#f97316"
        onSelect={handleStopSelect}
      />
    </div>
  );
}
