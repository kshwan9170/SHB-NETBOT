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

# 신한은행 테마 색상
SHINHAN_BLUE = "#0046FF"

# 페이지 설정
st.set_page_config(
    page_title="SHB-NetBot",
    page_icon="💬",
    layout="centered"
)

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "document_uploaded" not in st.session_state:
    st.session_state.document_uploaded = False
if "current_tab" not in st.session_state:
    st.session_state.current_tab = "chat"

# 모던 UI를 위한 CSS
st.markdown("""
<style>
    /* 전체 페이지 스타일 */
    .main {
        background-color: #f8f9fa;
    }
    
    /* 헤더 스타일 */
    .header-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem 0;
        background-color: white;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        margin-bottom: 1.5rem;
    }
    
    h1 {
        color: #0046FF;
        font-size: 2.2rem;
        margin-bottom: 0.5rem;
    }
    
    .subheader {
        color: #666;
        font-size: 1.1rem;
        margin-bottom: 1rem;
    }
    
    /* 탭 스타일 */
    .tab-container {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
        padding-bottom: 0.5rem;
    }
    
    .tab {
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .tab-active {
        background-color: #0046FF;
        color: white;
    }
    
    .tab-inactive {
        background-color: #f0f0f0;
        color: #666;
    }
    
    .tab-inactive:hover {
        background-color: #e6e6e6;
    }
    
    /* 채팅 메시지 스타일 */
    .chat-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    
    .message {
        padding: 1rem;
        border-radius: 12px;
        line-height: 1.5;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        position: relative;
        font-size: 16px;
    }
    
    .user-message {
        background-color: #f0f2f6;
        border: 1px solid #e0e0e0;
        align-self: flex-end;
        margin-left: 2rem;
    }
    
    .bot-message {
        background-color: #0046FF;
        color: white;
        align-self: flex-start;
        margin-right: 2rem;
    }
    
    /* 문서 관리 스타일 */
    .document-container {
        background-color: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        margin-bottom: 1.5rem;
    }
    
    .document-header {
        color: #0046FF;
        font-size: 1.3rem;
        margin-bottom: 1rem;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.5rem;
    }
    
    .info-box {
        background-color: #f0f8ff;
        border-left: 3px solid #0046FF;
        padding: 0.8rem;
        margin-bottom: 1rem;
        border-radius: 4px;
    }
    
    /* 상태 카드 */
    .status-container {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    
    .status-card {
        flex: 1;
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        background-color: #f8f9fa;
        border: 1px solid #eee;
    }
    
    .status-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: #0046FF;
    }
    
    .status-label {
        font-size: 0.9rem;
        color: #666;
    }
</style>
""", unsafe_allow_html=True)

# 헤더 섹션
st.markdown("""
<div class="header-container">
    <h1>SHB-NetBot</h1>
    <div class="subheader">신한은행 사용자 내부 통신 관련 문의 FAQ 챗봇</div>
    
    <div class="tab-container">
        <div class="tab tab-active" id="chat-tab">대화하기</div>
        <div class="tab tab-inactive" id="document-tab">문서 관리</div>
    </div>
</div>
""", unsafe_allow_html=True)

# 자바스크립트로 탭 전환 기능 추가
st.markdown("""
<script>
document.getElementById("chat-tab").addEventListener("click", function() {
    window.location.href = "?tab=chat";
});

document.getElementById("document-tab").addEventListener("click", function() {
    window.location.href = "?tab=document";
});
</script>
""", unsafe_allow_html=True)

# 쿼리 파라미터로 현재 탭 확인
query_params = st.experimental_get_query_params()
if "tab" in query_params and query_params["tab"][0] in ["chat", "document"]:
    st.session_state.current_tab = query_params["tab"][0]

