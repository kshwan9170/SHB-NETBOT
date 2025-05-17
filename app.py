import streamlit as st
import uuid
from pathlib import Path
import os
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
    page_icon="💬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "theme" not in st.session_state:
    st.session_state.theme = "light"  # 기본값: 라이트모드

# 테마 전환 기능
def toggle_theme():
    st.session_state.theme = "dark" if st.session_state.theme == "light" else "light"
    st.rerun()

# 초기 메시지 추가
if not st.session_state.chat_history:
    st.session_state.chat_history.append({
        "role": "assistant",
        "content": "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."
    })

# 사용자 정의 CSS
def get_custom_css():
    dark_mode = st.session_state.theme == "dark"
    
    # 다크모드/라이트모드 색상 설정
    if dark_mode:
        bg_color = "#1e1e2e"
        chat_bg = "#2a2b3c"
        text_color = "#e0e0e0"
        bot_bubble_bg = "#383a56"
        user_bubble_bg = "#0b57d0"
        border_color = "#3d3d5c"
        input_bg = "#2a2b3c"
        input_border = "#3d3d5c"
    else:
        bg_color = "#f7f7f8"
        chat_bg = "#ffffff"
        text_color = "#343541"
        bot_bubble_bg = "#f1f3f4"
        user_bubble_bg = "#0b57d0"
        border_color = "#e5e5e7"
        input_bg = "#ffffff"
        input_border = "#e5e5e7"
    
    return f"""
    <style>
        /* 기본 스타일 재설정 */
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: {bg_color};
            color: {text_color};
            transition: all 0.3s ease;
            margin: 0;
            padding: 0;
        }}
        
        /* Streamlit 요소 숨김 */
        .stApp header {{
            display: none !important;
        }}
        
        footer {{
            display: none !important;
        }}
        
        .main .block-container {{
            padding: 0 !important;
            max-width: 100% !important;
        }}
        
        /* 채팅 앱 컨테이너 */
        .chat-container {{
            max-width: 800px;
            margin: 0 auto;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: {chat_bg};
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }}
        
        /* 채팅 헤더 */
        .chat-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background-color: {chat_bg};
            border-bottom: 1px solid {border_color};
            position: sticky;
            top: 0;
            z-index: 100;
        }}
        
        .chat-title {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .chat-title h1 {{
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
        }}
        
        .bot-logo {{
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: #0052cc;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }}
        
        .theme-button {{
            background: none;
            border: none;
            color: {text_color};
            font-size: 1.2em;
            cursor: pointer;
            padding: 5px 10px;
            border-radius: 5px;
        }}
        
        .theme-button:hover {{
            background-color: rgba(0, 0, 0, 0.05);
        }}
        
        /* 메시지 스타일 */
        .chat-area {{
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }}
        
        .bot-message {{
            background-color: {bot_bubble_bg};
            color: {text_color};
            padding: 16px;
            border-radius: 10px 10px 10px 0;
            margin-right: 50px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            line-height: 1.5;
            position: relative;
        }}
        
        .user-message {{
            background-color: {user_bubble_bg};
            color: white;
            padding: 16px;
            border-radius: 10px 10px 0 10px;
            margin-left: 50px;
            align-self: flex-end;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            line-height: 1.5;
        }}
        
        /* 입력 영역 */
        .input-area {{
            padding: 16px 20px;
            background-color: {chat_bg};
            border-top: 1px solid {border_color};
            position: sticky;
            bottom: 0;
            z-index: 100;
        }}
        
        .input-box {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .input-field {{
            flex: 1;
            padding: 12px 16px;
            border: 1px solid {input_border};
            border-radius: 24px;
            background-color: {input_bg};
            color: {text_color};
            font-size: 1rem;
            outline: none;
            resize: none;
            transition: all 0.2s;
        }}
        
        .input-field:focus {{
            border-color: #0b57d0;
            box-shadow: 0 0 0 2px rgba(11, 87, 208, 0.2);
        }}
        
        .send-button {{
            background-color: #0b57d0;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }}
        
        .send-button:hover {{
            background-color: #0948ae;
        }}
        
        /* 업로드 스타일 */
        .upload-panel {{
            background-color: {chat_bg};
            border: 1px solid {border_color};
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }}
        
        /* 모바일 대응 */
        @media (max-width: 768px) {{
            .bot-message, .user-message {{
                max-width: 85%;
            }}
        }}
    </style>
    """

