# Intelligent Logistics Path Optimization System

An offline map-based Logistics Routing System utilizing OSRM, a custom Node.js/Express middleware, and a modern React UI.

## Architecture & Component Interaction

```text
Frontend (React/Vite/Tailwind, port 5173)
    └─→ Backend Middleware (Node.js/Express, port 3001)
            └─→ OSRM Engine (Docker, port 5000)
```

1. **OSRM Engine (localhost:5000):** Dockerized Open Source Routing Machine running Southern Zone map data.
2. **Backend Middleware (Node.js/Express):** Orchestrates routing requests, runs TSP Greedy Nearest Neighbor, exposes Prometheus metrics.
3. **Frontend (React/Vite):** Interactive Leaflet map with waypoint placing, numbered markers, route comparison, DAA simulation.

## Features

- 🗺️ **Leaflet Map** with numbered, color-coded waypoint markers
- 🔢 **TSP Auto-Optimize** — Greedy Nearest Neighbor with distance savings % and CO₂ estimate
- 🔁 **Compare Mode** — view sequential vs TSP routes simultaneously (red=optimized, blue=sequential)
- 🚗 **Vehicle Profile** selector (Car / Bicycle / Walking)
- 📋 **Turn-by-Turn Directions** — collapsible OSRM step-by-step panel
- 📥 **Export GPX** — download computed route for GPS devices
- 🧩 **DAA Simulation** — side-by-side Dijkstra vs A*, with obstacle drawing & node-count stats
- 📊 **Prometheus Metrics** at `http://localhost:3001/metrics`

## Project Structure

```text
logistics_path_optimizer/
├── SETUP.md                 # ⬅ How to start Docker, Backend & Frontend
├── README.md                # This file
├── backend/
│   ├── server.ts            # Express API server
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main application
│   │   ├── components/
│   │   │   ├── MapComponent.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   └── DAASimulation.tsx
│   │   └── index.css
│   ├── public/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── maps/                     # OSRM map data (mounted into Docker)
│   ├── southern-zone.osm.pbf
│   └── southern-zone.osrm.*
└── docs/                     # Project documentation
    ├── Blueprint.docx
    └── Intelligent Logistics Path Optimization Project.docx
```

## Quick Start

👉 See **[SETUP.md](./SETUP.md)** for detailed startup instructions.

**TL;DR** — open 3 terminals:

```bash
# Terminal 1 — OSRM Engine
docker run -t -i -p 5000:5000 -v "%cd%\maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm

# Terminal 2 — Backend
cd backend && npm install && npm start

# Terminal 3 — Frontend
cd frontend && npm install && npm run dev
```

Then open **<http://localhost:5173>** 🎉

## DAA Simulation Usage

1. **Draw obstacles** — click or drag on grid cells to toggle walls
2. **Run Both** — executes Dijkstra and A* simultaneously, side by side
3. **View stats** — nodes explored, path length, and time for each algorithm
4. **Reset** — clear paths (keeping obstacles) or full reset

## API Reference

| Method | Endpoint                             | Description                        |
| ------ | ------------------------------------ | ---------------------------------- |
| `GET` | `/api/health` | OSRM online/offline status |
| `GET` | `/api/nearest?lon=&lat=` | Snap coordinate to nearest road node |
| `GET` | `/api/route?coordinates=&profile=` | Get route with steps |
| `GET` | `/api/table?coordinates=` | Get N×N distance matrix |
| `POST` | `/api/optimize` | TSP + comparison route |
| `POST` | `/api/export/gpx` | Export route as GPX file |
| `GET` | `/metrics` | Prometheus metrics |
