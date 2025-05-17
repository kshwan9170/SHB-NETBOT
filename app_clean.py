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
    page_title="SHB-NetBot",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "theme" not in st.session_state:
    st.session_state.theme = "light"
if "show_upload" not in st.session_state:
    st.session_state.show_upload = False

# 테마 전환
def toggle_theme():
    st.session_state.theme = "dark" if st.session_state.theme == "light" else "light"
    st.rerun()

# 채팅 메시지 추가 함수
def add_message(role, content):
    st.session_state.chat_history.append({
        "role": role,
        "content": content,
        "time": datetime.now().strftime("%H:%M")
    })

# 초기 환영 메시지
if not st.session_state.chat_history:
    add_message("assistant", "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요.")

# CSS 스타일
def get_theme_css():
    if st.session_state.theme == "dark":
        return {
            "bg_color": "#1E1E2E",
            "panel_bg": "#2A2B3C",
            "text_color": "#E0E0E0",
            "border_color": "#3D3D5C",
            "user_bubble": "#3F6ABF",
            "bot_bubble": "#383A56",
            "input_bg": "#2A2B3C",
            "input_border": "#3D3D5C",
            "btn_bg": "#3F6ABF",
            "btn_hover": "#2E5CB8",
            "shadow": "rgba(0, 0, 0, 0.2)"
        }
    else:
        return {
            "bg_color": "#F7F7F8",
            "panel_bg": "#FFFFFF",
            "text_color": "#343541",
            "border_color": "#E5E5E7",
            "user_bubble": "#0B57D0",
            "bot_bubble": "#F0F0F5",
            "input_bg": "#FFFFFF",
            "input_border": "#E5E5E7",
            "btn_bg": "#0B57D0",
            "btn_hover": "#0948AE",
            "shadow": "rgba(0, 0, 0, 0.1)"
        }

