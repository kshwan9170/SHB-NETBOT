import streamlit as st
import uuid
from pathlib import Path
import os
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

# 테마 전환 함수
def toggle_theme():
    if st.session_state.theme == "light":
        st.session_state.theme = "dark"
    else:
        st.session_state.theme = "light"
    st.rerun()

# 타이핑 효과 함수
def simulate_typing():
    st.session_state.typing = True
    time.sleep(0.5)  # 타이핑 시뮬레이션
    st.session_state.typing = False

# 봇 아이콘 SVG
def bot_icon(color="#0046FF"):
    return f"""
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="{color}" opacity="0.2"/>
        <path d="M16 8.5C11.8579 8.5 8.5 11.8579 8.5 16C8.5 20.1421 11.8579 23.5 16 23.5C20.1421 23.5 23.5 20.1421 23.5 16C23.5 11.8579 20.1421 8.5 16 8.5Z" fill="{color}"/>
        <circle cx="13" cy="14.5" r="1.5" fill="white"/>
        <circle cx="19" cy="14.5" r="1.5" fill="white"/>
        <path d="M12 18.5C12 18.5 13.5 20 16 20C18.5 20 20 18.5 20 18.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 13C8 13 9 9 13 8M24 13C24 13 23 9 19 8" stroke="{color}" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    """

