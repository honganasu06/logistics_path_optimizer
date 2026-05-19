# 🚀 Setup & Startup Guide

Step-by-step instructions to get the **Logistics Path Optimizer** running on your local machine.

---

## Prerequisites

| Tool               | Version | Download                                                      |
|--------------------|---------|---------------------------------------------------------------|
| **Node.js**        | ≥ 18.x  | [nodejs.org](https://nodejs.org/)                             |
| **npm**            | ≥ 9.x   | Bundled with Node.js                                          |
| **Docker Desktop** | Latest  | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Git**            | Any     | [git-scm.com](https://git-scm.com/)                           |

> [!IMPORTANT]
> Make sure **Docker Desktop is running** before starting the OSRM engine.

---

## Startup Order

The services must be started **in this order** because each layer depends on the one below it:

```text
1. OSRM Engine  (Docker — port 5000)   ← routing engine
2. Backend      (Node.js — port 3001)  ← API middleware
3. Frontend     (Vite — port 5173)     ← UI
```

---

## Step 1 — Start the OSRM Engine (Docker)

The OSRM map data files (`southern-zone.osrm.*`) live in the `maps/` directory.

### Windows (CMD)

```cmd
cd logistics_path_optimizer
docker run -t -i -p 5000:5000 -v "%cd%\maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm
```

### Windows (PowerShell)

```powershell
cd logistics_path_optimizer
docker run -t -i -p 5000:5000 -v "${PWD}\maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm
```

### Linux / macOS

```bash
cd logistics_path_optimizer
docker run -t -i -p 5000:5000 -v "$(pwd)/maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm
```

### ✅ Verify

Open in browser → [http://localhost:5000/nearest/v1/driving/78.9629,12.9716](http://localhost:5000/nearest/v1/driving/78.9629,12.9716)

You should get a JSON response with `"code":"Ok"`.

> [!NOTE]
> The first time you run the Docker command it will pull the OSRM image (~1 GB). Subsequent starts are instant.
>
> [!TIP]
> **Using Docker Desktop:** The long `docker run` command is only needed the **first time**. After running it once, the container is saved in your Docker Desktop app under the "Containers" tab. Next time, you can simply open Docker Desktop and click the **Start (Play)** button next to the OSRM container without opening a terminal!

---

## Step 2 — Start the Backend Server

```cmd
cd backend
npm install
npm start
```

The server starts on **port 3001**.

### ✅ Verify Backend

Open → [http://localhost:3001/api/health](http://localhost:3001/api/health)

You should see `{"status":"ok","osrm":"online"}`.

Prometheus metrics are available at → [http://localhost:3001/metrics](http://localhost:3001/metrics)

---

## Step 3 — Start the Frontend

```cmd
cd frontend
npm install
npm run dev
```

The UI starts on **port 5173**.

### ✅ Verify Frontend

Open → [http://localhost:5173](http://localhost:5173)

You should see the interactive Leaflet map with the control panel.

---

## Environment Variables

The frontend reads the backend URL from `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3001
```

If this file doesn't exist, copy the example:

```cmd
cd frontend
copy .env.example .env
```

---

## Quick-Start Cheat Sheet

Open **three separate terminals** and run:

| Terminal         | Commands                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — OSRM**    | `cd logistics_path_optimizer` → `docker run -t -i -p 5000:5000 -v "%cd%\maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm`     |
| **2 — Backend**  | `cd logistics_path_optimizer\backend` → `npm install` → `npm start`                                                                                            |
| **3 — Frontend** | `cd logistics_path_optimizer\frontend` → `npm install` → `npm run dev`                                                                                         |

Then open **<http://localhost:5173>** 🎉

---

## Troubleshooting

| Problem                                         | Fix                                                                         |
|-------------------------------------------------|-----------------------------------------------------------------------------|
| Docker command fails with "port already in use" | Run `docker ps` and stop any container using port 5000                      |
| Backend says OSRM is offline                    | Make sure the Docker container is running and healthy on port 5000          |
| Map tiles not loading                           | Check your internet connection — tiles are fetched from OpenStreetMap CDN   |
| Frontend shows network errors                   | Verify `VITE_BACKEND_URL` in `frontend/.env` matches the backend port       |
| `npm install` fails                             | Delete `node_modules` and `package-lock.json`, then run `npm install` again |

---

## Stopping the Services

| Service     | How to stop                                        |
|-------------|----------------------------------------------------|
| Frontend    | Press `Ctrl+C` in the terminal                     |
| Backend     | Press `Ctrl+C` in the terminal                     |
| OSRM Docker | Press `Ctrl+C` or run `docker stop <container_id>` |
