#!/bin/bash
# Replit 배포를 위한 시작 스크립트
# 환경 변수 PORT를 사용하여 Flask 앱 실행
# PORT가 설정되어 있지 않으면 기본값 8080을 사용
export PORT="${PORT:-8080}"
echo "Starting Flask app on port $PORT"
python app.py
