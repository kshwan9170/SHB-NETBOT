import os
import json
import uuid
import shutil
import re
from pathlib import Path
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, abort
import openai
from openai import OpenAI

# 게시판 모델 임포트
from models import init_db, get_db, close_db, InquiryBoard, FeedbackBoard, ReportBoard

# Custom modules
import database
import document_processor

app = Flask(__name__)

# 데이터베이스 초기화
init_db()

# 데이터베이스 연결 종료
@app.teardown_appcontext
def close_connection(exception):
    close_db(exception)

# 파일 업로드 설정
UPLOAD_FOLDER = 'uploaded_files'
TEMP_CHUNK_FOLDER = 'temp_chunks'  # 청크 파일 임시 저장 폴더
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'txt'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TEMP_CHUNK_FOLDER'] = TEMP_CHUNK_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload size (for chunks)

# 업로드 폴더 생성
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TEMP_CHUNK_FOLDER, exist_ok=True)

# OpenAI API 키 설정
openai_api_key = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=openai_api_key)

def allowed_file(filename):
    """파일 확장자 체크"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_clean_filename(filename):
    """보안을 위해 안전한 파일명 생성 (한글 파일명 지원)"""
    if not filename:
        return ""
    # 위험한 문자만 제거하고 한글은 유지
    s = str(filename).strip()
    s = re.sub(r'[\\/*?:"<>|]', '', s)  # 윈도우에서 파일명으로 사용할 수 없는 문자 제거
    s = s.replace('..', '')  # 상위 디렉토리 참조 방지
    return s.strip()

@app.route('/')
def index():
    return render_template('index.html')
    
@app.route('/file-manager')
def file_manager():
    """간단한 파일 관리 페이지"""
    return render_template('file_manager.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return app.send_static_file(path)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': '메시지가 비어 있습니다.'}), 400
    
    try:
        # 벡터 DB에서 관련 문서 검색 (요구사항에 맞게 top_k=5로 수정)
        relevant_docs = database.search_similar_docs(user_message, top_k=5)
        
        # 검색된 문서가 없는 경우 예외 처리
        if not relevant_docs:
            print(f"관련 문서를 찾지 못했습니다. 쿼리: {user_message}")
            
            # 사용자 언어에 맞게 안내 메시지 전달
            if re.search(r'[가-힣]', user_message):
                return jsonify({'reply': "현재 관련된 문서를 찾을 수 없습니다.\n\n추가 지원이 필요하실 경우,\n**네트워크 운영 담당자(XX-XXX-XXXX)**로 연락해 주시면 신속히 도와드리겠습니다."})
            else:
                return jsonify({'reply': "Currently, we cannot find any related documents.\n\nFor additional support,\nPlease contact the **Network Operations Team (XX-XXX-XXXX)** for prompt assistance."})
        
        # Context 형식 요구사항대로 변경 (번호를 붙여 각 문서 표시)
        context = "Context:\n"
        for i, doc in enumerate(relevant_docs):
            context += f"- ({i+1}) \"{doc.page_content}\"\n\n"
        
        # 시스템 프롬프트 구성
        system_prompt = """[SYSTEM]
You are SHB-NetBot. Use the Context to answer precisely.

모든 응답은 다음 Markdown 형식 규칙을 따라야 해:

1. 주요 주제는 ## 또는 ### 헤딩으로 구분하기
2. 주제별로 짧은 설명 문단으로 배경이나 목적을 덧붙이기
3. 단계가 있는 경우 번호 매기기(1., 2. 등)와 각 단계에 대한 설명 제공하기
4. 설정, 명령어는 ```bash 또는 ```plaintext 코드 블록으로 표시하기
5. 중요 키워드는 **굵은 텍스트**로 강조하기
6. 순서 없는 목록은 - 또는 * 사용하기
7. 각 주요 섹션 사이에 한 줄 이상의 빈 줄 삽입하기

