import os
import json
import uuid
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
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'txt'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# 업로드 폴더 생성
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# OpenAI API 키 설정
openai_api_key = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=openai_api_key)

def allowed_file(filename):
    """파일 확장자 체크"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

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
        
        # 시스템 프롬프트 구성
        system_prompt = "너는 신한은행 네트워크 전문가로서 정확하고 친절하게 답변해줘"
        
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
            filename = secure_filename(file.filename)
            
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
                        'file_type': original_filename.split('.')[-1].lower()
                    })
        
        return jsonify({
            'document_count': document_status.get('document_count', 0),
            'chunk_count': document_status.get('chunk_count', 0),
            'files': files
        })
    except Exception as e:
        print(f"Error getting documents: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)