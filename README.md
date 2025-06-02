**SHB-NETBOT**
SHB-NETBOT은 다양한 문서 유형을 처리하고, 사용자와의 대화형 상호작용을 통해 실시간으로 정보를 제공하는 지능형 문서 기반 챗봇 플랫폼입니다. 이 시스템은 기업 문서, 가이드라인, CSV 데이터 등을 효과적으로 분석하여 사용자에게 유의미한 답변을 제공합니다.

**주요 기능**
다양한 문서 형식 지원: PDF, Word, 텍스트 파일 등 다양한 문서를 업로드하여 처리할 수 있습니다.
CSV 데이터 내러티브 생성: CSV 파일을 업로드하면 데이터를 분석하여 내러티브 형태로 요약합니다.
대화형 인터페이스: Streamlit 기반의 웹 인터페이스를 통해 사용자와의 자연스러운 대화를 지원합니다.
문서 기반 질의응답: 업로드된 문서를 기반으로 한 정확한 질의응답 기능을 제공합니다.
데이터베이스 통합: ChromaDB를 활용하여 문서 임베딩 및 검색 기능을 강화하였습니다.

**설치 및 실행 방법**
1. 필수 패키지 설치:

bash
pip install -r requirements.txt

2. 애플리케이션 실행:

bash
streamlit run app.py

또는 최신 UI를 사용하려면:

bash
streamlit run app_modern.py

**디렉토리 구조**
app.py: 메인 애플리케이션 파일
app_modern.py: 최신 UI를 제공하는 애플리케이션 파일
chatbot.py: 챗봇 로직 처리 모듈
document_processor.py: 문서 처리 및 분석 모듈
csv_to_narrative.py: CSV 데이터를 내러티브로 변환하는 모듈
templates/: Streamlit UI 템플릿 파일
uploaded_files/: 업로드된 파일 저장 디렉토리
chroma_db/: ChromaDB 관련 데이터 저장 디렉토리

**사용 예시**
웹 인터페이스를 통해 문서를 업로드합니다.
업로드된 문서를 기반으로 질문을 입력하면, 챗봇이 해당 문서에서 관련 정보를 추출하여 답변합니다.
CSV 파일을 업로드하면, 시스템이 데이터를 분석하여 요약된 내러티브를 제공합니다.
