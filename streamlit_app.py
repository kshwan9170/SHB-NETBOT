import streamlit as st
import os
import json
import uuid
from pathlib import Path
from datetime import datetime
import re

# Import custom modules
import database
import document_processor
import chatbot
from utils import format_chat_message, get_chat_history

# Page configuration
st.set_page_config(
    page_title="신한은행 네트워크 지원 챗봇",
    page_icon="🏦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Setup session state for chat history
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

if "current_theme" not in st.session_state:
    st.session_state.current_theme = "light"

# File upload configuration
UPLOAD_FOLDER = 'uploaded_files'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'txt'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """파일 확장자 체크"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# CSS for modern glassmorphism design
def load_css():
    st.markdown("""
    <style>
    /* Global Styles */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
    
    * {
        font-family: 'Noto Sans KR', sans-serif;
    }
    
    /* Main Container */
    .main-container {
        background: rgba(255, 255, 255, 0.85);
        border-radius: 10px;
        backdrop-filter: blur(10px);
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 50, 0.1);
        margin-bottom: 20px;
    }
    
    /* Chat Message Containers */
    .user-message {
        background: rgba(0, 70, 255, 0.1);
        border-left: 4px solid #0046FF;
        padding: 10px 15px;
        border-radius: 0 5px 5px 0;
        margin: 10px 0;
    }
    
    .assistant-message {
        background: rgba(240, 242, 246, 0.7);
        border-left: 4px solid #dfe2e6;
        padding: 10px 15px;
        border-radius: 0 5px 5px 0;
        margin: 10px 0;
    }
    
    /* File Upload Box */
    .upload-box {
        border: 2px dashed #0046FF;
        border-radius: 10px;
        padding: 20px;
        text-align: center;
        background: rgba(240, 242, 246, 0.5);
        transition: all 0.3s ease;
    }
    
    .upload-box:hover {
        background: rgba(240, 242, 246, 0.8);
        border-color: #003AD6;
    }
    
    /* Document Cards */
    .document-card {
        background: rgba(255, 255, 255, 0.9);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 4px rgba(0, 0, 50, 0.05);
        margin-bottom: 10px;
        position: relative;
        transition: all 0.2s ease;
    }
    
    .document-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 50, 0.1);
    }
    
    .delete-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        color: #ff4757;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        opacity: 0.7;
        transition: all 0.2s ease;
    }
    
    .delete-btn:hover {
        opacity: 1;
        transform: scale(1.1);
    }
    
    /* Refined Shinhan Bank Styling */
    .shinhan-heading {
        color: #0046FF;
        font-weight: 700;
        margin-bottom: 20px;
        border-bottom: 2px solid #0046FF;
        padding-bottom: 10px;
    }
    
    /* Dark Mode Styles */
    .dark-mode {
        background-color: #1E1E1E;
        color: #F0F2F6;
    }
    
    .dark-mode .main-container {
        background: rgba(40, 40, 40, 0.85);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    
    .dark-mode .assistant-message {
        background: rgba(60, 60, 60, 0.7);
        border-left: 4px solid #505050;
    }
    
    .dark-mode .user-message {
        background: rgba(0, 70, 255, 0.2);
    }
    
    .dark-mode .document-card {
        background: rgba(50, 50, 50, 0.9);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .dark-mode .upload-box {
        background: rgba(60, 60, 60, 0.5);
    }
    
    /* Responsive Adjustments */
    @media (max-width: 768px) {
        .main-container {
            padding: 15px;
        }
    }
    </style>
    """, unsafe_allow_html=True)

def display_header():
    """Display the app header with logo and title"""
    col1, col2 = st.columns([1, 4])
    with col1:
        st.image("static/images/shinhan_logo_refined.svg", width=120)
    with col2:
        st.markdown("<h1 class='shinhan-heading'>신한은행 네트워크 지원 챗봇</h1>", unsafe_allow_html=True)
    
    st.markdown("""
    <div class="main-container">
        <p>네트워크 관련 문서를 업로드하고 질문하세요. 신한은행 네트워크 인프라에 대한 지원을 제공합니다.</p>
    </div>
    """, unsafe_allow_html=True)

def chat_interface():
    """Display and handle the chat interface"""
    st.markdown("<h2 class='shinhan-heading'>AI 챗봇과 대화하기</h2>", unsafe_allow_html=True)
    
    # Display chat history
    for message in st.session_state.chat_history:
        if message["role"] == "user":
            st.markdown(f"<div class='user-message'>{message['content']}</div>", unsafe_allow_html=True)
        else:
            st.markdown(f"<div class='assistant-message'>{message['content']}</div>", unsafe_allow_html=True)
    
    # Chat input
    user_message = st.text_input("질문을 입력하세요:", key="user_input")
    if st.button("전송", key="send_message"):
        if user_message:
            # Add user message to chat history
            st.session_state.chat_history.append({"role": "user", "content": user_message})
            
            # Get chatbot response
            try:
                # Get relevant documents for the query
                relevant_docs, context = chatbot.retrieve_relevant_documents(user_message, top_k=5)
                
                # If no relevant documents are found
                if not relevant_docs:
                    # Response based on language detection
                    if re.search(r'[가-힣]', user_message):
                        response = "현재 관련된 문서를 찾을 수 없습니다.\n\n추가 지원이 필요하실 경우,\n**네트워크 운영 담당자(XX-XXX-XXXX)**로 연락해 주시면 신속히 도와드리겠습니다."
                    else:
                        response = "Currently, we cannot find any related documents.\n\nFor additional support,\nPlease contact the **Network Operations Team (XX-XXX-XXXX)** for prompt assistance."
                else:
                    # Get response from the chatbot with context
                    chat_history = get_chat_history(st.session_state.chat_history, max_messages=5)
                    response = chatbot.get_chatbot_response(
                        query=user_message,
                        context=context,
                        chat_history=chat_history,
                        model="gpt-3.5-turbo",
                        use_rag=True
                    )
                
                # Add assistant response to chat history
                st.session_state.chat_history.append({"role": "assistant", "content": response})
                
                # Rerun the app to display the new messages
                st.rerun()
                
            except Exception as e:
                st.error(f"오류가 발생했습니다: {str(e)}")
                st.session_state.chat_history.append({"role": "assistant", "content": f"죄송합니다. 오류가 발생했습니다: {str(e)}"})
                st.rerun()

def document_management():
    """Handle document upload and management"""
    st.markdown("<h2 class='shinhan-heading'>문서 관리</h2>", unsafe_allow_html=True)
    
    # 세션 상태 변수 초기화
    if "editing_file" not in st.session_state:
        st.session_state.editing_file = None
    if "file_content" not in st.session_state:
        st.session_state.file_content = ""
    
    col1, col2 = st.columns([2, 3])
    
    with col1:
        st.markdown("<div class='upload-box'>", unsafe_allow_html=True)
        st.subheader("문서 업로드")
        uploaded_files = st.file_uploader(
            "네트워크 관련 문서를 드래그하거나 클릭하여 업로드하세요",
            type=list(ALLOWED_EXTENSIONS),
            accept_multiple_files=True,
            key="file_uploader"
        )
        st.markdown("</div>", unsafe_allow_html=True)
        
        if uploaded_files:
            for uploaded_file in uploaded_files:
                try:
                    # Create a unique filename
                    filename = uploaded_file.name
                    if not allowed_file(filename):
                        st.warning(f"지원되지 않는 파일 형식입니다: {filename}")
                        continue
                    
                    unique_filename = f"{uuid.uuid4()}_{filename}"
                    file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
                    
                    # Save the file
                    with open(file_path, "wb") as f:
                        f.write(uploaded_file.getbuffer())
                    
                    # Process the document
                    chunks = document_processor.process_document(file_path)
                    
                    # Add metadata to chunks
                    for chunk in chunks:
                        if 'metadata' in chunk:
                            chunk['metadata']['source'] = filename
                            chunk['metadata']['doc_id'] = chunk['doc_id']
                    
                    # Add to vector database
                    database.add_document_embeddings(chunks)
                    
                    st.success(f"문서 '{filename}'이(가) 성공적으로 업로드되었습니다.")
                except Exception as e:
                    st.error(f"문서 '{filename}' 처리 중 오류가 발생했습니다: {str(e)}")
        
        # 문서 편집 영역 (현재 편집 중인 파일이 있을 경우)
        if st.session_state.editing_file:
            file_info = st.session_state.editing_file
            st.markdown(f"""
            <div style="background-color: rgba(240, 242, 246, 0.7); padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #0046FF;">
                <h3>문서 편집: {file_info['filename']}</h3>
            </div>
            """, unsafe_allow_html=True)
            
            # 텍스트 에디터 영역 (TXT 파일만 지원)
            text_content = st.text_area("문서 내용", 
                                         value=st.session_state.file_content, 
                                         height=400,
                                         key="document_editor")
            
            col_cancel, col_save = st.columns(2)
            
            with col_cancel:
                if st.button("편집 취소", key="cancel_edit"):
                    # 편집 세션 초기화
                    st.session_state.editing_file = None
                    st.session_state.file_content = ""
                    st.rerun()
            
            with col_save:
                if st.button("저장 및 동기화", key="save_document"):
                    try:
                        # 1. 파일 내용 저장
                        file_path = os.path.join(UPLOAD_FOLDER, file_info['system_filename'])
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(text_content)
                        
                        # 2. 벡터 DB 업데이트
                        doc_id = file_info['system_filename'].split('_')[0]
                        file_type = file_info['filename'].split('.')[-1].lower()
                        
                        # 텍스트 처리 및 청크 생성
                        chunks = document_processor.process_text(
                            text=text_content, 
                            doc_id=doc_id, 
                            filename=file_info['filename'],
                            file_type=file_type
                        )
                        
                        # DB 업데이트
                        database.update_document_embeddings(doc_id, chunks)
                        
                        st.success(f"문서 '{file_info['filename']}'이(가) 성공적으로 저장되고 벡터 DB에 동기화되었습니다.")
                        
                        # 편집 세션 초기화
                        st.session_state.editing_file = None
                        st.session_state.file_content = ""
                        st.rerun()
                    except Exception as e:
                        st.error(f"문서 저장 및 동기화 중 오류가 발생했습니다: {str(e)}")
    
    with col2:
        st.subheader("업로드된 문서 목록")
        try:
            # Get document status and file list
            document_status = database.get_database_status()
            files = []
            for filename in os.listdir(UPLOAD_FOLDER):
                if not filename.startswith('.'):  # 숨김 파일 제외
                    file_path = os.path.join(UPLOAD_FOLDER, filename)
                    if os.path.isfile(file_path):
                        # 원본 파일명 추출 (UUID 제거)
                        original_filename = "_".join(filename.split("_")[1:])
                        
                        # 파일 통계 정보
                        file_stats = os.stat(file_path)
                        files.append({
                            'filename': original_filename,
                            'size': file_stats.st_size,
                            'uploaded_at': file_stats.st_mtime,
                            'file_type': original_filename.split('.')[-1].lower(),
                            'system_filename': filename  # 시스템 내부 파일명 추가 (삭제 기능을 위해)
                        })
            
            # Display document count
            st.info(f"총 문서 수: {document_status.get('document_count', 0)}, 총 청크 수: {document_status.get('chunk_count', 0)}")
            
            # Display files
            for file in files:
                col_file, col_action, col_edit, col_delete = st.columns([4, 0.8, 0.8, 0.8])
                
                with col_file:
                    file_type = file['file_type'].upper()
                    file_size = format_file_size(file['size'])
                    upload_date = datetime.fromtimestamp(file['uploaded_at']).strftime('%Y-%m-%d %H:%M:%S')
                    
                    st.markdown(f"""
                    <div class='document-card'>
                        <h4>{file['filename']}</h4>
                        <p>타입: {file_type} | 크기: {file_size} | 업로드: {upload_date}</p>
                    </div>
                    """, unsafe_allow_html=True)
                
                # "보기" 버튼 추가
                with col_action:
                    if st.button("보기", key=f"view_{file['system_filename']}"):
                        try:
                            file_path = os.path.join(UPLOAD_FOLDER, file['system_filename'])
                            file_type = file['filename'].split('.')[-1].lower()
                            
                            # 텍스트 파일만 표시 가능
                            if file_type == 'txt':
                                with open(file_path, 'r', encoding='utf-8') as f:
                                    file_content = f.read()
                                st.code(file_content, language='text')
                            else:
                                st.warning(f"'{file_type}' 형식의 파일은 웹 브라우저에서 직접 볼 수 없습니다.")
                        except UnicodeDecodeError:
                            try:
                                with open(file_path, 'r', encoding='cp949') as f:
                                    file_content = f.read()
                                st.code(file_content, language='text')
                            except Exception as e:
                                st.error(f"파일 보기 중 오류가 발생했습니다: {str(e)}")
                        except Exception as e:
                            st.error(f"파일 보기 중 오류가 발생했습니다: {str(e)}")
                
                # "편집" 버튼 추가
                with col_edit:
                    if st.button("편집", key=f"edit_{file['system_filename']}"):
                        # 텍스트 파일만 편집 가능
                        file_type = file['filename'].split('.')[-1].lower()
                        if file_type != 'txt':
                            st.warning(f"'{file_type}' 형식의 파일은 현재 편집이 지원되지 않습니다. TXT 파일만 편집할 수 있습니다.")
                        else:
                            try:
                                file_path = os.path.join(UPLOAD_FOLDER, file['system_filename'])
                                try:
                                    with open(file_path, 'r', encoding='utf-8') as f:
                                        file_content = f.read()
                                except UnicodeDecodeError:
                                    with open(file_path, 'r', encoding='cp949') as f:
                                        file_content = f.read()
                                
                                # 세션 상태에 저장
                                st.session_state.editing_file = file
                                st.session_state.file_content = file_content
                                
                                # 페이지 리로드하여 편집기 표시
                                st.rerun()
                            except Exception as e:
                                st.error(f"파일 편집 준비 중 오류가 발생했습니다: {str(e)}")
                
                # "삭제" 버튼
                with col_delete:
                    if st.button("삭제", key=f"delete_{file['system_filename']}"):
                        try:
                            # Remove file
                            file_path = os.path.join(UPLOAD_FOLDER, file['system_filename'])
                            if os.path.exists(file_path):
                                os.remove(file_path)
                            
                            # Delete from vector database
                            file_uuid = file['system_filename'].split('_')[0]
                            database.delete_document(file_uuid)
                            
                            # 편집 중이던 파일이 삭제되었다면 편집 상태 초기화
                            if (st.session_state.editing_file and 
                                st.session_state.editing_file['system_filename'] == file['system_filename']):
                                st.session_state.editing_file = None
                                st.session_state.file_content = ""
                            
                            st.success(f"파일 '{file['filename']}'이(가) 삭제되었습니다.")
                            st.rerun()
                        except Exception as e:
                            st.error(f"파일 삭제 중 오류가 발생했습니다: {str(e)}")
        
        except Exception as e:
            st.error(f"문서 목록을 불러오는 중 오류가 발생했습니다: {str(e)}")

def format_file_size(size_bytes):
    """Format file size in bytes to human-readable format"""
    if size_bytes < 1024:
        return f"{size_bytes} bytes"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"

def theme_selector():
    """Allow users to toggle between light and dark themes"""
    st.sidebar.title("설정")
    theme = st.sidebar.selectbox(
        "테마 선택",
        ["라이트 모드", "다크 모드"],
        index=0 if st.session_state.current_theme == "light" else 1
    )
    
    if theme == "다크 모드" and st.session_state.current_theme != "dark":
        st.session_state.current_theme = "dark"
        st.markdown("<script>document.body.classList.add('dark-mode');</script>", unsafe_allow_html=True)
        st.rerun()
    elif theme == "라이트 모드" and st.session_state.current_theme != "light":
        st.session_state.current_theme = "light"
        st.markdown("<script>document.body.classList.remove('dark-mode');</script>", unsafe_allow_html=True)
        st.rerun()

def display_footer():
    """Display the app footer with links and copyright information"""
    st.markdown("""
    <div style="background-color: #1E2D3B; padding: 20px; border-radius: 10px; margin-top: 20px;">
        <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
            <div>
                <h3 style="color: #4A89DC; border-bottom: 2px solid #4A89DC; padding-bottom: 5px; margin-bottom: 10px;">서비스</h3>
                <p><a href="#" style="color: white; text-decoration: none;">🏠 홈</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">📊 소개</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">💬 대화하기</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">📄 문서</a></p>
            </div>
            <div>
                <h3 style="color: #4A89DC; border-bottom: 2px solid #4A89DC; padding-bottom: 5px; margin-bottom: 10px;">고객지원</h3>
                <p><a href="#" style="color: white; text-decoration: none;">🔍 문의하기</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">📋 피드백</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">📣 자주 묻는 질문</a></p>
            </div>
            <div>
                <h3 style="color: #4A89DC; border-bottom: 2px solid #4A89DC; padding-bottom: 5px; margin-bottom: 10px;">정책 및 약관</h3>
                <p><a href="#" style="color: white; text-decoration: none;">📜 이용약관</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">🔒 개인정보처리방침</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">🛡️ 저작권</a></p>
                <p><a href="#" style="color: white; text-decoration: none;">📝 보안정책</a></p>
            </div>
        </div>
        <div style="text-align: center; color: white; margin-top: 20px;">
            <p>© 2025 신한은행. All rights reserved.</p>
        </div>
    </div>
    """, unsafe_allow_html=True)

def main():
    """Main function to run the Streamlit app"""
    # Load CSS
    load_css()
    
    # Theme selector in sidebar
    theme_selector()
    
    # Add some basic info to the sidebar
    st.sidebar.title("정보")
    st.sidebar.info("""
    ### 신한은행 네트워크 지원 챗봇
    
    이 챗봇은 신한은행 네트워크 인프라에 대한 정보와 지원을 제공합니다.
    
    문서를 업로드하고 질문하세요.
    """)
    
    # Display header
    display_header()
    
    # Create tabs for different sections
    tab1, tab2 = st.tabs(["💬 채팅", "📄 문서 관리"])
    
    with tab1:
        chat_interface()
    
    with tab2:
        document_management()
    
    # Display footer
    display_footer()

if __name__ == "__main__":
    main()