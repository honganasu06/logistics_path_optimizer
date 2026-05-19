# Addendum: New Features Implemented

*This section supplements the original project report with descriptions of additional features that were implemented after the initial document was authored.*

---

## Feature 1: Multi-Vehicle Fleet Optimization (Vehicle Routing Problem — VRP)

### Motivation and DAA Context

The original project solved the **Traveling Salesman Problem (TSP)** using a Greedy Nearest Neighbor heuristic to optimize the route for a single delivery vehicle. However, real-world logistics operations almost always involve a **fleet** of multiple vehicles. The Vehicle Routing Problem (VRP) is a generalization of the TSP and is classified as NP-Hard, making it one of the most studied combinatorial optimization problems in operations research and algorithm design.

### Implementation

The system now supports **1 to 3 simultaneous delivery vehicles**. The user selects the fleet size from a dedicated "Fleet" selector in the UI. When multiple vehicles are selected, the backend applies the following two-stage algorithm:

**Stage 1 — K-Means Geographic Clustering:**
The delivery stops (excluding the depot/origin) are partitioned into *k* geographic clusters, where *k* equals the fleet size. We implemented a custom **K-Means clustering algorithm** from scratch using Euclidean distance on geographic coordinates. The algorithm iteratively:
1. Assigns each stop to the nearest centroid.
2. Recalculates centroids as the mean position of all assigned stops.
3. Repeats until convergence (no assignment changes) or a maximum of 100 iterations.

This ensures that each vehicle is assigned a geographically coherent set of deliveries, minimizing cross-city back-tracking.

**Stage 2 — Per-Cluster TSP Optimization:**
After clustering, the Greedy Nearest Neighbor TSP algorithm is run independently for each cluster. Each vehicle starts from the shared depot (Stop 1) and visits its assigned stops in the optimal greedy order.

### Algorithmic Complexity

| Phase | Algorithm | Time Complexity |
| --- | --- | --- |
| Clustering | K-Means (k iterations, n points, k clusters) | O(n × k × iterations) |
| Per-Cluster TSP | Greedy Nearest Neighbor | O(n²/k) per cluster |
| Total | Combined | O(n × k × I + n²) |

### Visual Output

The map renders each vehicle's route in a distinct color (Orange, Blue, Pink), clearly demonstrating the division of labor. The total fleet distance and duration are aggregated and displayed.

---

## Feature 2: Weather-Aware Routing and Dynamic ETA Adjustment

### Motivation and DAA Context

Classical shortest path algorithms treat edge weights as static values. However, in real-world logistics, travel time is a **dynamic variable** influenced by external conditions. Weather is one of the most significant factors affecting road safety and vehicle speed. This feature introduces **dynamic edge-weight modification** — a concept central to time-dependent shortest path problems in DAA literature.

### Implementation

**Real-Time Weather Data Fetching:**
When the user adds a delivery stop (waypoint) to the map, the frontend asynchronously calls the **Open-Meteo API** (`https://api.open-meteo.com/v1/forecast`) — a free, no-authentication-required weather service. The API returns:
- `temperature`: Current temperature in °C at the waypoint's coordinates.
- `weathercode`: A WMO (World Meteorological Organization) standard code indicating the current weather condition.

**Weather Code Interpretation:**
The system maps WMO weather codes to human-readable emoji icons:

| WMO Code Range | Condition | Icon |
| --- | --- | --- |
| 0 | Clear sky | ☀️ |
| 1–3 | Partly cloudy | ⛅ |
| 45–48 | Fog | 🌫️ |
| 51–67 | Drizzle / Rain | 🌧️ |
| 71–77 | Snowfall | ❄️ |
| 80–82 | Rain showers | 🌦️ |
| 95–99 | Thunderstorm | ⛈️ |

**Dynamic ETA Penalty:**
When ETAs are calculated, the system inspects the weather condition at each destination stop. If adverse weather is detected (rain, snow, or thunderstorms — WMO codes 51–67, 71–77, 95–99), the estimated travel duration for that leg is **increased by 30%** to simulate reduced driving speeds and caution-related delays.

This is mathematically expressed as:

