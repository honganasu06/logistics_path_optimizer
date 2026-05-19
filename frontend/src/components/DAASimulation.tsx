import { useState, useRef, useCallback } from 'react';
import { Play, RotateCcw, ZapOff, Zap, Dices } from 'lucide-react';
import clsx from 'clsx';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const GRID_SIZE = 10;
const START = { r: 0, c: 0 };
const END = { r: 9, c: 9 };

// Cell values: 0=empty, 1=obstacle, 2=visited, 3=path
type CellValue = 0 | 1 | 2 | 3;
type GridState = CellValue[][];

interface AlgoStats {
  nodesExplored: number;
  pathLength: number;
  elapsedMs: number;
  done: boolean;
}

const emptyGrid = (): GridState =>
  Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0) as CellValue[]);

// ──────────────────────────────────────────────────────────────────────────────
// Single grid cell display
// ──────────────────────────────────────────────────────────────────────────────
interface GridCellProps {
  value: CellValue;
  r: number;
  c: number;
  isStart: boolean;
  isEnd: boolean;
  onToggleObstacle: (r: number, c: number) => void;
  isRunning: boolean;
}

function GridCell({ value, r, c, isStart, isEnd, onToggleObstacle, isRunning }: GridCellProps) {
  return (
    <div
      onMouseDown={() => !isRunning && !isStart && !isEnd && onToggleObstacle(r, c)}
      onMouseEnter={(e) => !isRunning && !isStart && !isEnd && (e.buttons === 1) && onToggleObstacle(r, c)}
      className={clsx(
        'w-[22px] h-[22px] rounded-[3px] transition-all duration-200 cursor-pointer select-none',
        {
          'bg-white/5 hover:bg-white/15': value === 0 && !isStart && !isEnd,
          'bg-slate-700 shadow-inner': value === 1 && !isStart && !isEnd,
          'bg-amber-400/80 scale-[1.05]': value === 2 && !isStart && !isEnd,
          'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]': value === 3 && !isStart && !isEnd,
          'bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)]': isStart,
          'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]': isEnd,
        }
      )}
      title={isStart ? 'Start' : isEnd ? 'End' : value === 1 ? 'Obstacle (click to remove)' : 'Click to add obstacle'}
    >
      {isStart && <span className="flex h-full items-center justify-center text-[9px] font-bold text-white">S</span>}
      {isEnd && <span className="flex h-full items-center justify-center text-[9px] font-bold text-white">E</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Stats bar below each grid
// ──────────────────────────────────────────────────────────────────────────────
function StatsBar({ stats, label, color }: { stats: AlgoStats | null; label: string; color: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 border text-xs font-mono ${color}`}>
      <div className="font-semibold mb-0.5">{label}</div>
      {stats ? (
        <div className="text-white/70 space-y-0.5">
          <div>Nodes explored: <span className="text-white font-bold">{stats.nodesExplored}</span></div>
          <div>Path length: <span className="text-white font-bold">{stats.pathLength > 0 ? stats.pathLength : '–'}</span></div>
          <div>Time: <span className="text-white font-bold">{stats.elapsedMs}ms</span></div>
        </div>
      ) : (
        <div className="text-white/30 italic">Not run yet</div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pathfinding algorithms (pure computation — no async)
// ──────────────────────────────────────────────────────────────────────────────
function computePath(
  obstacles: boolean[][],
  type: 'dijkstra' | 'astar'
): { visitedOrder: { r: number; c: number }[]; pathKeys: Set<string>; nodesExplored: number } {
  const dist: Record<string, number> = {};
  const parent: Record<string, string> = {};
  const startKey = `${START.r},${START.c}`;
  const endKey = `${END.r},${END.c}`;
  dist[startKey] = 0;

  const queue: { r: number; c: number; cost: number; h: number }[] = [
    { r: START.r, c: START.c, cost: 0, h: 0 },
  ];

  const visitedOrder: { r: number; c: number }[] = [];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  while (queue.length > 0) {
    queue.sort((a, b) =>
      type === 'astar' ? (a.cost + a.h) - (b.cost + b.h) : a.cost - b.cost
    );
    const cur = queue.shift()!;
    const curKey = `${cur.r},${cur.c}`;
    visitedOrder.push({ r: cur.r, c: cur.c });

    if (cur.r === END.r && cur.c === END.c) break;

    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (obstacles[nr][nc]) continue;
      const nKey = `${nr},${nc}`;
      const newCost = dist[curKey] + 1;
      if (dist[nKey] === undefined || newCost < dist[nKey]) {
        dist[nKey] = newCost;
        parent[nKey] = curKey;
        const h = type === 'astar' ? Math.abs(nr - END.r) + Math.abs(nc - END.c) : 0;
        queue.push({ r: nr, c: nc, cost: newCost, h });
      }
    }
  }

  // Backtrack path
  const pathKeys = new Set<string>();
  let cur = endKey;
  while (cur && cur !== startKey) {
    pathKeys.add(cur);
    cur = parent[cur];
  }
  pathKeys.add(startKey);

  return { visitedOrder, pathKeys, nodesExplored: visitedOrder.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export default function DAASimulation() {
  // Shared obstacle grid — same obstacles for both algorithms
  const [obstacles, setObstacles] = useState<boolean[][]>(
    Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false))
  );

  // Per-algorithm grid display state
  const [dijkstraGrid, setDijkstraGrid] = useState<GridState>(emptyGrid());
  const [astarGrid, setAstarGrid] = useState<GridState>(emptyGrid());

  const [dijkstraStats, setDijkstraStats] = useState<AlgoStats | null>(null);
  const [astarStats, setAstarStats] = useState<AlgoStats | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelAll = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  };

  const delay = (ms: number) =>
    new Promise<void>(resolve => {
      const t = setTimeout(resolve, ms);
      timeouts.current.push(t);
    });

  // ── Obstacle toggling (Feature F6 / Issue #7) ───────────────────────────
  const toggleObstacle = useCallback((r: number, c: number) => {
    setObstacles(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = !next[r][c];
      return next;
    });
    // Clear grids when obstacles change
    setDijkstraGrid(emptyGrid());
    setAstarGrid(emptyGrid());
    setDijkstraStats(null);
    setAstarStats(null);
  }, []);

  const addRandomObstacles = () => {
    if (isRunning) return;
    cancelAll();
    setObstacles(() => {
      const next = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
      let added = 0;
      while (added < 15) {
        const r = Math.floor(Math.random() * GRID_SIZE);
        const c = Math.floor(Math.random() * GRID_SIZE);
        if (!next[r][c] && !(r === START.r && c === START.c) && !(r === END.r && c === END.c)) {
          next[r][c] = true;
          added++;
        }
      }
      return next;
    });
    setDijkstraGrid(emptyGrid());
    setAstarGrid(emptyGrid());
    setDijkstraStats(null);
    setAstarStats(null);
    setIsRunning(false);
  };

  // ── Grid reset ──────────────────────────────────────────────────────────
  const clearAll = () => {
    cancelAll();
    setObstacles(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false)));
    setDijkstraGrid(emptyGrid());
    setAstarGrid(emptyGrid());
    setDijkstraStats(null);
    setAstarStats(null);
    setIsRunning(false);
  };

  const clearPaths = () => {
    cancelAll();
    setDijkstraGrid(prev => {
      const next = prev.map((row, r) =>
        row.map((cell, c) => {
          if (obstacles[r][c]) return 1 as CellValue;
          if ((r === START.r && c === START.c) || (r === END.r && c === END.c)) return cell;
          return 0 as CellValue;
        })
      );
      return next;
    });
    setAstarGrid(prev => {
      const next = prev.map((row, r) =>
        row.map((cell, c) => {
          if (obstacles[r][c]) return 1 as CellValue;
          if ((r === START.r && c === START.c) || (r === END.r && c === END.c)) return cell;
          return 0 as CellValue;
        })
      );
      return next;
    });
    setDijkstraStats(null);
    setAstarStats(null);
    setIsRunning(false);
  };

  // ── Run both algorithms simultaneously (Feature F7 / Issue #6) ─────────
  const runBoth = async () => {
    if (isRunning) return;
    cancelAll();
    setIsRunning(true);

    // Initialize grids with obstacles
    const initGrid = (): GridState =>
      Array.from({ length: GRID_SIZE }, (_, r) =>
        Array.from({ length: GRID_SIZE }, (_, c) =>
          obstacles[r][c] ? (1 as CellValue) : (0 as CellValue)
        ) as CellValue[]
      );

    setDijkstraGrid(initGrid());
    setAstarGrid(initGrid());
    setDijkstraStats(null);
    setAstarStats(null);

    const t0 = Date.now();

    // Compute both synchronously first to get stats
    const dijResult = computePath(obstacles, 'dijkstra');
    const astarResult = computePath(obstacles, 'astar');

    const dijVisited = dijResult.visitedOrder;
    const astarVisited = astarResult.visitedOrder;
    const maxSteps = Math.max(dijVisited.length, astarVisited.length);

    const dijGrid = initGrid();
    const aGrid = initGrid();

    const STEP_MS = 25; // animation speed per frame

    // Animate both simultaneously frame by frame
    for (let i = 0; i < maxSteps; i++) {
      if (i < dijVisited.length) {
        const n = dijVisited[i];
        dijGrid[n.r][n.c] = 2;
        setDijkstraGrid(dijGrid.map(row => [...row]) as GridState);
        // Update running stats
        setDijkstraStats({
          nodesExplored: i + 1,
          pathLength: 0,
          elapsedMs: Date.now() - t0,
          done: false,
        });
      }
      if (i < astarVisited.length) {
        const n = astarVisited[i];
        aGrid[n.r][n.c] = 2;
        setAstarGrid(aGrid.map(row => [...row]) as GridState);
        setAstarStats({
          nodesExplored: i + 1,
          pathLength: 0,
          elapsedMs: Date.now() - t0,
          done: false,
        });
      }
      await delay(STEP_MS);
    }

    // Now animate paths
    const dijPath = Array.from(dijResult.pathKeys).filter(k => k !== `${START.r},${START.c}`);
    const aPath = Array.from(astarResult.pathKeys).filter(k => k !== `${START.r},${START.c}`);
    const pathSteps = Math.max(dijPath.length, aPath.length);

    for (let i = 0; i < pathSteps; i++) {
      if (i < dijPath.length) {
        const [r, c] = dijPath[i].split(',').map(Number);
        dijGrid[r][c] = 3;
        setDijkstraGrid(dijGrid.map(row => [...row]) as GridState);
      }
      if (i < aPath.length) {
        const [r, c] = aPath[i].split(',').map(Number);
        aGrid[r][c] = 3;
        setAstarGrid(aGrid.map(row => [...row]) as GridState);
      }
      await delay(40);
    }

    // Mark start cells as path color
    dijGrid[START.r][START.c] = 3;
    aGrid[START.r][START.c] = 3;
    setDijkstraGrid(dijGrid.map(row => [...row]) as GridState);
    setAstarGrid(aGrid.map(row => [...row]) as GridState);

    const totalMs = Date.now() - t0;

    // Final stats
    setDijkstraStats({
      nodesExplored: dijResult.nodesExplored,
      pathLength: dijResult.pathKeys.size,
      elapsedMs: totalMs,
      done: true,
    });
    setAstarStats({
      nodesExplored: astarResult.nodesExplored,
      pathLength: astarResult.pathKeys.size,
      elapsedMs: totalMs,
      done: true,
    });

    setIsRunning(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const renderGrid = (
    grid: GridState,
    onToggle: (r: number, c: number) => void,
    label: string
  ) => (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-xs font-semibold text-white/60">{label}</div>
      <div
        className="grid gap-[2px] bg-white/5 p-[3px] rounded-lg border border-white/10"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        onDragStart={e => e.preventDefault()}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <GridCell
              key={`${r}-${c}`}
              value={obstacles[r][c] ? 1 : cell}
              r={r}
              c={c}
              isStart={r === START.r && c === START.c}
              isEnd={r === END.r && c === END.c}
              onToggleObstacle={onToggle}
              isRunning={isRunning}
            />
          ))
        )}
      </div>
    </div>
  );

  const savings = dijkstraStats && astarStats && dijkstraStats.nodesExplored > 0
    ? Math.round(((dijkstraStats.nodesExplored - astarStats.nodesExplored) / dijkstraStats.nodesExplored) * 100)
    : null;

  return (
    <div className="flex flex-col gap-3 select-none">

      {/* Obstacle hint */}
      <div className="text-[11px] text-white/40 text-center">
        Click/drag grid cells to draw obstacles ✦ Pink = Start ✦ Purple = End
      </div>

      {/* Side-by-side grids (Feature F7) */}
      <div className="flex gap-3 justify-center">
        {renderGrid(dijkstraGrid, toggleObstacle, 'Dijkstra')}
        {renderGrid(astarGrid, toggleObstacle, 'A* (Heuristic)')}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          id="daa-run-both"
          onClick={runBoth}
          disabled={isRunning}
          className="flex-1 bg-gradient-to-r from-orange-500 to-blue-500 hover:from-orange-400 hover:to-blue-400 text-white border border-white/20 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
        >
          {isRunning
            ? <><Zap size={13} className="animate-pulse" /> Running...</>
            : <><Play size={13} /> Run Both Simultaneously</>
          }
        </button>
        <button
          onClick={addRandomObstacles}
          disabled={isRunning}
          className="bg-black/30 hover:bg-black/50 text-white border border-white/10 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          title="Add random obstacles"
        >
          <Dices size={13} />
        </button>
        <button
          id="daa-clear-paths"
          onClick={clearPaths}
          disabled={isRunning}
          className="bg-black/30 hover:bg-black/50 text-white border border-white/10 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          title="Clear paths (keep obstacles)"
        >
          <ZapOff size={13} />
        </button>
        <button
          id="daa-reset"
          onClick={clearAll}
          disabled={isRunning}
          className="bg-black/30 hover:bg-black/50 text-white border border-white/10 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          title="Reset everything"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {/* Stats panels side-by-side (Feature F5 / Issue #6) */}
      <div className="flex gap-2">
        <div className="flex-1">
          <StatsBar
            stats={dijkstraStats}
            label="Dijkstra"
            color="bg-amber-500/10 border-amber-500/25 text-amber-300"
          />
        </div>
        <div className="flex-1">
          <StatsBar
            stats={astarStats}
            label="A* (Heuristic)"
            color="bg-blue-500/10 border-blue-500/25 text-blue-300"
          />
        </div>
      </div>

      {/* Summary comparison */}
      {dijkstraStats?.done && astarStats?.done && (
        <div className="bg-gradient-to-r from-orange-500/10 to-blue-500/10 border border-white/10 rounded-xl px-4 py-3 text-center">
          {savings !== null && savings > 0 ? (
            <>
              <div className="text-white font-semibold text-sm">
                A* explored <span className="text-blue-400">{astarStats.nodesExplored}</span> nodes vs
                Dijkstra's <span className="text-amber-400">{dijkstraStats.nodesExplored}</span>
              </div>
              <div className="text-emerald-400 font-bold text-lg mt-0.5">
                {savings}% fewer nodes explored by A*
              </div>
              <div className="text-white/40 text-[11px] mt-0.5">
                Heuristic guidance dramatically reduces search space
              </div>
            </>
          ) : (
            <div className="text-white/60 text-xs">
              Both algorithms explored the same number of nodes (no obstacles to differentiate).
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-3 text-[10px] text-white/40 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white/10 inline-block" /> Empty</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" /> Obstacle</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400/80 inline-block" /> Explored</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Path</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-pink-500 inline-block" /> Start</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" /> End</span>
      </div>
    </div>
  );
}
