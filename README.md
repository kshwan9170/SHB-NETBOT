# SHB-NetBot (신한은행 네트워크 지원 챗봇)

**SHB-NetBot**은 신한은행 IT 운영팀을 위한 지능형 네트워크 지원 챗봇입니다.  
VPN, 방화벽, IP 설정, 프린터, 전화기 등 자주 반복되는 네트워크 관련 질의에 대해 빠르고 정확한 자동 응답을 제공합니다.  
OpenAI의 GPT 기반 Fine-tuned 모델과 RAG(Retrieval-Augmented Generation), 엑셀 기반의 흐름 처리 로직을 결합하여 다양한 유형의 질문에 대응합니다.

---

## 📌 주요 기능 요약

| 기능 구분               | 설명 |
|------------------------|------|
| 🔍 문서 기반 RAG       | ChromaDB를 통한 벡터 임베딩 검색 및 GPT 응답 생성 |
| 🧠 Fine-tuned GPT 통합 | 사내 FAQ 질문을 학습한 모델로 빠른 응답 제공 |
| 🔁 키워드 분기 처리    | 질문 내 키워드에 따라 적절한 응답 경로(RAG, Excel 등) 자동 선택 |
| 📄 다중 문서 지원       | PDF, DOCX, PPTX, XLSX, TXT 문서 업로드 및 처리 |
| 📊 엑셀 기반 프로세스   | 구조화된 데이터에서 조건 기반 응답 흐름 처리 |
| 💬 웹 기반 UI          | Streamlit을 이용한 직관적인 대화형 사용자 인터페이스 |

---

## 🧱 아키텍처 개요

```
[사용자 질문 입력]
        │
        ▼
  [질문 키워드 분류기]
        │
 ┌──────┴──────┐
 ▼             ▼
[Fine-tuned GPT]  [Excel 흐름 분석기]
        │             │
        ▼             ▼
        └────[RAG 임베딩 검색]────┐
                                 ▼
                          [최종 응답 생성]
                                 │
                                 ▼
                           [사용자에게 응답]
```

---

## 📁 프로젝트 구조

```
SHB-NETBOT/
├── app.py                  # 메인 실행 파일 (Streamlit 기반 UI)
├── app_modern.py          # 향상된 모던 UI 버전
├── chatbot.py             # Fine-tuned GPT 모델 인터페이스
├── document_processor.py  # 문서 업로드 및 처리 유틸리티
├── excel_flow_parser.py   # 엑셀 기반 응답 로직 처리
├── csv_to_narrative.py    # CSV 데이터를 자연어로 요약하는 모듈
├── templates/             # Streamlit 커스터마이징 템플릿
├── uploaded_files/        # 업로드된 문서 저장 디렉토리
├── chroma_db/             # Chroma 벡터 DB 저장소
└── requirements.txt       # 의존성 패키지 목록
```

---

## 🚀 설치 및 실행

1. **Python 환경 준비**

```bash
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
```

2. **패키지 설치**

```bash
pip install -r requirements.txt
```

3. **환경 변수 설정**

```bash
export OPENAI_API_KEY=your_api_key_here
```

4. **앱 실행**

```bash
# 기본 UI
streamlit run app.py

# 모던 UI
streamlit run app_modern.py
```

---

## 💡 사용 예시

- PDF 네트워크 가이드를 업로드한 후 “IP 충돌 해결 방법 알려줘”라고 입력하면 해당 문서 내 정보를 기반으로 요약 응답을 제공합니다.
- “VPN 연결이 안 돼요”라고 질문하면, Fine-tuned 모델이 FAQ 학습 결과에 따라 해결 절차를 안내합니다.
- “프린터 등록 절차 알려줘”처럼 Excel 기반 처리 흐름이 있는 항목은 구조화된 조건에 따라 단계별로 응답합니다.

---

## 🔐 기술 스택

- **OpenAI GPT-3.5 (Fine-tuned)**
- **ChromaDB (문서 임베딩 및 RAG 검색)**
- **Streamlit (UI 구성)**
- **Python + Pandas + LangChain**

---
