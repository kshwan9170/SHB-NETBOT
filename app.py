import streamlit as st
import uuid
from pathlib import Path
import os
import time
from datetime import datetime

from document_processor import process_document
from chatbot import get_chatbot_response
from database import (
    initialize_database,
    add_document_embeddings,
    search_similar_docs,
    get_database_status
)
from utils import get_chat_history

# 업로드 파일을 위한 디렉토리 생성
UPLOAD_DIR = Path("./uploaded_files")
UPLOAD_DIR.mkdir(exist_ok=True)

# 페이지 설정
st.set_page_config(
    page_title="SHB-NetBot - 신한은행 내부 네트워크 챗봇",
    page_icon="💬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "document_uploaded" not in st.session_state:
    st.session_state.document_uploaded = False
if "theme" not in st.session_state:
    st.session_state.theme = "light"  # 기본 테마: 라이트 모드
if "typing" not in st.session_state:
    st.session_state.typing = False
if "show_document_panel" not in st.session_state:
    st.session_state.show_document_panel = False

# 테마 전환 함수
def toggle_theme():
    if st.session_state.theme == "light":
        st.session_state.theme = "dark"
    else:
        st.session_state.theme = "light"

# 문서 패널 토글
def toggle_document_panel():
    st.session_state.show_document_panel = not st.session_state.show_document_panel

# CSS 스타일
def get_css():
    # 다크모드/라이트모드 색상 설정
    if st.session_state.theme == "dark":
        bg_color = "#1e1e2e"
        container_bg = "#2a2b3c"
        text_color = "#e0e0e0"
        border_color = "#3d3d5c"
        chat_header_bg = "#181825"
        bot_msg_bg = "#313244"
        user_msg_bg = "#2563eb"
        input_bg = "#313244"
        sidebar_bg = "#181825"
        btn_bg = "#2563eb"
        hover_bg = "#1d4ed8"
    else:
        bg_color = "#f7f7f8"
        container_bg = "#ffffff"
        text_color = "#343541"
        border_color = "#e5e5e7"
        chat_header_bg = "#ffffff"
        bot_msg_bg = "#f0f0f5"
        user_msg_bg = "#1a7eff"
        input_bg = "#ffffff"
        sidebar_bg = "#f9f9fa"
        btn_bg = "#0b57d0"
        hover_bg = "#0948ae"

    return f"""
    <style>
        /* 전체 스타일 설정 */
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: {bg_color};
            color: {text_color};
            transition: all 0.3s ease;
        }}
        
        /* 콘텐츠 컨테이너 */
        .main-container {{
            max-width: 1000px;
            margin: 0 auto;
            background-color: {container_bg};
            height: 100vh;
            display: flex;
            flex-direction: column;
            border-radius: 0;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
        }}
        
        /* 헤더 */
        .chat-header {{
            padding: 16px 24px;
            background-color: {chat_header_bg};
            border-bottom: 1px solid {border_color};
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
        }}
        
        .header-title {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .header-title h1 {{
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
        }}
        
        .header-actions {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        /* 로고 스타일 */
        .bot-logo {{
            width: 32px;
            height: 32px;
            background-color: #0052cc;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
        }}
        
        /* 채팅 영역 */
        .chat-container {{
            flex: 1;
            padding: 24px 0;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }}
        
        /* 메시지 스타일 */
        .message-group {{
            display: flex;
            flex-direction: column;
            width: 100%;
            padding: 16px 24px;
        }}
        
        .bot-message-group {{
            background-color: {bg_color};
        }}
        
        .message-container {{
            display: flex;
            gap: 16px;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
        }}
        
        .message {{
            display: flex;
            flex-direction: column;
            max-width: 90%;
        }}
        
        .message-content {{
            line-height: 1.6;
            padding: 0;
        }}
        
        .message-time {{
            font-size: 0.75rem;
            color: #8e8ea0;
            margin-top: 4px;
        }}
        
        /* 입력 영역 */
        .input-container {{
            padding: 16px 24px;
            border-top: 1px solid {border_color};
            background-color: {container_bg};
            position: sticky;
            bottom: 0;
            z-index: 100;
        }}
        
        .input-box {{
            display: flex;
            align-items: center;
            background-color: {input_bg};
            border: 1px solid {border_color};
            border-radius: 8px;
            padding: 8px 16px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
            gap: 12px;
        }}
        
        .input-field {{
            flex: 1;
            border: none;
            background: transparent;
            outline: none;
            padding: 8px 0;
            font-size: 1rem;
            color: {text_color};
            resize: none;
            max-height: 200px;
            min-height: 24px;
        }}
        
        .send-button {{
            background-color: {btn_bg};
            color: white;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }}
        
        .send-button:hover {{
            background-color: {hover_bg};
        }}
        
        /* 도구 버튼 (문서, 테마 등) */
        .tool-button {{
            background-color: transparent;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: {text_color};
            transition: background-color 0.2s;
        }}
        
        .tool-button:hover {{
            background-color: rgba(0, 0, 0, 0.05);
        }}
        
        [data-theme="dark"] .tool-button:hover {{
            background-color: rgba(255, 255, 255, 0.1);
        }}
        
        /* 사이드바 (문서 관련) */
        .sidebar {{
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            height: 100vh;
            background-color: {sidebar_bg};
            border-left: 1px solid {border_color};
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            box-shadow: -4px 0 10px rgba(0, 0, 0, 0.1);
            padding: 20px;
            overflow-y: auto;
        }}
        
        .sidebar.show {{
            transform: translateX(0);
        }}
        
        .sidebar-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }}
        
        .sidebar-title {{
            font-size: 1.1rem;
            font-weight: 600;
        }}
        
        .sidebar-close {{
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }}
        
        .sidebar-close:hover {{
            background-color: rgba(0, 0, 0, 0.05);
        }}
        
        [data-theme="dark"] .sidebar-close:hover {{
            background-color: rgba(255, 255, 255, 0.1);
        }}
        
        /* ChatGPT 스타일 마크다운 */
        .md-content pre {{
            background-color: {bot_msg_bg};
            border-radius: 8px;
            padding: 12px;
            overflow-x: auto;
            margin: 8px 0;
        }}
        
        .md-content code {{
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.9em;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            background-color: rgba(0, 0, 0, 0.05);
        }}
        
        [data-theme="dark"] .md-content code {{
            background-color: rgba(255, 255, 255, 0.1);
        }}
        
        .md-content p {{
            margin: 0 0 0.75em 0;
        }}
        
        .md-content ul, .md-content ol {{
            margin: 0.5em 0;
            padding-left: 1.5em;
        }}
        
        /* 로딩 애니메이션 */
        .typing-indicator {{
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 8px 0;
        }}
        
        .typing-dot {{
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: #8e8ea0;
            animation: typing-animation 1.4s infinite ease-in-out;
        }}
        
        .typing-dot:nth-child(1) {{
            animation-delay: 0s;
        }}
        
        .typing-dot:nth-child(2) {{
            animation-delay: 0.2s;
        }}
        
        .typing-dot:nth-child(3) {{
            animation-delay: 0.4s;
        }}
        
        @keyframes typing-animation {{
            0%, 100% {{ opacity: 0.3; transform: scale(1); }}
            50% {{ opacity: 1; transform: scale(1.2); }}
        }}
        
        /* 반응형 스타일 */
        @media (max-width: 768px) {{
            .main-container {{
                width: 100%;
                border-radius: 0;
                margin: 0;
            }}
            
            .message-container {{
                padding: 0;
            }}
            
            .chat-header h1 {{
                font-size: 1.1rem;
            }}
            
            .sidebar {{
                width: 85%;
            }}
        }}
        
        /* 스트림릿 커스텀 스타일 */
        .stApp {{
            background-color: {bg_color} !important;
        }}
        
        header {{
            display: none !important;
        }}
        
        .main > div:first-child {{
            padding: 0 !important;
        }}
        
        section[data-testid="stSidebar"] {{
            display: none !important;
        }}
        
        .block-container {{
            padding: 0 !important;
            max-width: 100% !important;
        }}
        
        footer {{
            display: none !important;
        }}
        
        /* 탭 스타일링 */
        .stTabs [data-baseweb="tab-panel"] {{
            padding-top: 16px !important;
        }}
        
        .stTabs [data-baseweb="tab-list"] {{
            gap: 8px !important;
        }}
        
        .stTabs [data-baseweb="tab"] {{
            background-color: transparent !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
        }}
        
        .stTabs [aria-selected="true"] {{
            background-color: {btn_bg} !important;
            color: white !important;
        }}
    </style>
    """

# 채팅 인터페이스 요소 생성
def create_chat_interface():
    # 현재 테마에 따른 아이콘 선택
    docs_icon = "📄"
    theme_icon = "🌙" if st.session_state.theme == "light" else "☀️"
    send_icon = "➤"
    
    # 메인 HTML 구조
    html = f"""
    <div class="main-container">
        <!-- 헤더 -->
        <div class="chat-header">
            <div class="header-title">
                <div class="bot-logo">S</div>
                <h1>SHB-NetBot</h1>
            </div>
            <div class="header-actions">
                <button class="tool-button docs-toggle" title="문서 패널 열기">
                    {docs_icon}
                </button>
                <button class="tool-button theme-toggle" title="테마 변경">
                    {theme_icon}
                </button>
            </div>
        </div>
        
        <!-- 채팅 영역 -->
        <div class="chat-container" id="chat-container">
    """
    
    # 채팅 메시지 출력
    current_role = None
    messages_html = ""
    
    if not st.session_state.chat_history:
        # 첫 방문 시 환영 메시지
        welcome_msg = "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."
        st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg, "time": datetime.now().strftime("%H:%M")})
    
    for i, message in enumerate(st.session_state.chat_history):
        role = message["role"]
        content = message["content"]
        time = message.get("time", "")
        
        if role != current_role:
            # 새로운 메시지 그룹 시작
            if i > 0:
                messages_html += "</div></div>"
            
            group_class = "bot-message-group" if role == "assistant" else ""
            messages_html += f'<div class="message-group {group_class}">'
            messages_html += '<div class="message-container">'
            current_role = role
        
        if role == "user":
            messages_html += f"""
            <div class="message" style="margin-left: auto;">
                <div class="message-content" style="text-align: right;">
                    {content}
                </div>
                <div class="message-time" style="text-align: right;">
                    {time}
                </div>
            </div>
            """
        else:
            messages_html += f"""
            <div class="message">
                <div class="message-content md-content">
                    {content}
                </div>
                <div class="message-time">
                    {time}
                </div>
            </div>
            """
    
    # 마지막 메시지 그룹 닫기
    if st.session_state.chat_history:
        messages_html += "</div></div>"
    
    # 타이핑 인디케이터 추가
    if st.session_state.typing:
        messages_html += """
        <div class="message-group bot-message-group">
            <div class="message-container">
                <div class="message">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        </div>
        """
    
    html += messages_html
    
    # 입력 영역
    html += """
        </div>
        
        <!-- 입력 영역 -->
        <div class="input-container">
            <form id="chat-form">
                <div class="input-box">
                    <textarea class="input-field" id="user-input" placeholder="메시지를 입력하세요..." rows="1"></textarea>
                    <button type="submit" class="send-button" title="전송">
                        ➤
                    </button>
                </div>
            </form>
        </div>
    </div>
    """
    
    # 문서 패널 사이드바
    sidebar_show = "show" if st.session_state.show_document_panel else ""
    
    html += f"""
    <div class="sidebar {sidebar_show}" id="docs-sidebar">
        <div class="sidebar-header">
            <div class="sidebar-title">문서 관리</div>
            <div class="sidebar-close">✕</div>
        </div>
        <div id="sidebar-content">
            <div style="text-align: center; padding: 8px;">
                <p style="margin-bottom: 16px;">네트워크 관련 문서를 추가하여 더 정확한 답변을 받을 수 있습니다.</p>
                <button id="show-doc-upload" style="
                    background-color: #0b57d0;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">문서 업로드</button>
            </div>
        </div>
    </div>
    """
    
    # 자바스크립트
    html += """
    <script>
        // 폼 제출 처리
        document.getElementById('chat-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const userInput = document.getElementById('user-input');
            const message = userInput.value.trim();
            
            if (message) {
                // 사용자 메시지 전송
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '';
                
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'user_message';
                input.value = message;
                
                form.appendChild(input);
                document.body.appendChild(form);
                
                userInput.value = '';
                userInput.style.height = 'auto';
                
                form.submit();
            }
        });
        
        // 다크모드 토글
        document.querySelector('.theme-toggle').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'toggle_theme';
            input.value = 'true';
            
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 문서 패널 토글
        document.querySelector('.docs-toggle').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'toggle_docs';
            input.value = 'true';
            
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 문서 패널 닫기
        document.querySelector('.sidebar-close').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'toggle_docs';
            input.value = 'false';
            
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 문서 업로드 버튼
        document.getElementById('show-doc-upload').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'show_doc_upload';
            input.value = 'true';
            
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 텍스트 영역 자동 크기 조절
        const textarea = document.getElementById('user-input');
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        // 페이지 로드 시 최신 메시지로 스크롤
        window.onload = function() {
            const chatContainer = document.getElementById('chat-container');
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    </script>
    """
    
    return html