# 주요 기능
def main():
    # CSS 스타일 적용
    st.markdown(get_custom_css(), unsafe_allow_html=True)
    
    # 헤더 HTML
    theme_icon = "🌙" if st.session_state.theme == "light" else "☀️"
    
    st.markdown(f"""
    <div class="chat-container">
        <div class="chat-header">
            <div class="chat-title">
                <div class="bot-logo">S</div>
                <h1>SHB-NetBot</h1>
            </div>
            <button class="theme-button" id="theme-toggle">{theme_icon}</button>
        </div>
        
        <div class="chat-area" id="chat-area">
    """, unsafe_allow_html=True)
    
    # 메시지 출력
    for message in st.session_state.chat_history:
        role = message["role"]
        content = message["content"]
        
        if role == "user":
            st.markdown(f'<div class="user-message">{content}</div>', unsafe_allow_html=True)
        else:
            st.markdown(f'<div class="bot-message">{content}</div>', unsafe_allow_html=True)
    
    # 입력 영역
    st.markdown("""
        </div>
        
        <div class="input-area">
            <form id="chat-form">
                <div class="input-box">
                    <input type="text" class="input-field" id="message-input" placeholder="메시지를 입력하세요...">
                    <button type="submit" class="send-button">➤</button>
                </div>
            </form>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # 자바스크립트
    st.markdown("""
    <script>
        // 테마 토글 기능
        document.getElementById('theme-toggle').addEventListener('click', function() {
            const form = document.createElement('form');
            form.method = 'POST';
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'toggle_theme';
            input.value = 'true';
            
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        });
        
        // 폼 제출 처리
        document.getElementById('chat-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const messageInput = document.getElementById('message-input');
            const message = messageInput.value.trim();
            
            if (message) {
                // 폼 제출
                const form = document.createElement('form');
                form.method = 'POST';
                
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'user_message';
                input.value = message;
                
                form.appendChild(input);
                document.body.appendChild(form);
                
                // 입력창 초기화
                messageInput.value = '';
                
                // 제출
                form.submit();
            }
        });
        
        // 채팅창 자동 스크롤
        function scrollToBottom() {
            const chatArea = document.getElementById('chat-area');
            chatArea.scrollTop = chatArea.scrollHeight;
        }
        
        // 페이지 로드 시 스크롤
        window.onload = function() {
            scrollToBottom();
        }
    </script>
    """, unsafe_allow_html=True)
    
    # 폼 데이터 처리
    if "toggle_theme" in st.query_params:
        toggle_theme()
        st.query_params.clear()
        st.rerun()
    
    # 사용자 메시지 처리
    if "user_message" in st.query_params:
        user_message = st.query_params["user_message"][0]
        
        # 사용자 메시지 추가
        st.session_state.chat_history.append({
            "role": "user", 
            "content": user_message
        })
        
        # 응답 생성
        with st.spinner("응답 생성 중..."):
            db_status = get_database_status()
            
            if db_status["document_count"] > 0:
                # RAG 접근법 - 문서 검색 후 응답 생성
                similar_docs = search_similar_docs(user_message, top_k=3)
                context = "\n\n".join([doc.page_content for doc in similar_docs])
                
                response = get_chatbot_response(
                    user_message, 
                    context=context,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            else:
                # 기본 응답 생성
                response = get_chatbot_response(
                    user_message,
                    chat_history=get_chat_history(st.session_state.chat_history, max_messages=5)
                )
            
            # 봇 응답 추가
            st.session_state.chat_history.append({
                "role": "assistant", 
                "content": response
            })
        
        # 쿼리 파라미터 초기화 후 페이지 리로드
        st.query_params.clear()
        st.rerun()

if __name__ == "__main__":
    main()