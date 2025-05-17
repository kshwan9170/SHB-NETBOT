#!/bin/bash
# Replit 배포를 위한 시작 스크립트
# PORT 환경 변수를 사용하여 Streamlit 앱 실행
export PORT="${PORT:-5000}"

# 디버깅 정보 표시
echo "Starting Streamlit app on port $PORT"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"
echo "Environment variables: PORT=$PORT"

# Streamlit 구성 디렉토리 확인
mkdir -p .streamlit

# Streamlit 구성 파일 생성 또는 업데이트
cat > .streamlit/config.toml << EOL
[server]
headless = true
port = $PORT
enableCORS = false
enableXsrfProtection = false
address = "0.0.0.0"
EOL

# Streamlit 앱 실행 (실제 애플리케이션)
streamlit run streamlit_app.py --server.port=$PORT --server.address=0.0.0.0