```
ETA_adjusted(i) = ETA_base(i) × penalty_factor(weather_code)
```

Where `penalty_factor = 1.3` for adverse weather, and `1.0` for clear/cloudy conditions.

### Visual Output

Each stop in the sidebar displays:
- A weather emoji icon (e.g., ☀️, 🌧️, ❄️)
- The live temperature in °C
- Adjusted ETAs reflecting weather-based delays

---

## Feature 3: Interactive Algorithm Visualization Lab (Enhanced)

### Motivation and DAA Context

The Algorithm Lab tab provides a **side-by-side visual comparison** of Dijkstra's algorithm and A* Search on a 10×10 grid, directly demonstrating the core DAA concepts of uninformed vs. informed search.

### Enhancements Implemented

**Random Obstacle Generation:**
A "Random Obstacles" button (🎲) was added to instantly populate the grid with 15 randomly placed obstacles, excluding the Start and End positions. This allows for rapid, repeatable demonstrations of how obstacle density affects:
- The number of nodes explored by each algorithm
- The divergence in performance between Dijkstra (explores uniformly) and A* (explores toward the goal)
- Edge cases where no path exists

Each click of the button **resets the grid completely** before generating fresh obstacles, ensuring clean and reproducible experiments.

### Algorithmic Insights Demonstrated

| Metric | Dijkstra | A* (Euclidean Heuristic) |
| --- | --- | --- |
| Search Pattern | Circular wavefront (BFS-like) | Directed ellipse toward goal |
| Nodes Explored | High (explores all reachable) | Low (guided by heuristic) |
| Path Optimality | Guaranteed | Guaranteed (admissible h) |
| Time Complexity | O(V log V) | O(V log V) worst case |

The visual comparison clearly shows that A* explores significantly fewer nodes (often 40–60% fewer), validating the theoretical advantage of informed search.

---

## Feature 4: One-Click Startup Script

### Motivation

For presentation reliability, a `start_project.bat` script was created that automates the entire startup sequence:

1. Kills any existing Node.js processes and Docker containers
2. Launches the OSRM Docker routing engine
3. Starts the Backend API server
4. Starts the Frontend React application
5. Automatically opens the browser to the application URL

This ensures a clean, reproducible startup during live demonstrations.

---

## Updated Technology Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Routing Engine | OSRM (Docker, v5.26.0) | Offline pathfinding with MLD algorithm |
| Backend API | Node.js / Express / TypeScript | TSP, VRP, K-Means clustering |
| Frontend UI | React / Vite / Tailwind CSS | Interactive map, controls, algorithm lab |
| Map Library | Leaflet.js | Interactive map rendering |
| Weather API | Open-Meteo (free, no-key) | Live weather data per waypoint |
| Metrics | Prometheus client | Request latency, throughput monitoring |
| Containerization | Docker Desktop | OSRM engine isolation |

---

## Updated Feature Summary

| # | Feature | DAA Concept | Status |
| --- | --- | --- | --- |
| F1 | Leaflet Map with numbered markers | Graph visualization | ✅ Original |
| F2 | TSP Auto-Optimize (Greedy NN) | Greedy algorithm, NP-Hard approximation | ✅ Original |
| F3 | Compare Mode (Sequential vs TSP) | Algorithm comparison | ✅ Original |
| F4 | Multi-Vehicle Profile (Car/Bike/Walk) | Weighted graph edge modification | ✅ Original |
| F5 | Turn-by-Turn Directions | Graph traversal output | ✅ Original |
| F6 | GPX Export | Data serialization | ✅ Original |
| F7 | Dijkstra vs A* Algorithm Lab | Uninformed vs Informed search | ✅ Original |
| F8 | Prometheus Metrics | Empirical complexity analysis | ✅ Original |
| F9 | **Multi-Vehicle Fleet (VRP)** | **K-Means Clustering + per-cluster TSP** | ✅ **New** |
| F10 | **Weather-Aware Routing** | **Dynamic edge-weight modification** | ✅ **New** |
| F11 | **Random Obstacle Generation** | **Search space complexity analysis** | ✅ **New** |
| F12 | **One-Click Startup Script** | **Operational automation** | ✅ **New** |
