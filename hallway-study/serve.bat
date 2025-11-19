@echo off

rem Simple HTTP server for the hallway planner
set PORT=8000

echo Starting HTTP server on port %PORT%...
echo Open your browser to: http://localhost:%PORT%
echo Press Ctrl+C to stop the server
echo.

rem Use Python's built-in HTTP server
python -m http.server %PORT%