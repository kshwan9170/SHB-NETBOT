#!/bin/bash
# Replit 배포를 위한 시작 스크립트
# 환경 변수 PORT를 사용하여 Streamlit 앱 실행
# PORT가 설정되어 있지 않으면 기본값 5000을 사용
export PORT="${PORT:-5000}"
echo "Starting Streamlit app on port $PORT"
# 스크립트에 실행 권한 부여
chmod +x "$0"
# 디버깅 정보 추가
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"
echo "Environment variables: PORT=$PORT"
streamlit run streamlit_app.py --server.port=$PORT --server.address=0.0.0.0 --server.headless=true