# CSS 스타일 (Tailwind 스타일 느낌)
css = f"""
<style>
    /* 기본 스타일 재설정 */
    * {{
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }}
    
    /* 스크롤바 스타일 */
    ::-webkit-scrollbar {{
        width: 6px;
        height: 6px;
    }}
    
    ::-webkit-scrollbar-track {{
        background: transparent;
    }}
    
    ::-webkit-scrollbar-thumb {{
        background-color: rgba(0, 70, 255, 0.3);
        border-radius: 10px;
    }}
    
    [data-theme="dark"] ::-webkit-scrollbar-thumb {{
        background-color: rgba(255, 255, 255, 0.2);
    }}
    
    /* 메인 컨테이너 */
    .main-container {{
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 0;
        overflow: hidden;
        background-color: #f8f9fa;
        transition: background-color 0.3s ease;
    }}
    
    [data-theme="dark"] .main-container {{
        background-color: #1a1b26;
    }}
    
    /* 카드 컨테이너 */
    .card-container {{
        max-width: 800px;
        width: 100%;
        margin: 20px auto;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        background-color: white;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: calc(100vh - 40px);
        position: relative;
        transition: box-shadow 0.3s ease, background-color 0.3s ease;
    }}
    
    [data-theme="dark"] .card-container {{
        background-color: #24283b;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }}
    
    /* 헤더 스타일 */
    .header {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        background-color: white;
        border-bottom: 1px solid #e6e6e6;
        transition: background-color 0.3s ease, border-color 0.3s ease;
    }}
    
    [data-theme="dark"] .header {{
        background-color: #24283b;
        border-bottom: 1px solid #32374a;
    }}
    
    .logo-container {{
        display: flex;
        align-items: center;
        gap: 10px;
    }}
    
    .app-title {{
        font-size: 1.2rem;
        font-weight: 600;
        color: #333;
        transition: color 0.3s ease;
    }}
    
    [data-theme="dark"] .app-title {{
        color: #e1e2e6;
    }}
    
    /* 테마 스위치 */
    .theme-switch {{
        position: relative;
        display: inline-block;
        width: 48px;
        height: 24px;
    }}
    
    .theme-switch input {{
        opacity: 0;
        width: 0;
        height: 0;
    }}
    
    .switch-slider {{
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #e6e6e6;
        transition: .4s;
        border-radius: 24px;
    }}
    
    .switch-slider:before {{
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }}
    
    input:checked + .switch-slider {{
        background-color: #0046FF;
    }}
    
    input:checked + .switch-slider:before {{
        transform: translateX(24px);
    }}
    
    /* 채팅 영역 */
    .chat-container {{
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 15px;
        transition: background-color 0.3s ease;
    }}
    
    [data-theme="dark"] .chat-container {{
        background-color: #1a1b26;
    }}
    
    /* 메시지 스타일 */
    .message {{
        display: flex;
        gap: 10px;
        max-width: 80%;
        animation: fadeIn 0.3s ease;
    }}
    
    @keyframes fadeIn {{
        from {{ opacity: 0; transform: translateY(10px); }}
        to {{ opacity: 1; transform: translateY(0); }}
    }}
    
    .user-message {{
        align-self: flex-end;
        flex-direction: row-reverse;
    }}
    
    .bot-message {{
        align-self: flex-start;
    }}
    
    .avatar {{
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }}
    
    .user-avatar {{
        background-color: #0046FF;
        color: white;
        font-weight: bold;
    }}
    
    .message-bubble {{
        padding: 12px 16px;
        border-radius: 18px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        line-height: 1.5;
        transition: background-color 0.3s ease, color 0.3s ease;
    }}
    
    .user-bubble {{
        background-color: #0046FF;
        color: white;
        border-bottom-right-radius: 4px;
    }}
    
    .bot-bubble {{
        background-color: #f1f3f5;
        color: #333;
        border-bottom-left-radius: 4px;
    }}
    
    [data-theme="dark"] .bot-bubble {{
        background-color: #32374a;
        color: #e1e2e6;
    }}
    
    /* 입력 영역 */
    .input-container {{
        padding: 16px;
        border-top: 1px solid #e6e6e6;
        background-color: white;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background-color 0.3s ease, border-color 0.3s ease;
    }}
    
    [data-theme="dark"] .input-container {{
        background-color: #24283b;
        border-top: 1px solid #32374a;
    }}
    
    .input-field {{
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #e6e6e6;
        border-radius: 24px;
        outline: none;
        font-size: 0.95rem;
        transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease;
    }}
    
    .input-field:focus {{
        border-color: #0046FF;
    }}
    
    [data-theme="dark"] .input-field {{
        background-color: #32374a;
        border-color: #444b6a;
        color: #e1e2e6;
    }}
    
    .send-button {{
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-color: #0046FF;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: background-color 0.3s ease;
    }}
    
    .send-button:hover {{
        background-color: #003cc6;
    }}
    
    /* 타이핑 인디케이터 */
    .typing-indicator {{
        display: flex;
        align-items: center;
        gap: 4px;
    }}
    
    .typing-dot {{
        width: 6px;
        height: 6px;
        background-color: #aaa;
        border-radius: 50%;
        animation: typing-bounce 1.4s infinite;
    }}
    
    .typing-dot:nth-child(2) {{
        animation-delay: 0.2s;
    }}
    
    .typing-dot:nth-child(3) {{
        animation-delay: 0.4s;
    }}
    
    @keyframes typing-bounce {{
        0%, 100% {{ transform: translateY(0); }}
        50% {{ transform: translateY(-5px); }}
    }}
    
    /* 업로드 영역 */
    .upload-button {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background-color: #f1f3f5;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background-color 0.3s ease, color 0.3s ease;
    }}
    
    [data-theme="dark"] .upload-button {{
        background-color: #32374a;
        color: #e1e2e6;
    }}
    
    .upload-button:hover {{
        background-color: #e9ecef;
    }}
    
    [data-theme="dark"] .upload-button:hover {{
        background-color: #444b6a;
    }}
    
    /* 유틸리티 클래스 */
    .hide-native {{
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }}
    
    /* 미디어 쿼리 */
    @media (max-width: 640px) {{
        .card-container {{
            margin: 0;
            height: 100vh;
            border-radius: 0;
        }}
    }}
</style>
"""

