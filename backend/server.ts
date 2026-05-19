import express from 'express';
import cors from 'cors';
import axios from 'axios';
import client from 'prom-client';

const app = express();
app.use(cors());
app.use(express.json());

const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';

// ──────────────────────────────────────────────
// Prometheus Metrics Setup (Feature F11)
// ──────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

const tspComputeTime = new client.Gauge({
  name: 'tsp_computation_time_ms',
  help: 'Time taken to compute TSP Greedy Nearest Neighbor solution in ms',
});

const requestsCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(tspComputeTime);
register.registerMetric(requestsCounter);

// ──────────────────────────────────────────────
// Logging & Metrics Middleware
// ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.originalUrl.split('?')[0];
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    httpRequestDuration.labels(req.method, route, String(res.statusCode)).observe(duration);
    requestsCounter.labels(req.method, route).inc();
  });
  next();
});

// ──────────────────────────────────────────────
// Prometheus /metrics endpoint
// ──────────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ──────────────────────────────────────────────
// OSRM Health-Check helper
// ──────────────────────────────────────────────
async function checkOSRM(): Promise<boolean> {
  try {
    await axios.get(`${OSRM_URL}/nearest/v1/driving/77.5946,12.9716`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// Wrap /nearest
// ──────────────────────────────────────────────
app.get('/api/nearest', async (req, res) => {
  try {
    const { lon, lat } = req.query;
    if (!lon || !lat) return res.status(400).json({ error: 'Missing lon/lat' });

    const response = await axios.get(`${OSRM_URL}/nearest/v1/driving/${lon},${lat}`);
    res.json(response.data);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(503).json({ error: 'OSRM_OFFLINE', message: 'OSRM routing engine is not running. Please start Docker with the OSRM container.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Wrap /route  (supports vehicle profile via ?profile=driving|cycling|foot)
// ──────────────────────────────────────────────
app.get('/api/route', async (req, res) => {
  try {
    const { coordinates, profile = 'driving' } = req.query as Record<string, string>;
    if (!coordinates) return res.status(400).json({ error: 'Missing coordinates' });

    const response = await axios.get(
      `${OSRM_URL}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&steps=true`
    );
    res.json(response.data);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(503).json({ error: 'OSRM_OFFLINE', message: 'OSRM routing engine is not running. Please start Docker with the OSRM container.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Wrap /table
// ──────────────────────────────────────────────
app.get('/api/table', async (req, res) => {
  try {
    const { coordinates, profile = 'driving' } = req.query as Record<string, string>;
    if (!coordinates) return res.status(400).json({ error: 'Missing coordinates' });

    const response = await axios.get(`${OSRM_URL}/table/v1/${profile}/${coordinates}`);
    res.json(response.data);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(503).json({ error: 'OSRM_OFFLINE', message: 'OSRM routing engine is not running.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// TSP & VRP Optimizer
// ──────────────────────────────────────────────
function kMeans(points: number[][], k: number, maxIter = 100) {
  if (points.length <= k) return points.map((_, i) => i);
  let centroids = points.slice(0, k).map(p => [...p]);
  let assignments = new Array(points.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let j = 0; j < k; j++) {
        const d = Math.pow(points[i][0] - centroids[j][0], 2) + Math.pow(points[i][1] - centroids[j][1], 2);
        if (d < minDist) { minDist = d; cluster = j; }
      }
      if (assignments[i] !== cluster) { assignments[i] = cluster; changed = true; }
    }
    if (!changed) break;
    let sums = Array.from({length: k}, () => [0, 0]);
    let counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      sums[assignments[i]][0] += points[i][0];
      sums[assignments[i]][1] += points[i][1];
      counts[assignments[i]]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) centroids[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j]];
    }
  }
  return assignments;
}

app.post('/api/optimize', async (req, res) => {
  try {
    const { coordinates, profile = 'driving', vehicles = 1 } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ error: 'Invalid coordinates array' });
    }

    const n = coordinates.length;
    const coordString = coordinates.map((c: number[]) => `${c[0]},${c[1]}`).join(';');
    const tableRes = await axios.get(`${OSRM_URL}/table/v1/${profile}/${coordString}`);
    if (tableRes.data.code !== 'Ok') return res.status(400).json({ error: 'Failed to fetch OSRM table' });
    const durations = tableRes.data.durations as number[][] | undefined;
    if (!durations) return res.status(400).json({ error: 'No durations returned from OSRM' });

    const tspStart = Date.now();
    let multiRoutes = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let globalOrder = [0];

    const vCount = Math.min(vehicles, n - 1);
    
    // Clustering for VRP
    let clusters: number[][] = Array.from({ length: vCount }, () => [0]); // start with depot
    if (vCount > 1) {
      const stops = coordinates.slice(1);
      const assignments = kMeans(stops, vCount);
      for (let i = 0; i < stops.length; i++) {
        clusters[assignments[i]].push(i + 1); // +1 because 0 is depot
      }
    } else {
      clusters[0] = Array.from({ length: n }, (_, i) => i);
    }

    const colors = ['#f97316', '#3b82f6', '#ec4899', '#a855f7', '#22c55e'];

    for (let v = 0; v < vCount; v++) {
      const clusterIndices = clusters[v];
      if (clusterIndices.length <= 1) continue;

      let visited = new Set([clusterIndices[0]]);
      let current = clusterIndices[0];
      let order = [clusterIndices[0]];

      while (visited.size < clusterIndices.length) {
        let nearest = -1;
        let minDistance = Infinity;
        for (let i of clusterIndices) {
          const d = durations[current]?.[i];
          if (!visited.has(i) && d !== undefined && d < minDistance) {
            minDistance = d;
            nearest = i;
          }
        }
        visited.add(nearest);
        order.push(nearest);
        if (nearest !== 0) globalOrder.push(nearest); // keep track of global ordering
        current = nearest;
      }

      const orderedCoordString = order.map((i: number) => `${coordinates[i][0]},${coordinates[i][1]}`).join(';');
      const optimizedRouteRes = await axios.get(
        `${OSRM_URL}/route/v1/${profile}/${orderedCoordString}?overview=full&geometries=geojson&steps=true`
      );

      const routeDist = optimizedRouteRes.data.routes?.[0]?.distance || 0;
      const routeDur = optimizedRouteRes.data.routes?.[0]?.duration || 0;
      totalDistance += routeDist;
      totalDuration += routeDur;

      multiRoutes.push({
        vehicleIndex: v,
        color: colors[v % colors.length],
        order,
        route: optimizedRouteRes.data
      });
    }

    const tspDuration = Date.now() - tspStart;
    tspComputeTime.set(tspDuration);

    if (vehicles > 1) {
      return res.json({
        routes: multiRoutes,
        totalDistance,
        totalDuration,
        order: globalOrder,
        tspComputeMs: tspDuration
      });
    }

    // Single vehicle response (Original format)
    const sequentialRouteRes = await axios.get(
      `${OSRM_URL}/route/v1/${profile}/${coordString}?overview=full&geometries=geojson&steps=true`
    );
    const sequentialDistance = sequentialRouteRes.data.routes?.[0]?.distance || 0;

    res.json({
      order: multiRoutes[0].order,
      orderedCoordinates: multiRoutes[0].order.map(i => coordinates[i]),
      route: multiRoutes[0].route,
      sequentialRoute: sequentialRouteRes.data,
      sequentialDistance,
      optimizedDistance: totalDistance,
      savingsPercent: sequentialDistance > 0 ? Math.round(((sequentialDistance - totalDistance) / sequentialDistance) * 100) : 0,
      tspComputeMs: tspDuration,
    });
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(503).json({ error: 'OSRM_OFFLINE', message: 'OSRM routing engine is not running. Please start Docker with the OSRM container.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Export Route as GPX (Feature F14)
// ──────────────────────────────────────────────
app.post('/api/export/gpx', async (req, res) => {
  try {
    const { coordinates, profile = 'driving', name = 'Route' } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ error: 'Invalid coordinates array' });
    }

    const coordString = coordinates.map((c: number[]) => `${c[0]},${c[1]}`).join(';');
    const routeRes = await axios.get(
      `${OSRM_URL}/route/v1/${profile}/${coordString}?overview=full&geometries=geojson`
    );

    const geo = routeRes.data.routes?.[0]?.geometry;
    if (!geo || geo.type !== 'LineString') {
      return res.status(500).json({ error: 'Could not get route geometry' });
    }

    const trkpts = (geo.coordinates as number[][])
      .map(([lng, lat]: number[]) => `    <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
      .join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Logistics Optimizer" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    res.set('Content-Type', 'application/gpx+xml');
    res.set('Content-Disposition', `attachment; filename="${name.replace(/\s+/g, '_')}.gpx"`);
    res.send(gpx);
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(503).json({ error: 'OSRM_OFFLINE', message: 'OSRM routing engine is not running.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// Health check for frontend
// ──────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const osrmOnline = await checkOSRM();
  res.json({ status: 'ok', osrm: osrmOnline ? 'online' : 'offline' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  console.log(`Prometheus metrics available at http://localhost:${PORT}/metrics`);
});
