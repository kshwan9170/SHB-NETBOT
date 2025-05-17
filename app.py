import os
import streamlit as st
import uuid
import json
from pathlib import Path
import tempfile
import base64
import random
import time

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

# Shinhan Bank 테마 색상
SHINHAN_BLUE = "#0046FF"  # 주요 색상
SHINHAN_DARK_BLUE = "#003399"  # 어두운 강조 색상
SHINHAN_LIGHT_BLUE = "#E6EFFF"  # 배경 연한 파란색

# Page configuration
st.set_page_config(
    page_title="SHB-NetBot - 신한은행 내부 네트워크 챗봇",
    page_icon="💬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Create a Shinhan Bank logo SVG (simplified)
def generate_shinhan_logo(color="#0046FF"):
    return f"""
    <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="40" rx="4" fill="white"/>
        <path d="M20 10H100V15H20V10Z" fill="{color}"/>
        <path d="M20 17.5H100V22.5H20V17.5Z" fill="{color}"/>
        <path d="M20 25H70V30H20V25Z" fill="{color}"/>
        <text x="25" y="37" font-family="Arial" font-size="8" fill="{color}">SHINHAN BANK</text>
    </svg>
    """

# 테마 설정을 위한 CSS 스타일
css = """
<style>
    /* 기본 스타일 재설정 */
    * {
        box-sizing: border-box;
    }
    
    /* 상단 헤더 스타일 - 고정 */
    .fixed-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: white;
        z-index: 1000;
        padding: 10px 20px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 70px;
    }
    
    [data-theme="dark"] .fixed-header {
        background: #262730;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    
    .header-content {
        display: flex;
        align-items: center;
        gap: 15px;
    }
    
    .logo-container {
        flex-shrink: 0;
    }
    
    .title-container h1 {
        margin: 0;
        font-size: 1.5rem;
        color: #0046FF;
    }
    
    [data-theme="dark"] .title-container h1 {
        color: #4B79FF;
    }
    
    .title-container p {
        margin: 0;
        font-size: 0.8rem;
        opacity: 0.7;
    }
    
    /* 메인 컨테이너 - 헤더 아래 공간 확보 */
    .main-container {
        margin-top: 80px;
        padding: 20px;
    }
    
    /* 챗 컨테이너 */
    .chat-container {
        display: flex;
        flex-direction: column;
        gap: 15px;
        padding: 20px;
        border-radius: 12px;
        background-color: rgba(240, 242, 246, 0.5);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        min-height: 70vh;
        max-height: 75vh;
        overflow-y: auto;
        margin-bottom: 20px;
    }
    
    [data-theme="dark"] .chat-container {
        background-color: rgba(40, 42, 54, 0.5);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    
    /* 말풍선 스타일 */
    .chat-message {
        position: relative;
        padding: 15px;
        border-radius: 18px;
        line-height: 1.5;
        max-width: 85%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        animation: fadeIn 0.3s ease-in-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .user-message {
        align-self: flex-end;
        background-color: #0046FF;
        color: white;
        margin-left: auto;
        border-bottom-right-radius: 4px;
    }
    
    .user-message::after {
        content: "";
        position: absolute;
        bottom: 0;
        right: -10px;
        width: 20px;
        height: 20px;
        background-color: #0046FF;
        border-bottom-left-radius: 16px;
        z-index: -1;
    }
    
    .bot-message {
        align-self: flex-start;
        background-color: white;
        border: 1px solid #E6E6E6;
        margin-right: auto;
        border-bottom-left-radius: 4px;
    }
    
    .bot-message::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: -10px;
        width: 20px;
        height: 20px;
        background-color: white;
        border-bottom-right-radius: 16px;
        border-left: 1px solid #E6E6E6;
        border-bottom: 1px solid #E6E6E6;
        z-index: -1;
    }
    
    [data-theme="dark"] .bot-message {
        background-color: #3A3B45;
        border: 1px solid #4A4B55;
        color: #F1F1F1;
    }
    
    [data-theme="dark"] .bot-message::after {
        background-color: #3A3B45;
        border-left: 1px solid #4A4B55;
        border-bottom: 1px solid #4A4B55;
    }
    
    .message-header {
        font-size: 0.8rem;
        margin-bottom: 5px;
        font-weight: bold;
        opacity: 0.7;
    }
    
    .user-message .message-header {
        color: white;
        opacity: 0.9;
    }
    
    /* 입력 컨테이너 - 하단 고정 */
    .input-container {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 15px 20px;
        background: white;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
        display: flex;
        gap: 10px;
    }
    
    [data-theme="dark"] .input-container {
        background: #262730;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
    }
    
    /* Streamlit 컴포넌트 스타일 */
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
    
    /* 다크모드 스타일 */
    [data-theme="dark"] .user-message {
        background-color: #0057FF;
    }
    
    [data-theme="dark"] .user-message::after {
        background-color: #0057FF;
    }
    
    /* 다크모드 토글 스타일 */
    .theme-toggle {
        position: relative;
        display: inline-block;
        width: 60px;
        height: 28px;
    }

    .theme-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
        border-radius: 34px;
    }

    .toggle-slider:before {
        position: absolute;
        content: "";
        height: 20px;
        width: 20px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }

    input:checked + .toggle-slider {
        background-color: #0046FF;
    }

    input:checked + .toggle-slider:before {
        transform: translateX(32px);
    }
    
    .toggle-label {
        margin-right: 10px;
        font-size: 0.9rem;
    }
    
    /* 설명 상자 스타일 */
    .info-box {
        background-color: #F8F9FA;
        border-left: 4px solid #0046FF;
        padding: 12px 15px;
        border-radius: 4px;
        font-size: 0.9rem;
        margin: 10px 0;
    }
    
    [data-theme="dark"] .info-box {
        background-color: #2E303E;
        border-left: 4px solid #4B79FF;
    }
    
    /* 버튼 스타일 */
    .custom-button {
        background-color: #0046FF;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 20px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 5px rgba(0, 70, 255, 0.2);
    }
    
    .custom-button:hover {
        background-color: #003ACC;
        box-shadow: 0 4px 8px rgba(0, 70, 255, 0.3);
        transform: translateY(-1px);
    }
    
    /* 애니메이션 스타일 */
    .stApp {
        transition: all 0.3s ease-in-out;
    }
    
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 70, 255, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(0, 70, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 70, 255, 0); }
    }
    
    .pulse {
        animation: pulse 1.5s infinite;
    }
    
    /* 모바일 최적화 */
    @media (max-width: 768px) {
        .chat-message {
            max-width: 90%;
        }
        
        .fixed-header {
            padding: 10px;
            height: 60px;
        }
        
        .title-container h1 {
            font-size: 1.2rem;
        }
    }
    
    /* Custom components */
    .stTextInput > div > div > input {
        border-radius: 20px;
        padding-left: 15px;
        border: 1px solid #E6E6E6;
        background-color: #F8F9FA;
    }
    
    [data-theme="dark"] .stTextInput > div > div > input {
        border: 1px solid #4A4B55;
        background-color: #3A3B45;
        color: white;
    }
    
    .stButton > button {
        border-radius: 20px;
        height: 40px;
        padding: 0 20px;
        background-color: #0046FF;
        color: white;
        font-weight: bold;
        border: none;
        box-shadow: 0 2px 5px rgba(0, 70, 255, 0.2);
    }
    
    .stButton > button:hover {
        background-color: #003ACC;
        border: none;
    }
    
    /* 문서 관리 패널 스타일 */
    .document-panel {
        background-color: white;
        border-radius: 10px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    
    [data-theme="dark"] .document-panel {
        background-color: #3A3B45;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    /* 로딩 스피너 스타일 */
    .loading-spinner {
        display: inline-block;
        width: 30px;
        height: 30px;
        border: 3px solid rgba(0, 70, 255, 0.3);
        border-radius: 50%;
        border-top-color: #0046FF;
        animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    /* 말풍선 타이핑 효과 */
    .typing-indicator {
        display: inline-block;
        padding-left: 3px;
    }
    
    .typing-indicator span {
        height: 5px;
        width: 5px;
        background-color: rgba(0, 0, 0, 0.5);
        display: inline-block;
        border-radius: 50%;
        margin: 0 1px;
        animation: bounce 1.3s linear infinite;
    }
    
    .typing-indicator span:nth-child(2) {
        animation-delay: 0.15s;
    }
    
    .typing-indicator span:nth-child(3) {
        animation-delay: 0.3s;
    }
    
    @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }
    
    [data-theme="dark"] .typing-indicator span {
        background-color: rgba(255, 255, 255, 0.5);
    }
    
    /* 로고 반응형 스타일 */
    .logo-responsive {
        display: block;
    }
    
    @media (max-width: 768px) {
        .logo-responsive {
            display: none;
        }
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
if "typing" not in st.session_state:
    st.session_state.typing = False

# 테마 전환 함수
def toggle_theme():
    if st.session_state.theme == 'light':
        st.session_state.theme = 'dark'
    else:
        st.session_state.theme = 'light'
    st.rerun()

# 타이핑 효과 함수
def simulate_typing():
    st.session_state.typing = True
    time.sleep(0.5)  # 타이핑 시뮬레이션
    st.session_state.typing = False

# 현재 테마에 따른 자바스크립트 코드
theme_js = f"""
<script>
    document.body.setAttribute('data-theme', '{st.session_state.theme}');
</script>
"""
st.markdown(theme_js, unsafe_allow_html=True)

# 상단 고정 헤더
logo_color = "#0046FF" if st.session_state.theme == 'light' else "#4B79FF"
st.markdown(f'''
<div class="fixed-header">
    <div class="header-content">
        <div class="logo-container logo-responsive">
            {generate_shinhan_logo(logo_color)}
        </div>
        <div class="title-container">
            <h1>SHB-NetBot</h1>
            <p>신한은행 내부 네트워크 챗봇</p>
        </div>
    </div>
    <div class="theme-toggle">
        <span class="toggle-label">다크모드</span>
        <label class="theme-toggle">
            <input type="checkbox" {'checked' if st.session_state.theme == 'dark' else ''} onclick="
                fetch('', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }},
                    body: new URLSearchParams({{
                        'theme-toggle': '{st.session_state.theme}'
                    }})
                }}).then(() => {{ window.location.reload(); }});
            ">
            <span class="toggle-slider"></span>
        </label>
    </div>
</div>
<div class="main-container">
''', unsafe_allow_html=True)

# 메인 레이아웃
chat_col, info_col = st.columns([3, 1])

with chat_col:
    # 채팅 컨테이너
    st.markdown('<div class="chat-container">', unsafe_allow_html=True)
    
    # 채팅 메시지 표시
    if len(st.session_state.chat_history) > 0:
        for message in st.session_state.chat_history:
            role = message["role"]
            content = message["content"]
            
            # 유저/봇 메시지 스타일 적용
            if role == "user":
                st.markdown(f'''
                <div class="chat-message user-message">
                    <div class="message-header">사용자</div>
                    {content}
                </div>
                ''', unsafe_allow_html=True)
            else:
                st.markdown(f'''
                <div class="chat-message bot-message">
                    <div class="message-header">SHB-NetBot</div>
                    {content}
                </div>
                ''', unsafe_allow_html=True)
    else:
        # 첫 방문 시 환영 메시지
        welcome_msg = (
            "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요. "
            "예를 들어, <strong>스윙 접속 방법</strong>, <strong>IP 확인 방법</strong> 등에 대해 물어보실 수 있습니다."
        )
        st.markdown(f'''
        <div class="chat-message bot-message">
            <div class="message-header">SHB-NetBot</div>
            {welcome_msg}
        </div>
        ''', unsafe_allow_html=True)
        st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})
    
    # 타이핑 중 표시
    if st.session_state.typing:
        st.markdown('''
        <div class="chat-message bot-message" style="max-width:120px; padding: 10px 15px;">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
        ''', unsafe_allow_html=True)
    
    st.markdown('</div>', unsafe_allow_html=True)
    
    # 하단 입력 컨테이너
    st.markdown('''
    <div style="height: 70px;"></div>
    ''', unsafe_allow_html=True)
    
    # 채팅 입력
    prompt = st.chat_input("질문을 입력하세요...")
    if prompt:
        # 사용자 메시지 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        
        # 타이핑 표시 활성화
        st.session_state.typing = True
        
        # 봇 응답 생성 및 표시
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
        
        # 봇 응답을 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "assistant", "content": response})
        
        # 타이핑 표시 비활성화
        st.session_state.typing = False
        
        # UI 새로고침 (스크롤을 최신 메시지로 이동)
        st.rerun()

with info_col:
    # 문서 관리 패널
    with st.container():
        st.markdown('<div class="document-panel">', unsafe_allow_html=True)
        st.markdown('### 📚 문서 관리')
        st.markdown('<div class="info-box">참고할 내부 문서를 추가하면 더 정확한 답변을 제공합니다.</div>', unsafe_allow_html=True)
        
        tabs = st.tabs(["📋 예시 문서", "📝 직접 입력", "📤 파일 업로드"])
        
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
                
                with st.spinner("문서 처리 중..."):
                    try:
                        # 문서 처리
                        texts = [sample_text]
                        initialize_database()
                        add_document_embeddings(texts, metadata={"source": "신한은행_네트워크_매뉴얼.txt"})
                        
                        st.session_state.document_uploaded = True
                        st.success("예시 문서가 성공적으로 처리되었습니다!")
                    except Exception as e:
                        st.error(f"문서 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 텍스트 입력 탭
        with tabs[1]:
            text_input = st.text_area(
                "직접 문서 입력",
                height=150,
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
            대신 **예시 문서** 또는 **직접 입력** 기능을 이용해 주세요.
            """)
            
            # 비활성화된 업로더 (UX를 위해 표시)
            st.file_uploader(
                "파일 선택 (현재 비활성화됨)",
                type=["pdf", "docx", "pptx", "txt"],
                disabled=True
            )
        st.markdown('</div>', unsafe_allow_html=True)
    
    # 데이터베이스 상태 패널
    with st.container():
        st.markdown('<div class="document-panel" style="margin-top: 20px;">', unsafe_allow_html=True)
        st.markdown('### 📊 데이터베이스 상태')
        db_status = get_database_status()
        
        # 그래픽 기반 상태 표시
        if db_status["document_count"] > 0:
            st.markdown(f'''
            <div style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold;">등록된 문서</div>
                    <div style="background: #E6EFFF; border-radius: 10px; height: 8px; width: 100%; margin-top: 5px;">
                        <div style="background: #0046FF; border-radius: 10px; height: 8px; width: {min(100, db_status["document_count"] * 20)}%;"></div>
                    </div>
                </div>
                <div style="width: 40px; text-align: right; font-weight: bold;">{db_status["document_count"]}</div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold;">문장 수</div>
                    <div style="background: #E6EFFF; border-radius: 10px; height: 8px; width: 100%; margin-top: 5px;">
                        <div style="background: #0046FF; border-radius: 10px; height: 8px; width: {min(100, db_status["chunk_count"] * 5)}%;"></div>
                    </div>
                </div>
                <div style="width: 40px; text-align: right; font-weight: bold;">{db_status["chunk_count"]}</div>
            </div>
            
            <div class="info-box" style="background-color: #E6F7E6; border-left: 4px solid #28A745;">
                ✅ 문서가 등록되어 있어 더 정확한 답변을 제공할 수 있습니다.
            </div>
            ''', unsafe_allow_html=True)
        else:
            st.markdown('''
            <div class="info-box" style="background-color: #FFF3E0; border-left: 4px solid #FFA726;">
                📝 AI 응답 품질 향상을 위해 내부 문서를 추가해 주세요!
            </div>
            ''', unsafe_allow_html=True)
        
        st.markdown('</div>', unsafe_allow_html=True)
    
    # 앱 정보 패널
    with st.container():
        st.markdown('<div class="document-panel" style="margin-top: 20px;">', unsafe_allow_html=True)
        st.markdown('### ℹ️ 앱 정보')
        st.markdown('''
        <p><strong>SHB-NetBot</strong>은 신한은행 직원들의 네트워크 관련 질문에 답변해주는 AI 챗봇입니다.</p>
        <ul style="padding-left: 20px;">
            <li style="margin-bottom: 5px;"><span style="color: #0046FF;">🧠</span> <strong>GPT-3.5</strong> 기반 자연어 처리</li>
            <li style="margin-bottom: 5px;"><span style="color: #0046FF;">🔍</span> <strong>RAG</strong> 기술로 내부 문서 활용</li>
            <li style="margin-bottom: 5px;"><span style="color: #0046FF;">💬</span> 한국어/영어 자동 인식</li>
            <li style="margin-bottom: 5px;"><span style="color: #0046FF;">🔄</span> 스윙, IP 확인 등 질의응답</li>
        </ul>
        ''', unsafe_allow_html=True)
        
        # 신한은행 로고
        logo_html = generate_shinhan_logo(logo_color)
        st.markdown(f'''
        <div style="text-align: center; margin-top: 20px; opacity: 0.7;">
            {logo_html}
            <p style="font-size: 0.8rem; margin-top: 5px;">© 2025 Shinhan Bank. All rights reserved.</p>
        </div>
        ''', unsafe_allow_html=True)
        
        st.markdown('</div>', unsafe_allow_html=True)

# 하단 고정 입력창 (HTML로 직접 구현, UI용)
st.markdown('''
<div class="input-container">
    <input type="text" placeholder="질문을 입력하세요..." style="flex: 1; padding: 10px 15px; border-radius: 20px; border: 1px solid #E6E6E6; outline: none;" disabled>
    <button style="background-color: #0046FF; color: white; border: none; border-radius: 20px; padding: 10px 20px; font-weight: bold;" disabled>전송</button>
</div>
</div>
''', unsafe_allow_html=True)

# 스크롤 제어 자바스크립트
st.markdown('''
<script>
    // 페이지 로드 후 채팅창 자동 스크롤
    document.addEventListener('DOMContentLoaded', function() {
        var chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    });
</script>
''', unsafe_allow_html=True)

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