# 대화 탭
if st.session_state.current_tab == "chat":
    # 채팅 컨테이너
    st.markdown('<div class="chat-container">', unsafe_allow_html=True)
    
    # 채팅 내역 출력
    if st.session_state.chat_history:
        for message in st.session_state.chat_history:
            role = message["role"]
            content = message["content"]
            
            if role == "user":
                st.markdown(f'<div class="message user-message">{content}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="message bot-message">{content}</div>', unsafe_allow_html=True)
    else:
        # 첫 방문 시 환영 메시지
        welcome_msg = "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."
        st.markdown(f'<div class="message bot-message">{welcome_msg}</div>', unsafe_allow_html=True)
        st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})
    
    st.markdown('</div>', unsafe_allow_html=True)
    
    # 채팅 입력
    prompt = st.chat_input("질문을 입력하세요...")
    
    if prompt:
        # 사용자 메시지 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        
        # UI 업데이트 (사용자 메시지 표시)
        st.markdown(f'<div class="message user-message">{prompt}</div>', unsafe_allow_html=True)
        
        # 봇 응답 생성 및 표시
        with st.spinner("답변을 생성 중입니다..."):
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
            
            # UI 업데이트 (봇 응답 표시)
            st.markdown(f'<div class="message bot-message">{response}</div>', unsafe_allow_html=True)
        
        st.rerun()
    
    # 데이터베이스 상태 표시
    db_status = get_database_status()
    
    st.markdown('<div class="document-container">', unsafe_allow_html=True)
    st.markdown('<div class="document-header">데이터베이스 상태</div>', unsafe_allow_html=True)
    
    st.markdown('<div class="status-container">', unsafe_allow_html=True)
    
    # 문서 상태 카드
    st.markdown(f"""
    <div class="status-card">
        <div class="status-value">{db_status["document_count"]}</div>
        <div class="status-label">등록된 문서</div>
    </div>
    """, unsafe_allow_html=True)
    
    # 문장 수 상태 카드
    st.markdown(f"""
    <div class="status-card">
        <div class="status-value">{db_status["chunk_count"]}</div>
        <div class="status-label">문장 수</div>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown('</div>', unsafe_allow_html=True)  # status-container 닫기
    
    if db_status["document_count"] > 0:
        st.markdown("""
        <div class="info-box">
            ✅ 문서가 등록되어 있어 더 정확한 답변을 제공할 수 있습니다.
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="info-box" style="border-left-color: #ff9800;">
            📝 AI 응답 품질 향상을 위해 내부 문서를 추가해 주세요!
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown('</div>', unsafe_allow_html=True)  # document-container 닫기

# 문서 관리 탭
else:
    st.markdown('<div class="document-container">', unsafe_allow_html=True)
    st.markdown('<div class="document-header">문서 관리</div>', unsafe_allow_html=True)
    
    st.markdown("""
    <div class="info-box">
        내부 문서를 추가하면 더 정확한 답변을 제공합니다. PDF, Word, PowerPoint, 텍스트 파일을 업로드하거나 직접 내용을 입력할 수 있습니다.
    </div>
    """, unsafe_allow_html=True)
    
    # 탭 구성
    tabs = st.tabs(["텍스트 입력", "파일 업로드", "예시 문서"])
    
    # 텍스트 입력 탭
    with tabs[0]:
        text_title = st.text_input("문서 제목", placeholder="문서 이름을 입력하세요")
        text_input = st.text_area(
            "직접 문서 입력",
            height=200,
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
        st.info("네트워크 관련 기본 매뉴얼이 포함되어 있습니다.")
        
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
    
    # 데이터베이스 상태
    st.markdown('<div class="document-header" style="margin-top: 2rem;">데이터베이스 상태</div>', unsafe_allow_html=True)
    
    db_status = get_database_status()
    
    st.markdown('<div class="status-container">', unsafe_allow_html=True)
    
    # 문서 상태 카드
    st.markdown(f"""
    <div class="status-card">
        <div class="status-value">{db_status["document_count"]}</div>
        <div class="status-label">등록된 문서</div>
    </div>
    """, unsafe_allow_html=True)
    
    # 문장 수 상태 카드
    st.markdown(f"""
    <div class="status-card">
        <div class="status-value">{db_status["chunk_count"]}</div>
        <div class="status-label">문장 수</div>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown('</div>', unsafe_allow_html=True)  # status-container 닫기
    
    st.markdown('</div>', unsafe_allow_html=True)  # document-container 닫기