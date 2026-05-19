@echo off
echo ==============================================
echo   Starting Logistics Path Optimizer
echo ==============================================
echo.

echo 1. Stopping any existing containers and servers...
for /f "tokens=*" %%i in ('docker ps -q') do docker stop %%i >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo 2. Starting OSRM Routing Engine (Docker)...
start "OSRM Engine" cmd /k "docker run -t -i -p 5000:5000 -v "%cd%\maps:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone.osrm"

echo 3. Starting Backend API Server...
start "Backend API" cmd /k "cd backend && npm start"

echo 4. Starting Frontend React App...
start "Frontend UI" cmd /k "cd frontend && npm run dev"

echo.
echo All services have been launched in separate windows!
echo Waiting a few seconds for services to boot...
timeout /t 5 /nobreak >nul

echo Opening browser to http://localhost:5173...
start http://localhost:5173

echo Done! You can close this window.
