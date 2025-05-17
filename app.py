import os
import json
import uuid
import shutil
from pathlib import Path
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_from_directory
import openai
from openai import OpenAI

# Custom modules
import database
import document_processor

app = Flask(__name__)

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
    """보안을 위해 안전한 파일명 생성"""
    if not filename:
        return ""
    return secure_filename(filename)

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
        # 벡터 DB에서 관련 문서 검색
        relevant_docs = database.search_similar_docs(user_message, top_k=3)
        
        # 스타일 가이드 및 시스템 프롬프트 구성
        system_prompt = """너는 신한은행 네트워크 전문가로서 정확하고 친절하게 답변해줘. 
        
모든 응답은 다음 Markdown 형식 규칙을 따라야 해:

1. 주요 주제는 ## 또는 ### 헤딩으로 구분하기
2. 주제별로 짧은 설명 문단으로 배경이나 목적을 덧붙이기
3. 단계가 있는 경우 번호 매기기(1., 2. 등)와 각 단계에 대한 설명 제공하기
4. 설정, 명령어는 ```bash 또는 ```plaintext 코드 블록으로 표시하기
5. 중요 키워드는 **굵은 텍스트**로 강조하기
6. 순서 없는 목록은 - 또는 * 사용하기
7. 각 주요 섹션 사이에 한 줄 이상의 빈 줄 삽입하기

응답은 항상 구조화되고 깔끔하게 작성해야 해."""
        
        # 관련 문서가 있다면 시스템 프롬프트에 추가
        if relevant_docs:
            context = "\n\n".join([doc.page_content for doc in relevant_docs])
            system_prompt += f"\n\n다음 문서를 참고하여 답변해줘:\n{context}"
        
        # OpenAI API를 호출하여 응답 생성
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.7,
        )
        
        # API 응답에서 텍스트 추출
        reply = response.choices[0].message.content
        
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
            # 보안을 위한 파일명 설정
            if file and file.filename:
                filename = secure_filename(str(file.filename))
            else:
                continue
            
            # 고유한 파일명 생성
            unique_filename = f"{uuid.uuid4()}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            
            try:
                # 파일 저장
                file.save(file_path)
                
                # 문서 처리 및 청크 생성
                chunks = document_processor.process_document(file_path)
                
                # 청크를 벡터 DB에 저장
                database.add_document_embeddings(chunks)
                
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
    # 문자열이 확실한 경우에만 secure_filename 사용
    safe_filename = secure_filename(str(filename))
        
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

if __name__ == '__main__':
    # Replit에서는 포트가 환경변수로 제공됩니다
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=False)