# HTML 레이아웃
def main_layout():
    theme_js = f"""
    <script>
        document.body.setAttribute('data-theme', '{st.session_state.theme}');
    </script>
    """
    
    # 현재 테마에 따른 체크 상태
    checked = "checked" if st.session_state.theme == "dark" else ""
    
    # 메인 컨테이너
    html = f"""
    {theme_js}
    <div class="main-container">
        <div class="card-container">
            <!-- 헤더 -->
            <div class="header">
                <div class="logo-container">
                    {bot_icon()}
                    <div class="app-title">SH-NetBot</div>
                </div>
                <label class="theme-switch">
                    <input type="checkbox" id="theme-toggle" {checked}>
                    <span class="switch-slider"></span>
                </label>
            </div>
            
            <!-- 채팅 영역 -->
            <div class="chat-container" id="chat-container">
    """
    
    # 메시지 출력
    if st.session_state.chat_history:
        for message in st.session_state.chat_history:
            role = message["role"]
            content = message["content"]
            
            if role == "user":
                html += f"""
                <div class="message user-message">
                    <div class="message-bubble user-bubble">{content}</div>
                    <div class="avatar user-avatar">U</div>
                </div>
                """
            else:
                html += f"""
                <div class="message bot-message">
                    <div class="avatar">{bot_icon()}</div>
                    <div class="message-bubble bot-bubble">{content}</div>
                </div>
                """
    else:
        # 첫 방문 시 환영 메시지
        welcome_msg = "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."
        html += f"""
        <div class="message bot-message">
            <div class="avatar">{bot_icon()}</div>
            <div class="message-bubble bot-bubble">{welcome_msg}</div>
        </div>
        """
        st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})
    
    # 타이핑 중 표시
    if st.session_state.typing:
        html += f"""
        <div class="message bot-message">
            <div class="avatar">{bot_icon()}</div>
            <div class="message-bubble bot-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
        """
    
    # 하단 입력 영역
    html += """
            </div>
            
            <!-- 입력 영역 -->
            <div class="input-container">
                <span class="upload-button" id="upload-button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM13 7H11V11H7V13H11V17H13V13H17V11H13V7Z" fill="currentColor"/>
                    </svg>
                    문서
                </span>
                <input type="text" class="input-field" id="message-input" placeholder="메시지를 입력하세요...">
                <div class="send-button" id="send-button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="white"/>
                    </svg>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // 테마 토글 기능
        document.getElementById('theme-toggle').addEventListener('change', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            const input = document.createElement('input');
            input.name = 'theme_toggle';
            input.value = 'toggle';
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 메시지 전송 기능
        document.getElementById('send-button').addEventListener('click', function() {
            sendMessage();
        });
        
        document.getElementById('message-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        function sendMessage() {
            const messageInput = document.getElementById('message-input');
            const message = messageInput.value.trim();
            
            if (message) {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '';
                const input = document.createElement('input');
                input.name = 'user_message';
                input.value = message;
                form.appendChild(input);
                document.body.appendChild(form);
                messageInput.value = '';
                form.submit();
            }
        }
        
        // 채팅 영역 자동 스크롤
        const chatContainer = document.getElementById('chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // 업로드 버튼 기능
        document.getElementById('upload-button').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            const input = document.createElement('input');
            input.name = 'show_upload';
            input.value = 'true';
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
    </script>
    """
    
    return html

# Streamlit 앱
st.markdown(css, unsafe_allow_html=True)

# 메시지 입력 처리
if "user_message" in st.query_params:
    user_message = st.query_params["user_message"][0]
    st.session_state.chat_history.append({"role": "user", "content": user_message})
    
    # 타이핑 표시 활성화
    st.session_state.typing = True
    
    # 봇 응답 생성 및 표시
    db_status = get_database_status()
    if db_status["document_count"] > 0:
        # RAG approach - search for relevant docs and then ask GPT
        similar_docs = search_similar_docs(user_message, top_k=3)
        context = "\n\n".join([doc.page_content for doc in similar_docs])
        
        response = get_chatbot_response(
            user_message, 
            context=context,
            chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
        )
    else:
        # No documents in DB yet, just use GPT
        response = get_chatbot_response(
            user_message,
            chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
        )
    
    # 봇 응답을 채팅 기록에 추가
    st.session_state.chat_history.append({"role": "assistant", "content": response})
    
    # 타이핑 표시 비활성화
    st.session_state.typing = False
    
    # 쿼리 파라미터 제거 후 리다이렉트
    st.query_params.clear()

