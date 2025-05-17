#!/bin/bash
export PORT="${PORT:-5000}"
echo "Starting Flask app on port $PORT"
python app.py