# 메인 앱 UI
def main():
    theme = get_theme_css()
    
    # 스타일 적용
    st.markdown(f"""
    <style>
        /* 전체 스타일 */
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: {theme['bg_color']};
            color: {theme['text_color']};
            margin: 0;
            padding: 0;
        }}
        
        /* Streamlit 기본 요소 숨기기 */
        .stApp header {{
            display: none !important;
        }}
        
        .main .block-container {{
            padding: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
        }}
        
        footer {{
            display: none !important;
        }}
        
        .stDeployButton {{
            display: none !important;
        }}
        
        /* 레이아웃 컨테이너 */
        .chat-app {{
            max-width: 1000px;
            margin: 0 auto;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: {theme['panel_bg']};
            box-shadow: 0 0 20px {theme['shadow']};
        }}
        
        /* 헤더 */
        .chat-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px 20px;
            background-color: {theme['panel_bg']};
            border-bottom: 1px solid {theme['border_color']};
            box-shadow: 0 2px 5px {theme['shadow']};
            z-index: 10;
        }}
        
        .chat-title {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .chat-title h1 {{
            font-size: 1.4rem;
            font-weight: 600;
            margin: 0;
            color: {theme['text_color']};
        }}
        
        .bot-avatar {{
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #0052CC;
            color: white;
            font-weight: bold;
            font-size: 1.2rem;
        }}
        
        .theme-toggle {{
            background: transparent;
            border: none;
            color: {theme['text_color']};
            cursor: pointer;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
        }}
        
        .theme-toggle:hover {{
            background-color: rgba(0, 0, 0, 0.05);
        }}
        
        /* 메시지 컨테이너 */
        .chat-messages {{
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }}
        
        /* 메시지 스타일 */
        .message {{
            display: flex;
            align-items: flex-start;
            gap: 10px;
            max-width: 80%;
        }}
        
        .user-message {{
            margin-left: auto;
            flex-direction: row-reverse;
        }}
        
        .message-bubble {{
            padding: 12px 16px;
            border-radius: 18px;
            box-shadow: 0 1px 5px {theme['shadow']};
            line-height: 1.5;
            position: relative;
        }}
        
        .user-bubble {{
            background-color: {theme['user_bubble']};
            color: white;
            border-bottom-right-radius: 4px;
        }}
        
        .bot-bubble {{
            background-color: {theme['bot_bubble']};
            color: {theme['text_color']};
            border-bottom-left-radius: 4px;
        }}
        
        .message-time {{
            font-size: 0.75rem;
            color: #8E8EA0;
            margin-top: 4px;
            text-align: right;
        }}
        
        .user-message .message-time {{
            text-align: left;
        }}
        
        /* 입력 영역 */
        .chat-input-container {{
            padding: 16px 20px;
            background-color: {theme['panel_bg']};
            border-top: 1px solid {theme['border_color']};
            box-shadow: 0 -2px 5px {theme['shadow']};
        }}
        
        .chat-input-box {{
            display: flex;
            align-items: center;
            background-color: {theme['input_bg']};
            border: 1px solid {theme['input_border']};
            border-radius: 24px;
            padding: 8px 16px;
            gap: 10px;
        }}
        
        .chat-input {{
            flex: 1;
            border: none;
            background: transparent;
            padding: 8px 0;
            outline: none;
            resize: none;
            font-size: 1rem;
            color: {theme['text_color']};
        }}
        
        .send-button {{
            background-color: {theme['btn_bg']};
            color: white;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }}
        
        .send-button:hover {{
            background-color: {theme['btn_hover']};
        }}
        
        /* 메시지 내용 스타일링 */
        .message-content p {{
            margin: 0 0 10px 0;
        }}
        
        .message-content p:last-child {{
            margin-bottom: 0;
        }}
        
        .message-content ul, .message-content ol {{
            margin: 10px 0;
            padding-left: 20px;
        }}
        
        .message-content code {{
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            background-color: rgba(0, 0, 0, 0.05);
            border-radius: 3px;
            padding: 2px 4px;
            font-size: 0.9em;
        }}
        
        .message-content pre {{
            background-color: rgba(0, 0, 0, 0.05);
            border-radius: 5px;
            padding: 12px;
            overflow-x: auto;
            margin: 10px 0;
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
            background-color: #8E8EA0;
            animation: typing-bounce 1.4s infinite ease-in-out;
        }}
        
        .typing-dot:nth-child(1) {{ animation-delay: 0s; }}
        .typing-dot:nth-child(2) {{ animation-delay: 0.2s; }}
        .typing-dot:nth-child(3) {{ animation-delay: 0.4s; }}
        
        @keyframes typing-bounce {{
            0%, 100% {{ transform: translateY(0); }}
            50% {{ transform: translateY(-5px); }}
        }}
        
        /* 업로드 패널 */
        .upload-panel {{
            background-color: {theme['panel_bg']};
            border: 1px solid {theme['border_color']};
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            box-shadow: 0 2px 8px {theme['shadow']};
        }}
        
        .upload-panel h3 {{
            margin-top: 0;
            margin-bottom: 16px;
            font-size: 1.1rem;
            color: {theme['text_color']};
        }}
        
        /* 반응형 */
        @media (max-width: 768px) {{
            .message {{
                max-width: 90%;
            }}
            
            .chat-header h1 {{
                font-size: 1.2rem;
            }}
        }}
    </style>
    """, unsafe_allow_html=True)
    
    # 메인 앱 레이아웃
    st.markdown("""
    <div class="chat-app">
        <div class="chat-header">
            <div class="chat-title">
                <div class="bot-avatar">S</div>
                <h1>SHB-NetBot</h1>
            </div>
            <button class="theme-toggle" id="theme-toggle">
                🌙
            </button>
        </div>
        
        <div class="chat-messages" id="chat-messages">
    """, unsafe_allow_html=True)
    
    # 메시지 출력
    for message in st.session_state.chat_history:
        role = message["role"]
        content = message["content"]
        time = message.get("time", "")
        
        if role == "user":
            st.markdown(f"""
            <div class="message user-message">
                <div class="message-content">
                    <div class="message-bubble user-bubble">{content}</div>
                    <div class="message-time">{time}</div>
                </div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(f"""
            <div class="message">
                <div class="bot-avatar">S</div>
                <div class="message-content">
                    <div class="message-bubble bot-bubble">{content}</div>
                    <div class="message-time">{time}</div>
                </div>
            </div>
            """, unsafe_allow_html=True)
    
    # 입력 영역
    st.markdown("""
        </div>
        
        <div class="chat-input-container">
            <form id="chat-form">
                <div class="chat-input-box">
                    <textarea class="chat-input" id="user-input" placeholder="메시지를 입력하세요..." rows="1"></textarea>
                    <button type="submit" class="send-button">➤</button>
                </div>
            </form>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # 자바스크립트
    st.markdown(f"""
    <script>
        // 테마 토글 기능
        document.getElementById('theme-toggle').addEventListener('click', function() {{
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
        }});
        
        // 폼 제출 처리
        document.getElementById('chat-form').addEventListener('submit', function(e) {{
            e.preventDefault();
            
            const input = document.getElementById('user-input');
            const message = input.value.trim();
            
            if (message) {{
                // 폼 제출 준비
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '';
                
                const messageInput = document.createElement('input');
                messageInput.type = 'hidden';
                messageInput.name = 'user_message';
                messageInput.value = message;
                
                form.appendChild(messageInput);
                document.body.appendChild(form);
                
                // 입력창 초기화
                input.value = '';
                
                // 폼 제출
                form.submit();
            }}
        }});
        
        // 채팅창 자동 스크롤
        function scrollToBottom() {{
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }}
        
        // 페이지 로드 시 스크롤
        window.onload = function() {{
            scrollToBottom();
            
            // 입력창 자동 조절
            const textarea = document.getElementById('user-input');
            textarea.addEventListener('input', function() {{
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            }});
        }};
        
        // 테마 아이콘 설정
        document.getElementById('theme-toggle').innerText = 
            '{("🌞" if st.session_state.theme == "dark" else "🌙")}';
    </script>
    """, unsafe_allow_html=True)
    
    # 업로드 패널 토글
    if st.session_state.show_upload:
        with st.expander("문서 업로드", expanded=True):
            col1, col2 = st.columns(2)
            
            with col1:
                uploaded_file = st.file_uploader("네트워크 관련 문서 파일", type=["pdf", "docx", "pptx", "txt"])
                
                if st.button("파일 업로드", type="primary"):
                    if uploaded_file:
                        with st.spinner("처리 중..."):
                            try:
                                file_path = os.path.join(UPLOAD_DIR, uploaded_file.name)
                                with open(file_path, "wb") as f:
                                    f.write(uploaded_file.getbuffer())
                                
                                chunks = process_document(file_path)
                                if chunks:
                                    add_document_embeddings(chunks, {"source": uploaded_file.name})
                                    st.success(f"✅ '{uploaded_file.name}' 파일이 성공적으로 처리되었습니다.")
                                else:
                                    st.error("❌ 문서 처리 중 오류가 발생했습니다.")
                            except Exception as e:
                                st.error(f"❌ 오류: {str(e)}")
                    else:
                        st.warning("⚠️ 파일을 선택해주세요.")
            
            with col2:
                text_input = st.text_area("직접 입력", height=150, placeholder="신한은행 네트워크 관련 문서 내용을 여기에 붙여넣기하세요...")
                
                if st.button("텍스트 처리", type="primary"):
                    if text_input:
                        with st.spinner("처리 중..."):
                            try:
                                initialize_database()
                                add_document_embeddings([text_input], metadata={"source": "사용자_입력_문서.txt"})
                                st.success("✅ 텍스트가 성공적으로 처리되었습니다.")
                            except Exception as e:
                                st.error(f"❌ 오류: {str(e)}")
                    else:
                        st.warning("⚠️ 텍스트를 입력해주세요.")
    
    # POST 파라미터 처리
    if "user_message" in st.query_params:
        user_message = st.query_params.get("user_message")[0]
        add_message("user", user_message)
        
        # 답변 생성
        with st.spinner("대답을 생성하는 중..."):
            db_status = get_database_status()
            
            if db_status["document_count"] > 0:
                # RAG 접근법
                similar_docs = search_similar_docs(user_message, top_k=3)
                context = "\n\n".join([doc.page_content for doc in similar_docs])
                
                response = get_chatbot_response(
                    user_message, 
                    context=context,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            else:
                # 일반 생성
                response = get_chatbot_response(
                    user_message,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            
            add_message("assistant", response)
        
        # 쿼리 파라미터 제거 후 리로드
        st.query_params.clear()
        st.rerun()
    
    # 테마 토글 처리
    if "toggle_theme" in st.query_params:
        toggle_theme()
        st.query_params.clear()
        st.rerun()
    
    # 업로드 패널 토글 처리
    if "toggle_upload" in st.query_params:
        st.session_state.show_upload = not st.session_state.show_upload
        st.query_params.clear()
        st.rerun()

if __name__ == "__main__":
    main()