#!/bin/bash

# Simple HTTP server for the hallway planner
PORT=8000

echo "Starting HTTP server on port $PORT..."
echo "Open your browser to: http://localhost:$PORT"
echo "Press Ctrl+C to stop the server"
echo ""

# Use Python's built-in HTTP server
python3 -m http.server $PORT
