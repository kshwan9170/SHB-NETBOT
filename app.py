import os
import streamlit as st
import uuid
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

# Page configuration
st.set_page_config(
    page_title="SHB-NetBot - 신한은행 내부 네트워크 챗봇",
    page_icon="💬",
    layout="wide",
)

# Initialize session state variables
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "chat_id" not in st.session_state:
    st.session_state.chat_id = str(uuid.uuid4())
if "document_uploaded" not in st.session_state:
    st.session_state.document_uploaded = False

# App layout
col1, col2 = st.columns([2, 1])

with col1:
    # Header
    st.title("SHB-NetBot - 신한은행 내부 네트워크 챗봇")
    st.markdown("네트워크 관련 질문에 답변해 드립니다. 궁금한 점을 물어보세요!")
    
    # Display chat messages
    chat_container = st.container()
    with chat_container:
        for message in st.session_state.chat_history:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        
    # Chat input
    if prompt := st.chat_input("질문을 입력하세요..."):
        # Add user message to chat history
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        
        # Display user message
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Get and display assistant response
        with st.chat_message("assistant"):
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
                
                st.markdown(response)
        
        # Add assistant response to chat history
        st.session_state.chat_history.append({"role": "assistant", "content": response})
        
        # Ensure the UI scrolls to the bottom to show the latest message
        st.rerun()

with col2:
    # Sidebar content
    with st.expander("🔍 문서 업로드", expanded=True):
        st.write("참고할 내부 문서를 업로드하면 더 정확한 답변을 제공합니다.")
        
        uploaded_file = st.file_uploader(
            "PDF, DOCX, PPTX, TXT 파일을 업로드하세요",
            type=["pdf", "docx", "pptx", "txt"],
            help="업로드된 문서는 AI의 답변 생성에 활용됩니다"
        )
        
        if uploaded_file is not None:
            with st.spinner("문서 처리 중..."):
                # Save uploaded file to temp file
                temp_dir = tempfile.TemporaryDirectory()
                temp_path = Path(temp_dir.name) / uploaded_file.name
                
                with open(temp_path, "wb") as f:
                    f.write(uploaded_file.getbuffer())
                
                # Process document
                texts = process_document(str(temp_path))
                
                if texts:
                    # Initialize database if not already done
                    initialize_database()
                    
                    # Add document contents to the vector database
                    add_document_embeddings(texts, metadata={"source": uploaded_file.name})
                    
                    st.session_state.document_uploaded = True
                    st.success(f"문서 '{uploaded_file.name}'이(가) 성공적으로 처리되었습니다!")
                else:
                    st.error("문서에서 텍스트를 추출할 수 없습니다. 다른 문서를 시도해 주세요.")
                
                # Clean up
                temp_dir.cleanup()
    
    with st.expander("📊 데이터베이스 현황", expanded=True):
        db_status = get_database_status()
        st.write(f"현재 데이터베이스에 {db_status['document_count']}개의 문서가 등록되어 있습니다.")
        st.write(f"문장 수: {db_status['chunk_count']}개")
        
        # Check if database is empty and display a hint
        if db_status["document_count"] == 0:
            st.info("📝 AI 응답 품질 향상을 위해 내부 문서를 업로드해 주세요!")

    # App information section
    with st.expander("ℹ️ 앱 정보", expanded=False):
        st.write("**SHB-NetBot**은 신한은행 직원들의 네트워크 관련 질문에 답변해주는 AI 챗봇입니다.")
        st.write("- GPT-3.5 기반 자연어 처리")
        st.write("- 내부 문서 기반 검색 증강 생성(RAG)")
        st.write("- 스윙, IP 확인 등 네트워크 관련 문의 응대")
    
    # Display stock images
    with st.expander("🖼️ 관련 이미지", expanded=False):
        office_img_url = "https://pixabay.com/get/g93548dca7a8b49c8d8014f8a559cb64cf09298a398f03011d6c2c5003ea0594b9e8631356b94e840b292e49ac5945ce6d9ea1cd3da6dc0e68a578cd4f6e03acb_1280.jpg"
        network_img_url = "https://pixabay.com/get/g4d2ae127451798af0525e373e391d0e05a1ad64ae27f5a21251655fcfeb5f0931f5c984edffc0c24b2073a807e99ab1f97f9ad1ddad7f7090571f9d391402014_1280.jpg"
        chatbot_img_url = "https://pixabay.com/get/g7dfbb7cf729feb979fd7eea4212a1d950abc8847d0bc4368ebda83b6866094ab5c3856ea5c50918f965447883ca7d5a65ffa46a12be39adc0ac2249ef0f86c42_1280.jpg"
        
        col_img1, col_img2 = st.columns(2)
        with col_img1:
            st.image(office_img_url, caption="기업 사무실 환경", use_column_width=True)
            st.image(chatbot_img_url, caption="고객 서비스 챗봇", use_column_width=True)
        with col_img2:
            st.image(network_img_url, caption="네트워크 기술", use_column_width=True)

# Initialize the database on first run
if "db_initialized" not in st.session_state:
    initialize_database()
    st.session_state.db_initialized = True

# Add a welcome message if chat history is empty
if len(st.session_state.chat_history) == 0:
    welcome_msg = (
        "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요. "
        "예를 들어, 스윙 접속 방법, IP 확인 방법 등에 대해 물어보실 수 있습니다."
    )
    st.session_state.chat_history.append({"role": "assistant", "content": welcome_msg})