# 주요 앱 로직
def main():
    st.markdown(get_css(), unsafe_allow_html=True)
    
    # 폼 데이터 처리
    
    # POST 데이터 처리 (사용자 메시지)
    if "user_message" in st.query_params:
        user_message = st.query_params["user_message"][0]
        current_time = datetime.now().strftime("%H:%M")
        
        # 사용자 메시지 추가
        st.session_state.chat_history.append({
            "role": "user", 
            "content": user_message,
            "time": current_time
        })
        
        # 타이핑 표시 활성화
        st.session_state.typing = True
        st.rerun()
    
    # 봇 응답 생성 (사용자 메시지 추가 후)
    if st.session_state.typing and len(st.session_state.chat_history) > 0 and st.session_state.chat_history[-1]["role"] == "user":
        user_message = st.session_state.chat_history[-1]["content"]
        
        # 봇 응답 생성
        db_status = get_database_status()
        if db_status["document_count"] > 0:
            # RAG approach - 관련 문서 검색 후 GPT 응답 생성
            similar_docs = search_similar_docs(user_message, top_k=3)
            context = "\n\n".join([doc.page_content for doc in similar_docs])
            
            response = get_chatbot_response(
                user_message, 
                context=context,
                chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
            )
        else:
            # 문서 없이 GPT 응답 생성
            response = get_chatbot_response(
                user_message,
                chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
            )
        
        # 봇 응답 추가
        current_time = datetime.now().strftime("%H:%M")
        st.session_state.chat_history.append({
            "role": "assistant", 
            "content": response,
            "time": current_time
        })
        
        # 타이핑 표시 비활성화
        st.session_state.typing = False
        
        # 쿼리 파라미터 초기화
        st.query_params.clear()
        st.rerun()
    
    # 테마 토글 처리
    if "toggle_theme" in st.query_params:
        toggle_theme()
        st.query_params.clear()
        st.rerun()
    
    # 문서 패널 토글 처리
    if "toggle_docs" in st.query_params:
        if st.query_params["toggle_docs"][0] == "true":
            st.session_state.show_document_panel = True
        else:
            st.session_state.show_document_panel = False
        st.query_params.clear()
        st.rerun()
    
    # 문서 업로드 패널 표시
    if "show_doc_upload" in st.query_params:
        with st.expander("문서 관리", expanded=True):
            # 탭으로 구성된 문서 업로드 패널
            tab1, tab2, tab3 = st.tabs(["파일 업로드", "텍스트 입력", "예시 문서"])
            
            # 파일 업로드 탭
            with tab1:
                uploaded_file = st.file_uploader(
                    "네트워크 관련 문서 파일을 업로드하세요", 
                    type=["pdf", "docx", "pptx", "txt"]
                )
                
                if st.button("파일 처리", type="primary", key="process_file_btn"):
                    if uploaded_file:
                        with st.spinner("파일을 처리 중입니다..."):
                            try:
                                # 파일 저장
                                file_path = os.path.join(UPLOAD_DIR, uploaded_file.name)
                                with open(file_path, "wb") as f:
                                    f.write(uploaded_file.getbuffer())
                                
                                # 처리 및 DB에 추가
                                chunks = process_document(file_path)
                                if chunks:
                                    add_document_embeddings(chunks, {"source": uploaded_file.name})
                                    st.session_state.document_uploaded = True
                                    st.success(f"✅ '{uploaded_file.name}' 파일이 성공적으로 처리되었습니다!")
                                else:
                                    st.error("문서 처리 중 오류가 발생했습니다.")
                            except Exception as e:
                                st.error(f"파일 처리 중 오류: {str(e)}")
                    else:
                        st.warning("업로드할 파일을 선택해주세요.")
            
            # 텍스트 입력 탭
            with tab2:
                text_title = st.text_input("문서 제목", placeholder="문서 이름을 입력하세요")
                text_content = st.text_area(
                    "문서 내용", 
                    height=200,
                    placeholder="신한은행 내부 네트워크 관련 문서 내용을 붙여넣기 하세요..."
                )
                
                if st.button("텍스트 처리", type="primary", key="process_text_btn") and text_content:
                    with st.spinner("텍스트를 처리 중입니다..."):
                        try:
                            initialize_database()
                            
                            # 제목이 있으면 사용, 없으면 기본값 사용
                            doc_title = text_title if text_title else "사용자_입력_문서"
                            add_document_embeddings([text_content], metadata={"source": f"{doc_title}.txt"})
                            
                            st.session_state.document_uploaded = True
                            st.success("✅ 입력한 텍스트가 성공적으로 처리되었습니다!")
                        except Exception as e:
                            st.error(f"텍스트 처리 중 오류: {str(e)}")
            
            # 예시 문서 탭
            with tab3:
                st.info("신한은행 네트워크 관련 예시 문서를 사용할 수 있습니다.")
                
                if st.button("예시 문서 추가", type="primary", key="add_sample_doc"):
                    with st.spinner("예시 문서를 처리 중입니다..."):
                        try:
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
                            """
                            
                            initialize_database()
                            add_document_embeddings([sample_text], metadata={"source": "신한은행_네트워크_매뉴얼.txt"})
                            
                            st.session_state.document_uploaded = True
                            st.success("✅ 예시 문서가 성공적으로 추가되었습니다!")
                        except Exception as e:
                            st.error(f"문서 처리 중 오류: {str(e)}")
        
        # 쿼리 파라미터 제거
        st.query_params.clear()
    
    # 메인 채팅 인터페이스 표시
    st.markdown(create_chat_interface(), unsafe_allow_html=True)
    
    # 스트림릿 요소 숨기기
    st.markdown("""
    <style>
        section.main > div {
            padding: 0 !important;
        }
        div[data-testid="stToolbar"] {
            display: none !important;
        }
    </style>
    """, unsafe_allow_html=True)

if __name__ == "__main__":
    main()