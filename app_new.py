import os
import streamlit as st
import uuid
import json
from pathlib import Path
import tempfile
import base64

from document_processor import process_document
from chatbot import get_chatbot_response
from database import (
    initialize_database,
    add_document_embeddings,
    search_similar_docs,
    get_database_status
)
from utils import format_chat_message, get_chat_history

# 업로드 파일을 위한 디렉토리 생성
UPLOAD_DIR = Path("./uploaded_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# Page configuration
st.set_page_config(
    page_title="SHB-NetBot - 신한은행 내부 네트워크 챗봇",
    page_icon="💬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# 테마 설정을 위한 CSS 스타일
css = """
<style>
    .main-header {
        font-family: 'Pretendard', sans-serif;
        text-align: center;
        padding-bottom: 15px;
        border-bottom: 2px solid #0046FF;
        margin-bottom: 20px;
    }
    
    .sub-text {
        font-size: 1rem;
        opacity: 0.8;
        margin-bottom: 20px;
    }
    
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    
    .stTabs [data-baseweb="tab"] {
        border-radius: 4px 4px 0px 0px;
        padding: 8px 16px;
        background-color: #f0f2f6;
    }
    
    .stTabs [aria-selected="true"] {
        background-color: #0046FF !important;
        color: white !important;
    }
    
    .shinhan-blue {
        color: #0046FF;
    }
    
    .chat-message {
        padding: 15px;
        border-radius: 10px;
        margin-bottom: 10px;
        line-height: 1.5;
    }
    
    .user-message {
        background-color: rgba(0, 70, 255, 0.1);
        border-left: 5px solid #0046FF;
    }
    
    .bot-message {
        background-color: rgba(240, 242, 246, 0.7);
        border-left: 5px solid #0046FF;
    }
    
    /* 다크모드 스타일 */
    [data-theme="dark"] .user-message {
        background-color: rgba(0, 70, 255, 0.3);
    }
    
    [data-theme="dark"] .bot-message {
        background-color: rgba(50, 50, 50, 0.7);
    }
    
    /* 다크모드 스위치 스타일 */
    .theme-switch {
        text-align: right;
        margin-bottom: 20px;
    }
    
    .stApp {
        transition: all 0.3s ease-in-out;
    }
    
    /* 이미지 스타일 */
    .image-container img {
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        margin-bottom: 10px;
    }
    
    /* 모던한 버튼 스타일 */
    .stButton>button {
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
        transition: all 0.2s ease;
    }
    
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
</style>
"""

st.markdown(css, unsafe_allow_html=True)

# 테마 상태 관리
if 'theme' not in st.session_state:
    st.session_state.theme = 'light'  # 기본값: 라이트모드

# Initialize session state variables
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "document_uploaded" not in st.session_state:
    st.session_state.document_uploaded = False

# 테마 전환 함수
def toggle_theme():
    if st.session_state.theme == 'light':
        st.session_state.theme = 'dark'
    else:
        st.session_state.theme = 'light'
    st.rerun()

# 현재 테마에 따른 자바스크립트 코드
theme_js = f"""
<script>
    document.body.setAttribute('data-theme', '{st.session_state.theme}');
</script>
"""
st.markdown(theme_js, unsafe_allow_html=True)

# 테마 토글 버튼
col_theme1, col_theme2 = st.columns([6, 1])
with col_theme2:
    st.checkbox("다크모드", value=(st.session_state.theme == 'dark'), key='theme-toggle', on_change=toggle_theme)

# 헤더 영역
st.markdown('<div class="main-header">', unsafe_allow_html=True)
st.title("💬 SHB-NetBot - 신한은행 내부 네트워크 챗봇")
st.markdown('<p class="sub-text">네트워크 관련 질문에 답변해 드립니다. 궁금한 점을 물어보세요!</p>', unsafe_allow_html=True)
st.markdown('</div>', unsafe_allow_html=True)

# 메인 레이아웃
col1, col2 = st.columns([2, 1])

with col1:
    # 채팅 영역 컨테이너
    chat_container = st.container()
    with chat_container:
        # 채팅 메시지 표시
        for message in st.session_state.chat_history:
            role = message["role"]
            content = message["content"]
            
            # 커스텀 스타일 적용
            if role == "user":
                st.markdown(f'<div class="chat-message user-message"><strong>사용자:</strong><br>{content}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="chat-message bot-message"><strong>SHB-NetBot:</strong><br>{content}</div>', unsafe_allow_html=True)
    
    # 채팅 입력
    if prompt := st.chat_input("질문을 입력하세요..."):
        # 사용자 메시지 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        
        # 사용자 메시지 표시
        st.markdown(f'<div class="chat-message user-message"><strong>사용자:</strong><br>{prompt}</div>', unsafe_allow_html=True)
        
        # 봇 응답 생성 및 표시
        with st.spinner("답변 생성 중..."):
            db_status = get_database_status()
            if db_status["document_count"] > 0:
                # RAG approach - search for relevant docs and then ask GPT
                similar_docs = search_similar_docs(prompt, top_k=3)
                context = "\n\n".join([doc.page_content for doc in similar_docs])
                
                response = get_chatbot_response(
                    prompt, 
                    context=context,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            else:
                # No documents in DB yet, just use GPT
                response = get_chatbot_response(
                    prompt,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            
            # 봇 응답 표시
            st.markdown(f'<div class="chat-message bot-message"><strong>SHB-NetBot:</strong><br>{response}</div>', unsafe_allow_html=True)
        
        # 봇 응답을 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "assistant", "content": response})
        
        # UI 새로고침 (스크롤을 최신 메시지로 이동)
        st.rerun()

with col2:
    # 문서 업로드 섹션
    with st.expander("🔍 문서 관리", expanded=True):
        st.write("참고할 내부 문서를 추가하면 더 정확한 답변을 제공합니다.")
        
        tabs = st.tabs(["예시 문서", "텍스트 입력", "파일 업로드"])
        
        # 예시 문서 탭
        with tabs[0]:
            sample_txt = st.checkbox("예시 문서 사용하기", help="테스트용 예시 문서를 사용합니다")
            
            if sample_txt:
                # 예시 문서 텍스트
                sample_text = """
                # 신한은행 네트워크 매뉴얼
                
                ## 스윙(SWING) 접속 방법
                1. 스윙 아이콘을 더블 클릭하여 실행합니다.
                2. 사원번호와 비밀번호를 입력합니다.
                3. OTP 인증을 완료합니다.
                4. 로그인 후 좌측 메뉴에서 원하는 기능을 선택합니다.
                
                ## IP 확인 방법
                1. 시작 메뉴에서 'cmd'를 입력하여 명령 프롬프트를 실행합니다.
                2. 'ipconfig'를 입력하고 Enter를 누릅니다.
                3. 'IPv4 주소'를 확인합니다.
                
                ## VPN 연결 방법
                1. VPN 클라이언트를 실행합니다.
                2. 'shb.vpn.net' 서버 주소를 입력합니다.
                3. 사용자 계정과 비밀번호를 입력합니다.
                4. 연결 버튼을 클릭합니다.
                
                ## 네트워크 드라이브 매핑 방법
                1. 윈도우 탐색기에서 '내 PC'를 엽니다.
                2. '네트워크 위치 추가'를 클릭합니다.
                3. '\\\\서버명\\공유폴더' 형식으로 주소를 입력합니다.
                4. 드라이브 문자를 선택합니다.
                
                ## 인터넷 브라우저 사용 규정
                1. 업무 용도로만 인터넷을 사용합니다.
                2. 보안 위험이 있는 웹사이트 접속을 금지합니다.
                3. 사내 문서는 외부로 유출하지 않습니다.
                4. 의심스러운 이메일 첨부파일은 열지 않습니다.
                """
                
                with st.spinner("예시 문서 처리 중..."):
                    try:
                        # 문서 처리
                        texts = [sample_text]
                        initialize_database()
                        add_document_embeddings(texts, metadata={"source": "신한은행_네트워크_매뉴얼.txt"})
                        
                        st.session_state.document_uploaded = True
                        st.success("예시 문서 '신한은행_네트워크_매뉴얼.txt'이(가) 성공적으로 처리되었습니다!")
                    except Exception as e:
                        st.error(f"문서 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 텍스트 입력 탭
        with tabs[1]:
            text_input = st.text_area(
                "직접 문서 입력",
                height=200,
                placeholder="여기에 참고할 문서 내용을 붙여넣기 하세요..."
            )
            
            if st.button("텍스트 처리하기", use_container_width=True) and text_input:
                with st.spinner("텍스트 처리 중..."):
                    try:
                        # 텍스트 처리
                        texts = [text_input]
                        initialize_database()
                        add_document_embeddings(texts, metadata={"source": "사용자_입력_문서.txt"})
                        
                        st.session_state.document_uploaded = True
                        st.success("입력하신 텍스트가 성공적으로 처리되었습니다!")
                    except Exception as e:
                        st.error(f"텍스트 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 파일 업로드 탭
        with tabs[2]:
            st.warning("""
            ⚠️ **알림**: 현재 서버에서 파일 업로드 기능에 기술적 제한이 있습니다.
            대신 **예시 문서** 또는 **텍스트 입력** 기능을 이용해 주세요.
            """)
            
            # 비활성화된 업로더 (UX를 위해 표시)
            st.file_uploader(
                "파일 선택 (현재 비활성화됨)",
                type=["pdf", "docx", "pptx", "txt"],
                disabled=True
            )
    
    # 데이터베이스 상태 섹션
    with st.expander("📊 데이터베이스 현황", expanded=True):
        db_status = get_database_status()
        st.write(f"현재 데이터베이스에 {db_status['document_count']}개의 문서가 등록되어 있습니다.")
        st.write(f"문장 수: {db_status['chunk_count']}개")
        
        # 빈 데이터베이스 안내
        if db_status["document_count"] == 0:
            st.info("📝 AI 응답 품질 향상을 위해 내부 문서를 추가해 주세요!")
        else:
            st.success("✅ 문서가 등록되어 있어 더 정확한 답변을 제공할 수 있습니다.")
    
    # 앱 정보 섹션
    with st.expander("ℹ️ 앱 정보", expanded=False):
        st.write("**SHB-NetBot**은 신한은행 직원들의 네트워크 관련 질문에 답변해주는 AI 챗봇입니다.")
        st.markdown("- 🧠 **GPT-3.5** 기반 자연어 처리")
        st.markdown("- 🔍 **RAG(Retrieval Augmented Generation)** 기술 적용")
        st.markdown("- 💬 스윙, IP 확인 등 네트워크 관련 질의응답")
        st.markdown("- 🔄 한글/영어 자동 언어 감지 및 응답")

# 데이터베이스 초기화 (첫 실행 시)
if "db_initialized" not in st.session_state:
    initialize_database()
    st.session_state.db_initialized = True

# 첫 실행 시 환영 메시지 추가
if len(st.session_state.chat_history) == 0:
    welcome_msg = (
        "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요. "
        "예를 들어, 스윙 접속 방법, IP 확인 방법 등에 대해 물어보실 수 있습니다."
    )
    st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})