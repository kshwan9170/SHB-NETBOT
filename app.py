import streamlit as st
import uuid
from pathlib import Path
import os

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
st.set_page_config(page_title="SHB-NetBot", layout="centered")

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = [
        {"role": "bot", "message": "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."}
    ]

st.title("🤖 SHB-NetBot")
st.markdown("신한은행 내부 네트워크 챗봇입니다. 네트워크 관련 질문을 입력해보세요.")

st.markdown("---")

# 말풍선 스타일 CSS 추가
st.markdown("""
<style>
.user-bubble {
    background-color: #0b57d0;
    color: white;
    padding: 10px 15px;
    border-radius: 20px;
    margin: 5px 0;
    align-self: flex-end;
    max-width: 70%;
    margin-left: auto;
}

.bot-bubble {
    background-color: #f1f3f4;
    padding: 10px 15px;
    border-radius: 20px;
    margin: 5px 0;
    align-self: flex-start;
    max-width: 70%;
    margin-right: auto;
}

.chat-container {
    display: flex;
    flex-direction: column;
}
</style>
""", unsafe_allow_html=True)

# 채팅 기록 출력
for chat in st.session_state.chat_history:
    bubble_class = "user-bubble" if chat["role"] == "user" else "bot-bubble"
    st.markdown(f'<div class="chat-container"><div class="{bubble_class}">{chat["message"]}</div></div>', unsafe_allow_html=True)

# 입력창
user_input = st.text_input("메시지를 입력하세요...", key="input")

# 전송 버튼
if st.button("보내기"):
    if user_input.strip() != "":
        # 사용자 입력 저장
        st.session_state.chat_history.append({"role": "user", "message": user_input})
        
        # 봇 응답 생성
        with st.spinner("응답 생성 중..."):
            db_status = get_database_status()
            
            if db_status["document_count"] > 0:
                # RAG 접근법 - 문서 검색 후 응답 생성
                similar_docs = search_similar_docs(user_input, top_k=3)
                context = "\n\n".join([doc.page_content for doc in similar_docs])
                
                response = get_chatbot_response(
                    user_input, 
                    context=context,
                    chat_history=get_chat_history([{"role": c["role"], "content": c["message"]} for c in st.session_state.chat_history], max_messages=5)
                )
            else:
                # 기본 응답 생성
                response = get_chatbot_response(
                    user_input,
                    chat_history=get_chat_history([{"role": c["role"], "content": c["message"]} for c in st.session_state.chat_history], max_messages=5)
                )
            
            # 봇 응답 추가
            st.session_state.chat_history.append({"role": "bot", "message": response})
            
        # 입력창 초기화 (자동으로 안되면 페이지 리로드)
        st.session_state.input = ""
        st.rerun()

# 문서 업로드 섹션 (접을 수 있는 형태로)
with st.expander("📄 문서 업로드"):
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