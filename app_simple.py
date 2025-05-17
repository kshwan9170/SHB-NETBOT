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
    page_title="SHB-NetBot - 신한은행 내부 네트워크 챗봇",
    page_icon="💬",
    layout="wide",
)

# 세션 상태 초기화
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "document_uploaded" not in st.session_state:
    st.session_state.document_uploaded = False

# 간단한 CSS 추가
st.markdown("""
<style>
    h1 {
        color: #0046FF;
    }
    .chat-message {
        padding: 15px;
        border-radius: 15px;
        margin-bottom: 10px;
        font-size: 16px;
    }
    .user-message {
        background-color: #E6EFFF;
        text-align: right;
        margin-left: 20%;
    }
    .bot-message {
        background-color: #0046FF;
        color: white;
        margin-right: 20%;
    }
    .subheader {
        font-size: 18px;
        color: #666;
        margin-bottom: 20px;
    }
</style>
""", unsafe_allow_html=True)

# 제목과 설명
st.title("SHB-NetBot")
st.markdown("<p class='subheader'>신한은행 내부 네트워크 챗봇</p>", unsafe_allow_html=True)

# 메인 레이아웃
col_left, col_right = st.columns([1, 2])

# 좌측 컬럼 - 문서 관리
with col_left:
    st.header("문서 관리")
    
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
        st.info("PDF, Word, PowerPoint, 텍스트 파일을 업로드할 수 있습니다.")
        
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
    st.subheader("데이터베이스 상태")
    db_status = get_database_status()
    
    if db_status["document_count"] > 0:
        st.metric("등록된 문서", db_status["document_count"])
        st.metric("문장 수", db_status["chunk_count"])
        st.success("✅ 문서가 등록되어 있어 더 정확한 답변을 제공할 수 있습니다.")
    else:
        st.metric("등록된 문서", 0)
        st.warning("📝 AI 응답 품질 향상을 위해 내부 문서를 추가해 주세요!")

# 우측 컬럼 - 채팅 영역
with col_right:
    st.header("대화하기")
    
    # 채팅 컨테이너
    chat_container = st.container()
    
    with chat_container:
        # 채팅 내역 출력
        if st.session_state.chat_history:
            for message in st.session_state.chat_history:
                role = message["role"]
                content = message["content"]
                
                if role == "user":
                    st.markdown(f"<div class='chat-message user-message'>{content}</div>", unsafe_allow_html=True)
                else:
                    st.markdown(f"<div class='chat-message bot-message'>{content}</div>", unsafe_allow_html=True)
        else:
            # 첫 방문 시 환영 메시지
            welcome_msg = "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."
            st.markdown(f"<div class='chat-message bot-message'>{welcome_msg}</div>", unsafe_allow_html=True)
            st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})
    
    # 채팅 입력
    prompt = st.chat_input("질문을 입력하세요...")
    
    if prompt:
        # 사용자 메시지 채팅 기록에 추가
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        
        # UI 업데이트 (사용자 메시지 표시)
        st.markdown(f"<div class='chat-message user-message'>{prompt}</div>", unsafe_allow_html=True)
        
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
            st.markdown(f"<div class='chat-message bot-message'>{response}</div>", unsafe_allow_html=True)
            
        st.rerun()