[CONTEXT]
"""
        
        # Context 추가
        system_prompt += context
        
        # 사용자 질문을 프롬프트에 추가
        user_prompt = f"[USER]\n{user_message}"
        
        # OpenAI API를 호출하여 응답 생성
        try:
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=800,  # 응답 길이 늘림
                temperature=0.7,
            )
            
            # API 응답에서 텍스트 추출
            reply = response.choices[0].message.content
            
            # 로그 기록 (디버깅용)
            print(f"RAG 검색 성공: {len(relevant_docs)}개 문서 검색됨")
            
        except Exception as api_error:
            print(f"ERROR: RAG pipeline failed during OpenAI API call: {str(api_error)}")
            
            # 사용자 언어에 맞게 오류 메시지
            if re.search(r'[가-힣]', user_message):
                reply = "죄송합니다. 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
            else:
                reply = "Sorry, an error occurred while generating a response. Please try again later."
        
        return jsonify({'reply': reply})
    
    except Exception as e:
        print(f"Error in chat API: {str(e)}")
        return jsonify({'error': f'오류가 발생했습니다: {str(e)}'}), 500
        
@app.route('/api/upload', methods=['POST'])
def upload_file():
    # 파일이 요청에 있는지 확인
    if 'file' not in request.files:
        return jsonify({'error': '파일이 없습니다.'}), 400
    
    files = request.files.getlist('file')
    
    if not files or files[0].filename == '':
        return jsonify({'error': '선택된 파일이 없습니다.'}), 400
    
    # 업로드된 각 파일에 대해 처리
    results = []
    for file in files:
        if file and allowed_file(file.filename):
            # 보안을 위한 파일명 설정 (한글 파일명 지원)
            if file and file.filename:
                filename = get_clean_filename(str(file.filename))
            else:
                continue
            
            # 고유한 파일명 생성
            unique_filename = f"{uuid.uuid4()}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            
            try:
                # 파일 저장
                file.save(file_path)
                
                # 문서 처리 및 청크 생성 (최대 500 토큰 크기 청크)
                chunks = document_processor.process_document(file_path)
                print(f"문서 분할 완료: {len(chunks)}개 청크")
                
                # 각 청크에 필요한 메타데이터 추가 (소스 문서 정보)
                for chunk in chunks:
                    if 'metadata' in chunk:
                        chunk['metadata']['source'] = filename
                        chunk['metadata']['doc_id'] = chunk['doc_id']
                
                # 청크를 벡터 DB에 저장 (요구사항에 맞게 컬렉션 "uploaded_docs" 사용)
                try:
                    database.add_document_embeddings(chunks)
                    print(f"벡터 DB에 {len(chunks)}개 청크 저장 완료: {filename}")
                except Exception as db_error:
                    print(f"ERROR: RAG pipeline failed during vector DB storage: {str(db_error)}")
                    raise db_error
                
                # 성공 결과 추가
                results.append({
                    'filename': filename,
                    'status': 'success',
                    'message': '문서가 성공적으로 처리되었습니다.',
                    'doc_id': chunks[0]['doc_id'] if chunks else None,
                    'chunk_count': len(chunks)
                })
            except Exception as e:
                print(f"Error processing file {filename}: {str(e)}")
                results.append({
                    'filename': filename,
                    'status': 'error',
                    'message': f'문서 처리 중 오류 발생: {str(e)}'
                })
        else:
            results.append({
                'filename': file.filename,
                'status': 'error',
                'message': '지원되지 않는 파일 형식입니다.'
            })
    
    return jsonify({'results': results})

@app.route('/api/documents', methods=['GET'])
def get_documents():
    """업로드된 문서 목록 조회"""
    try:
        document_status = database.get_database_status()
        
        # 폴더에서 파일 정보 가져오기
        files = []
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            if not filename.startswith('.'):  # 숨김 파일 제외
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
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
        
        return jsonify({
            'document_count': document_status.get('document_count', 0),
            'chunk_count': document_status.get('chunk_count', 0),
            'files': files
        })
    except Exception as e:
        print(f"Error getting documents: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/upload-chunk', methods=['POST'])
def upload_chunk():
    """
    청크 단위 파일 업로드 처리 API
    전송 데이터 형식: 
    - filename: 원본 파일명
    - chunkIndex: 현재 청크 인덱스 (0부터 시작)
    - totalChunks: 전체 청크 수
    - chunkData: 청크 데이터 (파일)
    - sessionId: 세션 ID (첫 번째 청크 이후부터 사용)
    """
    # 파라미터 검증
    if 'chunkData' not in request.files:
        return jsonify({
            'success': False, 
            'error': '청크 데이터가 없습니다.'
        }), 400
        
    if not request.form.get('filename'):
        return jsonify({
            'success': False, 
            'error': '파일명이 제공되지 않았습니다.'
        }), 400
    
    # 매개변수 추출
    filename = request.form.get('filename')
    chunk_index = int(request.form.get('chunkIndex', 0))
    total_chunks = int(request.form.get('totalChunks', 1))
    chunk_file = request.files['chunkData']
    
    # 파일명 보안 처리
    if not filename:
        return jsonify({
            'success': False, 
            'error': '유효하지 않은 파일명입니다.'
        }), 400
    # 한글을 보존하는 파일명 생성
    safe_filename = get_clean_filename(str(filename))
        
    # 파일 확장자 확인
    if not allowed_file(safe_filename):
        return jsonify({
            'success': False, 
            'error': '지원되지 않는 파일 형식입니다.'
        }), 400
    
    # 세션 ID 처리
    session_id = request.form.get('sessionId')
    if chunk_index == 0 and not session_id:
        session_id = str(uuid.uuid4())
    
    # 응답 데이터 준비
    response_data = {
        'success': True,
        'sessionId': session_id,
        'chunkIndex': chunk_index,
        'totalChunks': total_chunks,
        'received': True
    }
    
    try:
        # 청크 저장 경로
        chunk_filename = f"{session_id}_{safe_filename}.part{chunk_index}"
        chunk_path = os.path.join(app.config['TEMP_CHUNK_FOLDER'], chunk_filename)
        
        # 청크 파일 저장
        chunk_file.save(chunk_path)
        print(f"Saved chunk {chunk_index+1}/{total_chunks} for file {safe_filename}")
        
        # 마지막 청크인 경우 모든 청크를 합쳐서 최종 파일 생성
        if chunk_index == total_chunks - 1:
            # 최종 파일명 및 경로
            final_unique_filename = f"{session_id}_{safe_filename}"
            final_path = os.path.join(app.config['UPLOAD_FOLDER'], final_unique_filename)
            print(f"Combining chunks for {safe_filename} to {final_unique_filename}")
            
            # 청크 합치기
            with open(final_path, 'wb') as final_file:
                for i in range(total_chunks):
                    part_filename = f"{session_id}_{safe_filename}.part{i}"
                    part_path = os.path.join(app.config['TEMP_CHUNK_FOLDER'], part_filename)
                    
                    if os.path.exists(part_path):
                        with open(part_path, 'rb') as part_file:
                            final_file.write(part_file.read())
                        
                        # 청크 파일 삭제
                        os.remove(part_path)
                        print(f"Removed temporary chunk file: {part_filename}")
            
            # 문서 처리 및 벡터 DB에 추가
            try:
                print(f"Processing document: {final_path}")
                chunks = document_processor.process_document(final_path)
                
                # 벡터 DB에 청크 추가
                if chunks:
                    print(f"Adding {len(chunks)} chunks to vector database")
                    database.add_document_embeddings(chunks)
                
                # 파일 완성 정보 추가
                response_data['fileComplete'] = True
                response_data['finalFilename'] = safe_filename
                response_data['size'] = os.path.getsize(final_path)
                response_data['doc_id'] = chunks[0]['doc_id'] if chunks else None
                response_data['chunk_count'] = len(chunks) if chunks else 0
                print(f"File upload and processing complete for {safe_filename}")
                
            except Exception as e:
                print(f"Error processing file {safe_filename}: {str(e)}")
                response_data['processingError'] = str(e)
        
        return jsonify(response_data)
    
    except Exception as e:
        print(f"Error in chunk upload: {str(e)}")
        # 임시 청크 파일 정리 시도
        try:
            for i in range(total_chunks):
                part_filename = f"{session_id}_{safe_filename}.part{i}"
                part_path = os.path.join(app.config['TEMP_CHUNK_FOLDER'], part_filename)
                if os.path.exists(part_path):
                    os.remove(part_path)
        except:
            pass
            
        return jsonify({
            'success': False,
            'error': f'청크 업로드 처리 중 오류: {str(e)}'
        }), 500

@app.route('/api/delete', methods=['POST'])
def delete_file():
    """업로드된 파일 삭제"""
    try:
        # 요청 데이터 로깅
        data = request.get_json()
        print(f"Delete request received with data: {data}")
        
        # 시스템 파일명 가져오기
        system_filename = data.get('system_filename')
        
        if not system_filename:
            print("Error: No system_filename provided in request")
            return jsonify({'success': False, 'error': '파일명이 제공되지 않았습니다.'}), 400
            
        print(f"Processing delete request for file: {system_filename}")
            
        # 파일 경로 확인
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], system_filename)
        print(f"File path to delete: {file_path}")
        
        # 파일 존재 확인
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            print(f"File not found: {file_path}")
            return jsonify({'success': False, 'error': '파일을 찾을 수 없습니다.'}), 404
        
        # 업로드 폴더 상태 확인
        print("Current files in upload folder:")
        for f in os.listdir(app.config['UPLOAD_FOLDER']):
            print(f" - {f}")
            
        # 파일 삭제
        os.remove(file_path)
        print(f"File removed: {file_path}")
        
        # 벡터 DB에서 해당 문서 관련 데이터 삭제
        # 파일명에서 UUID 추출
        try:
            file_uuid = system_filename.split('_')[0]
            print(f"Extracted UUID: {file_uuid}")
            database.delete_document(file_uuid)
            print(f"Document deleted from vector database with ID: {file_uuid}")
        except Exception as db_err:
            print(f"DB 삭제 중 오류 발생: {str(db_err)}")
            # DB 오류는 무시하고 파일 삭제 성공으로 처리
            
        return jsonify({'success': True, 'message': f'파일이 삭제되었습니다.'})
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error deleting file: {error_msg}")
        return jsonify({'success': False, 'error': error_msg}), 500

# 문의하기 게시판 라우트
@app.route('/inquiry')
def inquiry_list():
    page = request.args.get('page', 1, type=int)
    board = InquiryBoard()
    pagination = board.get_posts(page=page, per_page=10)
    
    # 템플릿 변수 설정
    template_args = {
        'posts': pagination['posts'],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'pages': pagination['pages'],
            'total': pagination['total'],
            'has_prev': pagination['page'] > 1,
            'has_next': pagination['page'] < pagination['pages'],
            'prev_num': pagination['page'] - 1,
            'next_num': pagination['page'] + 1,
            'iter_pages': lambda: range(1, pagination['pages'] + 1)
        },
        'board_page_title': '문의하기',
        'board_title': '문의하기',
        'board_description': '네트워크 관련 문의사항을 등록하고 답변을 받을 수 있는 게시판입니다.',
        'list_route': 'inquiry_list',
        'write_route': 'inquiry_write',
        'view_route': 'inquiry_view',
        'edit_route': 'inquiry_edit',
        'board_type': 'inquiry'
    }
    
    return render_template('board_template.html', **template_args)

@app.route('/inquiry/write', methods=['GET', 'POST'])
def inquiry_write():
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board = InquiryBoard()
        post_id = board.create_post(title, content, author)
        
        return redirect(url_for('inquiry_view', post_id=post_id))
    
    return render_template('write_post.html', board_title='문의하기', list_route='inquiry_list', write_route='inquiry_write')

@app.route('/inquiry/view/<int:post_id>')
def inquiry_view(post_id):
    board = InquiryBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
        
    return render_template('view_post.html', post=post, board_title='문의하기', list_route='inquiry_list', edit_route='inquiry_edit', board_type='inquiry')

@app.route('/inquiry/edit/<int:post_id>', methods=['GET', 'POST'])
def inquiry_edit(post_id):
    board = InquiryBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
    
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board.update_post(post_id, title, content, author)
        return redirect(url_for('inquiry_view', post_id=post_id))
    
    return render_template('write_post.html', post=post, board_title='문의하기', 
                          list_route='inquiry_list', write_route='inquiry_edit', 
                          is_edit=True)

# 문의하기 게시글 삭제 API
@app.route('/inquiry/delete/<int:post_id>', methods=['POST'])
def inquiry_delete(post_id):
    try:
        board = InquiryBoard()
        # 해당 게시글이 존재하는지 확인
        post = board.get_post(post_id)
        if not post:
            return jsonify({'success': False, 'error': '게시글을 찾을 수 없습니다.'}), 404
        
        # 게시글 삭제
        board.delete_post(post_id)
        return jsonify({'success': True, 'message': '게시글이 삭제되었습니다.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# 피드백 게시판 라우트
@app.route('/feedback')
def feedback_list():
    page = request.args.get('page', 1, type=int)
    board = FeedbackBoard()
    pagination = board.get_posts(page=page, per_page=10)
    
    # 템플릿 변수 설정
    template_args = {
        'posts': pagination['posts'],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'pages': pagination['pages'],
            'total': pagination['total'],
            'has_prev': pagination['page'] > 1,
            'has_next': pagination['page'] < pagination['pages'],
            'prev_num': pagination['page'] - 1,
            'next_num': pagination['page'] + 1,
            'iter_pages': lambda: range(1, pagination['pages'] + 1)
        },
        'board_page_title': '피드백',
        'board_title': '피드백',
        'board_description': 'SHB-NetBot 서비스 개선을 위한 의견이나 제안을 등록해 주세요.',
        'list_route': 'feedback_list',
        'write_route': 'feedback_write',
        'view_route': 'feedback_view',
        'edit_route': 'feedback_edit',
        'board_type': 'feedback'
    }
    
    return render_template('board_template.html', **template_args)

@app.route('/feedback/write', methods=['GET', 'POST'])
def feedback_write():
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board = FeedbackBoard()
        post_id = board.create_post(title, content, author)
        
        return redirect(url_for('feedback_view', post_id=post_id))
    
    return render_template('write_post.html', board_title='피드백', list_route='feedback_list', write_route='feedback_write')

@app.route('/feedback/view/<int:post_id>')
def feedback_view(post_id):
    board = FeedbackBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
        
    return render_template('view_post.html', post=post, board_title='피드백', list_route='feedback_list', edit_route='feedback_edit', board_type='feedback')

@app.route('/feedback/edit/<int:post_id>', methods=['GET', 'POST'])
def feedback_edit(post_id):
    board = FeedbackBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
    
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board.update_post(post_id, title, content, author)
        return redirect(url_for('feedback_view', post_id=post_id))
    
    return render_template('write_post.html', post=post, board_title='피드백', 
                          list_route='feedback_list', write_route='feedback_edit', 
                          is_edit=True)

# 피드백 게시글 삭제 API
@app.route('/feedback/delete/<int:post_id>', methods=['POST'])
def feedback_delete(post_id):
    try:
        board = FeedbackBoard()
        # 해당 게시글이 존재하는지 확인
        post = board.get_post(post_id)
        if not post:
            return jsonify({'success': False, 'error': '게시글을 찾을 수 없습니다.'}), 404
        
        # 게시글 삭제
        board.delete_post(post_id)
        return jsonify({'success': True, 'message': '게시글이 삭제되었습니다.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# 장애 신고 게시판 라우트
@app.route('/report')
def report_list():
    page = request.args.get('page', 1, type=int)
    board = ReportBoard()
    pagination = board.get_posts(page=page, per_page=10)
    
    # 템플릿 변수 설정
    template_args = {
        'posts': pagination['posts'],
        'pagination': {
            'page': pagination['page'],
            'per_page': pagination['per_page'],
            'pages': pagination['pages'],
            'total': pagination['total'],
            'has_prev': pagination['page'] > 1,
            'has_next': pagination['page'] < pagination['pages'],
            'prev_num': pagination['page'] - 1,
            'next_num': pagination['page'] + 1,
            'iter_pages': lambda: range(1, pagination['pages'] + 1)
        },
        'board_page_title': '장애 신고',
        'board_title': '장애 신고',
        'board_description': '네트워크 장애가 발생했을 때 신속하게 신고하여 빠른 조치를 받을 수 있습니다.',
        'list_route': 'report_list',
        'write_route': 'report_write',
        'view_route': 'report_view',
        'edit_route': 'report_edit',
        'board_type': 'report'
    }
    
    return render_template('board_template.html', **template_args)

@app.route('/report/write', methods=['GET', 'POST'])
def report_write():
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board = ReportBoard()
        post_id = board.create_post(title, content, author)
        
        return redirect(url_for('report_view', post_id=post_id))
    
    return render_template('write_post.html', board_title='장애 신고', list_route='report_list', write_route='report_write')

@app.route('/report/view/<int:post_id>')
def report_view(post_id):
    board = ReportBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
        
    return render_template('view_post.html', post=post, board_title='장애 신고', list_route='report_list', edit_route='report_edit', board_type='report')

@app.route('/report/edit/<int:post_id>', methods=['GET', 'POST'])
def report_edit(post_id):
    board = ReportBoard()
    post = board.get_post(post_id)
    
    if not post:
        abort(404)
    
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        author = request.form.get('author')
        
        if not title or not content or not author:
            return "제목, 내용, 작성자는 필수 입력 항목입니다.", 400
            
        board.update_post(post_id, title, content, author)
        return redirect(url_for('report_view', post_id=post_id))
    
    return render_template('write_post.html', post=post, board_title='장애 신고', 
                          list_route='report_list', write_route='report_edit', 
                          is_edit=True)

# 장애 신고 게시글 삭제 API
@app.route('/report/delete/<int:post_id>', methods=['POST'])
def report_delete(post_id):
    try:
        board = ReportBoard()
        # 해당 게시글이 존재하는지 확인
        post = board.get_post(post_id)
        if not post:
            return jsonify({'success': False, 'error': '게시글을 찾을 수 없습니다.'}), 404
        
        # 게시글 삭제
        board.delete_post(post_id)
        return jsonify({'success': True, 'message': '게시글이 삭제되었습니다.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# 문서 동기화 API
@app.route('/api/sync-documents', methods=['POST'])
def sync_documents():
    """
    업로드된 문서와 벡터 데이터베이스 동기화
    - 파일 시스템의 문서가 벡터 DB에 없으면 추가
    - 파일 수정 시간이 변경된 문서는 다시 처리
    """
    try:
        def generate_progress():
            """진행 상황을 스트리밍하는 제너레이터 함수"""
            
            yield json.dumps({
                'progress': 0,
                'message': '문서 동기화를 시작합니다...'
            }) + '\n'
            
            # 1. 현재 업로드된 파일 목록 수집
            files = []
            try:
                file_list = os.listdir(app.config['UPLOAD_FOLDER'])
                
                for filename in file_list:
                    if filename.startswith('.'):  # 숨김 파일 제외
                        continue
                        
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    if os.path.isfile(file_path):
                        file_stats = os.stat(file_path)
                        
                        # 시스템 파일명에서 UUID 추출 (문서 ID로 사용)
                        doc_id = filename.split('_')[0] if '_' in filename else filename
                        
                        # 원본 파일명 추출
                        original_filename = "_".join(filename.split("_")[1:])
                        
                        files.append({
                            'system_filename': filename,
                            'display_filename': original_filename,
                            'file_path': file_path,
                            'doc_id': doc_id,
                            'modified_time': file_stats.st_mtime
                        })
                
                yield json.dumps({
                    'progress': 10,
                    'message': f'{len(files)}개 문서를 확인했습니다.'
                }) + '\n'
                
            except Exception as e:
                print(f"파일 목록 수집 오류: {str(e)}")
                yield json.dumps({
                    'progress': 10,
                    'message': f'파일 목록 수집 중 오류: {str(e)}'
                }) + '\n'
                return
            
            if not files:
                yield json.dumps({
                    'progress': 100,
                    'message': '동기화할 문서가 없습니다.'
                }) + '\n'
                return
            
            # 2. 각 파일 동기화 처리
            total_files = len(files)
            processed_files = 0
            
            # 동기화 전에 데이터베이스 현재 상태 저장
            db_status_before = database.get_database_status()
            sync_needed = False
            
            # 빠른 검사: 이미 모든 파일이 처리되었는지 확인
            # 문서 ID 목록 가져오기
            existing_doc_ids = database.get_all_document_ids()
            files_to_process = []
            
            # 처리가 필요한 파일만 필터링
            for file_info in files:
                doc_id = file_info['doc_id']
                if doc_id not in existing_doc_ids:
                    files_to_process.append(file_info)
            
            # 모든 파일이 이미 처리되었으면 동기화 필요 없음
            if not files_to_process:
                yield json.dumps({
                    'progress': 100,
                    'message': f'🛈 동기화할 항목이 없습니다. 현재 모든 파일은 최신 상태입니다.'
                }) + '\n'
                return
                
            # 처리가 필요한 파일로 목록 갱신
            files = files_to_process
            total_files = len(files)
            
            for file_info in files:
                try:
                    file_path = file_info['file_path']
                    doc_id = file_info['doc_id']
                    display_filename = file_info['display_filename']
                    
                    # 현재 파일 처리 시작 메시지
                    current_progress = 10 + int((processed_files / total_files) * 80)
                    yield json.dumps({
                        'progress': current_progress,
                        'message': f'({processed_files+1}/{total_files}) {display_filename} 동기화 중...'
                    }) + '\n'
                    
                    # 문서 처리 및 벡터 DB 업데이트
                    if allowed_file(display_filename):
                        # 기존 문서 ID로 먼저 삭제 (문서 업데이트 효과)
                        deleted = database.delete_document(doc_id)
                        
                        # 문서 처리
                        chunks = document_processor.process_document(file_path)
                        
                        # 청크가 없으면 다음 파일로
                        if not chunks:
                            yield json.dumps({
                                'progress': current_progress + 5,
                                'message': f'{display_filename} 처리 중 청크를 추출할 수 없습니다.'
                            }) + '\n'
                            processed_files += 1
                            continue
                        
                        # 문서 ID 설정
                        for chunk in chunks:
                            chunk['doc_id'] = doc_id
                        
                        # 벡터 DB에 저장
                        added = database.add_document_embeddings(chunks)
                        
                        # 동기화가 실제로 이루어졌는지 확인
                        if deleted or added:
                            sync_needed = True
                        
                        yield json.dumps({
                            'progress': current_progress + 5,
                            'message': f'{display_filename} 처리 완료 (청크 {len(chunks)}개)'
                        }) + '\n'
                    else:
                        yield json.dumps({
                            'progress': current_progress,
                            'message': f'{display_filename}은 지원되지 않는 파일 형식입니다.'
                        }) + '\n'
                    
                except Exception as e:
                    error_filename = file_info.get('display_filename', '알 수 없는 파일')
                    error_progress = 10 + int((processed_files / total_files) * 80)
                    print(f"파일 처리 오류 ({error_filename}): {str(e)}")
                    yield json.dumps({
                        'progress': error_progress,
                        'message': f'{error_filename} 처리 중 오류 발생: {str(e)}'
                    }) + '\n'
                
                processed_files += 1
            
            # 3. 완료 메시지
            db_status = database.get_database_status()
            
            if not sync_needed:
                yield json.dumps({
                    'progress': 100,
                    'message': f'🛈 동기화할 항목이 없습니다. 현재 모든 파일은 최신 상태입니다.'
                }) + '\n'
            else:
                yield json.dumps({
                    'progress': 100,
                    'message': f'동기화 완료! 현재 문서 {db_status.get("document_count", 0)}개, 청크 {db_status.get("chunk_count", 0)}개'
                }) + '\n'
        
        # 스트리밍 응답 반환
        return app.response_class(generate_progress(), mimetype='text/event-stream')
    
    except Exception as e:
        print(f"문서 동기화 오류: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 데이터베이스 초기화 후 앱 실행
if __name__ == '__main__':
    # 데이터베이스 초기화
    init_db()
    
    # Replit에서는 포트가 환경변수로 제공됩니다
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)