# 테마 토글 처리
if "theme_toggle" in st.query_params:
    toggle_theme()
    st.query_params.clear()

# 업로드 다이얼로그 표시
if "show_upload" in st.query_params:
    with st.expander("문서 업로드", expanded=True):
        # 탭 구성
        tabs = st.tabs(["텍스트 입력", "파일 업로드", "예시 문서"])
        
        # 텍스트 입력 탭
        with tabs[0]:
            text_title = st.text_input("문서 제목", placeholder="문서 이름을 입력하세요")
            text_input = st.text_area(
                "직접 문서 입력",
                height=150,
                placeholder="여기에 참고할 문서 내용을 붙여넣기 하세요..."
            )
            
            if st.button("텍스트 처리하기", type="primary") and text_input:
                with st.spinner("텍스트 처리 중..."):
                    try:
                        # 텍스트 처리
                        texts = [text_input]
                        initialize_database()
                        
                        # 제목이 있으면 사용, 없으면 기본값 사용
                        doc_title = text_title if text_title else "사용자_입력_문서"
                        add_document_embeddings(texts, metadata={"source": f"{doc_title}.txt"})
                        
                        st.session_state.document_uploaded = True
                        st.success("✅ 입력하신 텍스트가 성공적으로 처리되었습니다!")
                    except Exception as e:
                        st.error(f"❌ 텍스트 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 파일 업로드 탭
        with tabs[1]:
            uploaded_file = st.file_uploader(
                "문서 파일 선택", 
                type=["pdf", "docx", "pptx", "txt"]
            )
            
            if st.button("파일 처리하기", type="primary") and uploaded_file:
                with st.spinner("파일을 처리 중입니다..."):
                    try:
                        # 임시 파일로 저장
                        file_path = os.path.join(UPLOAD_DIR, uploaded_file.name)
                        with open(file_path, "wb") as f:
                            f.write(uploaded_file.getbuffer())
                        
                        # 처리 및 DB에 추가
                        chunks = process_document(file_path)
                        if chunks:
                            add_document_embeddings(chunks, {"source": uploaded_file.name})
                            st.session_state.document_uploaded = True
                            st.success(f"✅ 파일 '{uploaded_file.name}'이(가) 성공적으로 처리되었습니다!")
                        else:
                            st.error("❌ 문서 처리 중 오류가 발생했습니다.")
                    except Exception as e:
                        st.error(f"❌ 파일 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 예시 문서 탭
        with tabs[2]:
            if st.button("예시 문서 사용하기", type="primary"):
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
                """
                
                with st.spinner("예시 문서를 처리 중입니다..."):
                    try:
                        # 문서 처리
                        texts = [sample_text]
                        initialize_database()
                        add_document_embeddings(texts, metadata={"source": "신한은행_네트워크_매뉴얼.txt"})
                        
                        st.session_state.document_uploaded = True
                        st.success("✅ 예시 문서가 성공적으로 처리되었습니다!")
                    except Exception as e:
                        st.error(f"❌ 문서 처리 중 오류가 발생했습니다: {str(e)}")
    
    # 쿼리 파라미터 제거 후 리다이렉트
    st.query_params.clear()

# 메인 인터페이스 출력
st.markdown(main_layout(), unsafe_allow_html=True)

# 네이티브 입력 필드 숨기기 (HTML/JS로 대체)
st.markdown("""
<style>
    section.main > div:has(div.element-container) {
        padding-top: 0 !important;
        padding-right: 0 !important;
        padding-left: 0 !important;
        padding-bottom: 0 !important;
    }
    .stApp > header {
        display: none !important;
    }
    
    /* 푸터 제거 */
    footer {
        display: none !important;
    }
    
    /* 마진 제거 */
    .block-container {
        padding-top: 0 !important;
        padding-right: 0 !important;
        padding-left: 0 !important;
        padding-bottom: 0 !important;
        max-width: 100% !important;
    }
</style>
""", unsafe_allow_html=True)