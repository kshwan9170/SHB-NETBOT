import os
import uuid
import shutil
import re
import json as global_json  # 전역 JSON 모듈에 별칭 부여
import urllib.parse
import time
from pathlib import Path
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, abort
import openai
from openai import OpenAI

# 게시판 모델 임포트
from models import init_db, get_db, close_db, InquiryBoard, FeedbackBoard, ReportBoard, ChatFeedbackModel

# Custom modules
import database
import document_processor
import chatbot
from config import FAQ_KEYWORDS, FINE_TUNED_MODEL, RAG_SYSTEM
from flow_converter import check_and_sync_flow, get_offline_flow

# CSV 파일 처리 초기화
chatbot.initialize_csv_narratives()

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
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'txt', 'csv'}
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
    


@app.route('/static/<path:path>')
def serve_static(path):
    return app.send_static_file(path)

@app.route('/api/connection_status', methods=['GET'])
def connection_status():
    """
    현재 OpenAI API 연결 상태를 확인합니다.
    
    Returns:
        JSON: 연결 상태 정보 {'status': 'online'/'offline', 'reason': '이유'}
    """
    # OpenAI API 키 확인
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        return jsonify({'status': 'offline', 'reason': 'api_key_missing'}), 200
    
    # OpenAI API 연결 확인 (간단한 요청으로 테스트)
    try:
        openai_client = OpenAI(api_key=openai_key)
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "test"}],
            max_tokens=5
        )
        return jsonify({'status': 'online'}), 200
    except Exception as e:
        print(f"OpenAI API 연결 오류: {str(e)}")
        return jsonify({'status': 'offline', 'reason': 'api_connection_error', 'error': str(e)}), 200

@app.route('/api/sync_offline_data', methods=['POST'])
def sync_offline_data():
    """ChromaDB 데이터를 클라이언트로 전송하여 IndexedDB 동기화"""
    try:
        from csv_to_narrative import CsvNarrativeConverter
        
        # CSV 파일에서 모든 자연어 데이터 생성
        converter = CsvNarrativeConverter()
        all_narratives = []
        
        # 업로드된 CSV 파일들 처리
        uploaded_files = os.listdir('uploaded_files')
        csv_files = [f for f in uploaded_files if f.endswith('.csv') and not f.startswith('test')]
        
        print(f"오프라인 동기화: {len(csv_files)}개 CSV 파일 처리 시작")
        
        for csv_file in csv_files:
            try:
                csv_path = os.path.join('uploaded_files', csv_file)
                narratives = converter.csv_to_narratives(csv_path)
                all_narratives.extend(narratives)
                print(f"CSV 파일 {csv_file}: {len(narratives)}개 레코드 처리 완료")
            except Exception as e:
                print(f"CSV 파일 {csv_file} 처리 오류: {str(e)}")
                continue
        
        print(f"총 {len(all_narratives)}개 레코드를 클라이언트로 전송")
        
        return jsonify({
            'status': 'success',
            'data': all_narratives,
            'total_records': len(all_narratives),
            'csv_files_processed': len(csv_files)
        })
        
    except Exception as e:
        print(f"오프라인 데이터 동기화 오류: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'오프라인 데이터 동기화 중 오류가 발생했습니다: {str(e)}'
        }), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')
    use_offline_mode = data.get('offline_mode', False)
    
    if not user_message:
        return jsonify({'error': '메시지가 비어 있습니다.'}), 400
    
    # 질문 통계 기록 (카테고리는 일단 null로 두고 추후 개선)
    from models import QueryStatisticsModel
    query_stats = QueryStatisticsModel()
    query_stats.record_query(user_message)
    
    # OpenAI API 키 확인
    openai_key = os.getenv("OPENAI_API_KEY")
    
    # 오프라인 모드 강제 설정 여부 또는 API 키 부재 확인
    if use_offline_mode or not openai_key:
        try:
            # 로컬 데이터 기반 응답 생성
            # CSV 데이터가 로드되어 있는지 확인하고, 없으면 재로드 시도
            if not chatbot.csv_narratives:
                print("CSV 데이터가 없어 초기화 시도")
                chatbot.initialize_csv_narratives()
                
            reply = chatbot.get_local_response(user_message)
            offline_message = "[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n"
            
            return jsonify({
                'reply': offline_message + reply,
                'question': user_message,
                'mode': 'offline'
            })
        except Exception as offline_error:
            print(f"오프라인 응답 생성 중 오류: {str(offline_error)}")
            return jsonify({
                'reply': '[🔴 서버 연결이 끊겼습니다.]\n\n모든 기능이 제한됩니다. 네트워크 연결 상태를 확인해 주세요.',
                'question': user_message,
                'mode': 'offline',
                'error': str(offline_error)
            }), 500
    
    # 일반(온라인) 모드
    try:
        # 챗봇 모듈을 활용하여 응답 생성
        # 이 함수는 키워드 기반 분기 처리, Fine-tuned 모델 사용, RAG 시스템 활용을 모두 포함합니다
        reply = chatbot.get_chatbot_response(
            query=user_message,
            model=RAG_SYSTEM["model"],
            use_rag=True
        )
        
        # 로그 기록 (디버깅용)
        print(f"챗봇 응답 생성 완료: {len(user_message)}자 질문 / {len(reply) if reply else 0}자 응답")
        
        return jsonify({'reply': reply, 'question': user_message, 'mode': 'online'})
    
    except Exception as e:
        print(f"API 응답 생성 중 오류 발생, 오프라인 모드로 전환: {str(e)}")
        
        try:
            # API 오류 시 오프라인 모드로 폴백
            # CSV 데이터가 로드되어 있는지 확인하고, 없으면 재로드 시도
            if not chatbot.csv_narratives:
                print("API 오류 모드: CSV 데이터가 없어 초기화 시도")
                chatbot.initialize_csv_narratives()
                
            offline_reply = chatbot.get_local_response(user_message)
            fallback_message = f"[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n"
            
            return jsonify({
                'reply': fallback_message + offline_reply,
                'question': user_message,
                'mode': 'offline'
            })
        except Exception as offline_error:
            print(f"오프라인 응답 생성 중 오류: {str(offline_error)}")
            # 사용자 언어에 맞게 오류 메시지
            if re.search(r'[가-힣]', user_message):
                reply = "[🔴 서버 연결이 끊겼습니다.]\n\n죄송합니다. 현재 서버 연결이 원활하지 않아 응답을 생성할 수 없습니다. 네트워크 연결을 확인해주세요."
            else:
                reply = "[🔴 Server connection lost.]\n\nSorry, the server connection is currently unavailable. Please check your network connection."
                
            return jsonify({'reply': reply, 'question': user_message, 'mode': 'offline'}), 500

@app.route('/api/chat/feedback', methods=['POST'])
def chat_feedback():
    """채팅 피드백 API"""
    try:
        data = request.get_json()
        
        # 필수 파라미터 확인
        if not data or 'question' not in data or 'answer' not in data or 'feedback_type' not in data:
            return jsonify({'error': '필수 정보가 누락되었습니다.'}), 400
        
        question = data['question']
        answer = data['answer']
        feedback_type = data['feedback_type']
        feedback_comment = data.get('feedback_comment', '')  # 선택적 파라미터
        
        # 데이터베이스에 저장
        feedback_model = ChatFeedbackModel()
        feedback_id = feedback_model.create_feedback(
            question=question, 
            answer=answer,
            feedback_type=feedback_type,
            feedback_comment=feedback_comment
        )
        
        return jsonify({
            'success': True,
            'message': '피드백이 성공적으로 저장되었습니다.',
            'feedback_id': feedback_id
        })
        
    except Exception as e:
        print(f"Error in chat feedback API: {str(e)}")
        return jsonify({'error': f'피드백 저장 중 오류가 발생했습니다: {str(e)}'}), 500
        
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
                
                # ⭐ SHB-NetBot_Flow.csv 파일 자동 감지 및 JSON 변환
                flow_sync_message = ""
                if "SHB-NetBot_Flow" in filename and filename.endswith('.csv'):
                    try:
                        print(f"🔄 Flow 파일 감지: {filename} - 즉시 JSON 변환 시작")
                        
                        # Flow 변환기 임포트 및 즉시 실행
                        from flow_converter import FlowConverter
                        import time
                        import json
                        
                        converter = FlowConverter()
                        flow_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
                        
                        # 🚨 중요: 업로드된 파일 즉시 변환
                        conversion_result = converter.csv_to_flow_json(flow_path)
                        
                        if conversion_result and conversion_result.get('success', False):
                            # 타임스탬프 추가하여 클라이언트 캐시 무효화 강제
                            timestamp = int(time.time() * 1000)
                            
                            try:
                                json_path = converter.output_path
                                if os.path.exists(json_path):
                                    with open(json_path, 'r', encoding='utf-8') as f:
                                        flow_data = json.load(f)
                                    
                                    # 🔄 강제 동기화를 위한 메타데이터 추가
                                    flow_data['_sync_metadata'] = {
                                        'last_updated': timestamp,
                                        'source_file': filename,
                                        'force_refresh': True,
                                        'version': f"upload_{timestamp}",
                                        'cache_bust': f"flow_{timestamp}"
                                    }
                                    
                                    with open(json_path, 'w', encoding='utf-8') as f:
                                        json.dump(flow_data, f, ensure_ascii=False, indent=2)
                                    
                                    print(f"🔄 Flow JSON 강제 갱신 완료: {timestamp}")
                                    flow_sync_message = f"\n✅ Flow 실시간 동기화 완료: {conversion_result.get('nodes_count', 0)}개 노드 (버전: {timestamp})"
                                    
                            except Exception as meta_error:
                                print(f"⚠️ 메타데이터 추가 실패: {meta_error}")
                                flow_sync_message = f"\n✅ Flow 기본 동기화 완료: {conversion_result.get('nodes_count', 0)}개 노드"
                            
                            print(f"✅ Flow 업로드 후 즉시 변환 완료: {conversion_result}")
                        else:
                            flow_sync_message = f"\n❌ Flow 변환 실패: {conversion_result.get('message', '알 수 없는 오류')}"
                            print(f"❌ Flow 즉시 변환 실패: {conversion_result}")
                            
                    except Exception as flow_error:
                        flow_sync_message = f"\n❌ Flow 변환 중 오류: {str(flow_error)}"
                        print(f"❌ Flow 자동 변환 오류: {str(flow_error)}")
                
                # 성공 결과 추가
                results.append({
                    'filename': filename,
                    'status': 'success',
                    'message': '문서가 성공적으로 처리되었습니다.' + flow_sync_message,
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
            if not filename.startswith('.') and not filename.endswith('_metadata.json'):  # 숨김 파일과 메타데이터 파일 제외
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
        
# CSV 파일 편집 API 엔드포인트 
@app.route('/api/documents/edit/<path:system_filename>', methods=['POST'])
def edit_document(system_filename):
    """문서 내용 편집 API - CSV 파일 웹 편집 지원"""
    try:
        # 파일명에 특수문자가 있을 경우 처리 (URL 디코딩)
        decoded_filename = urllib.parse.unquote(system_filename)
        print(f"Attempting to edit document: {decoded_filename}")
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], decoded_filename)
        
        # 파일이 존재하지 않는 경우
        if not os.path.exists(file_path):
            return jsonify({
                'status': 'error',
                'message': f'요청한 파일을 찾을 수 없습니다: {decoded_filename}'
            }), 404
        
        # 원본 파일명 추출 및 파일 형식 확인
        basename = os.path.basename(file_path)
        parts = basename.split("_", 1)
        original_filename = parts[1] if len(parts) > 1 else basename
        file_extension = os.path.splitext(original_filename)[1][1:].lower()
        
        # CSV 파일만 편집 지원
        if file_extension != 'csv':
            return jsonify({
                'status': 'error',
                'message': f'현재 CSV 파일만 편집을 지원합니다. 파일 형식: {file_extension}'
            }), 400
        
        # 요청 데이터 가져오기
        request_data = request.get_json()
        if not request_data or 'headers' not in request_data or 'data' not in request_data:
            return jsonify({
                'status': 'error',
                'message': '유효하지 않은 데이터 형식입니다. headers와 data 필드가 필요합니다.'
            }), 400
        
        headers = request_data['headers']
        data = request_data['data']
        encoding = request_data.get('encoding', 'utf-8')
        
        # CSV 파일 업데이트
        from csv_editor import update_csv_file, get_csv_preview_html
        success = update_csv_file(file_path, headers, data, encoding)
        
        if not success:
            return jsonify({
                'status': 'error',
                'message': 'CSV 파일 업데이트 중 오류가 발생했습니다.'
            }), 500
        
        # 업데이트된 CSV 파일 읽기
        import pandas as pd
        try:
            df = pd.read_csv(file_path, encoding=encoding)
        except UnicodeDecodeError:
            # 다른 인코딩 시도
            try:
                encoding = 'cp949' if encoding == 'utf-8' else 'utf-8'
                df = pd.read_csv(file_path, encoding=encoding)
            except Exception as e:
                return jsonify({
                    'status': 'error',
                    'message': f'CSV 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }), 500
        
        # 메타데이터 파일 경로
        metadata_filename = f"{os.path.splitext(decoded_filename)[0]}_metadata.json"
        metadata_path = os.path.join(app.config['UPLOAD_FOLDER'], metadata_filename)
        
        # HTML 테이블 생성 (편집된 내용 표시)
        table_html = df.to_html(classes='table table-striped table-bordered table-hover editable-csv-table', index=False, na_rep='')
        
        # 성공 응답
        return jsonify({
            'status': 'success',
            'message': 'CSV 파일이 성공적으로 업데이트되었습니다.',
            'content': table_html,
            'file_type': 'csv'
        })
        
    except Exception as e:
        print(f"Error editing document: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'문서 편집 중 오류가 발생했습니다: {str(e)}'
        }), 500

@app.route('/api/documents/view/<path:system_filename>', methods=['GET'])
def view_document(system_filename):
    """문서 내용 조회 API - 다양한 파일 형식 지원"""
    try:
        # 파일명에 특수문자가 있을 경우 처리 (URL 디코딩)
        decoded_filename = urllib.parse.unquote(system_filename)
        print(f"Attempting to view document: {decoded_filename}")
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], decoded_filename)
        print(f"File path: {file_path}")
        
        # 파일이 존재하지 않는 경우 파일명 기반으로 다시 검색
        if not os.path.exists(file_path):
            # 시스템에 존재하는 모든 파일 확인
            all_files = os.listdir(app.config['UPLOAD_FOLDER'])
            matching_files = [f for f in all_files if decoded_filename in f]
            
            if matching_files:
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], matching_files[0])
                print(f"Found similar file: {matching_files[0]}")
            else:
                return jsonify({
                    'status': 'error',
                    'message': f'요청한 파일을 찾을 수 없습니다: {decoded_filename}'
                }), 404
        
        print(f"File exists: {os.path.exists(file_path)}")
        
        # 원본 파일명 추출 및 파일 형식 확인
        basename = os.path.basename(file_path)
        parts = basename.split("_", 1)
        original_filename = parts[1] if len(parts) > 1 else basename
        file_extension = os.path.splitext(original_filename)[1][1:].lower()
        
        print(f"Original filename: {original_filename}, Extension: {file_extension}")
        
        # 파일 형식별 처리
        content = ""
        
        # TXT 파일 처리
        if file_extension == 'txt':
            # 파일 내용 읽기 (UTF-8 먼저 시도, 실패 시 CP949 시도)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                try:
                    with open(file_path, 'r', encoding='cp949') as f:
                        content = f.read()
                except Exception as e:
                    return jsonify({
                        'status': 'error',
                        'message': f'파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                    }), 500
        
        # CSV 파일 처리
        elif file_extension == 'csv':
            import pandas as pd
            from csv_editor import generate_csv_metadata, save_csv_metadata, get_csv_preview_html
            
            try:
                # CSV 파일 읽기 시도 (다양한 인코딩 순차적으로 시도)
                encodings = ['utf-8', 'cp949', 'latin1']
                df = None
                used_encoding = None
                
                for encoding in encodings:
                    try:
                        # 먼저 첫 줄만 읽어서 헤더 확인
                        header_check = pd.read_csv(file_path, dtype=str, nrows=1, encoding=encoding)
                        header_count = len(header_check.columns)
                        
                        # 헤더가 1개만 있는 경우 (인코딩이 잘못 인식되었을 가능성)
                        if header_count <= 1:
                            print(f"{encoding} 인코딩으로 헤더를 읽었으나 열이 {header_count}개밖에 없습니다. 다른 방법 시도...")
                            # 헤더 없이 읽기
                            df_raw = pd.read_csv(file_path, header=None, encoding=encoding)
                            if len(df_raw) > 0 and len(df_raw.columns) > 1:
                                # 첫 번째 행을 헤더로 사용
                                df = pd.DataFrame(df_raw.values[1:], columns=df_raw.iloc[0])
                                print(f"헤더 없이 읽었을 때 열 개수: {len(df.columns)}")
                            else:
                                # 첫 번째 행 포함해서 데이터로 사용 (열 구분 문제인 경우)
                                try:
                                    sep_options = [',', ';', '\t', '|']
                                    for sep in sep_options:
                                        try:
                                            df_test = pd.read_csv(file_path, sep=sep, encoding=encoding)
                                            if len(df_test.columns) > 1:
                                                df = df_test
                                                print(f"구분자 '{sep}'로 성공적으로 {len(df.columns)}개 열 읽음")
                                                break
                                        except:
                                            continue
                                except:
                                    # 모든 방법 실패 시 기본으로 돌아가기
                                    pass
                        else:
                            # 정상적으로 헤더가 여러 개 인식됨
                            df = pd.read_csv(file_path, dtype=str, na_filter=False, encoding=encoding)
                        
                        used_encoding = encoding
                        print(f"CSV 파일 '{original_filename}' {encoding} 인코딩으로 성공적으로 읽음, 열 개수: {len(df.columns if df is not None else header_check.columns)}")
                        break
                    except Exception as e:
                        print(f"{encoding} 인코딩으로 읽기 실패: {str(e)}")
                        continue
                
                # 모든 인코딩 시도 후에도 실패한 경우
                if df is None:
                    return jsonify({
                        'status': 'error',
                        'message': f'CSV 파일을 읽을 수 없습니다. 지원되지 않는 인코딩입니다.'
                    }), 500
                    
                # 데이터 확인
                print(f"최종 열 목록: {df.columns.tolist()}")
                print(f"데이터 행 수: {len(df)}")
                
                # 메타데이터 생성 및 저장
                metadata_filename = f"{os.path.splitext(decoded_filename)[0]}_metadata.json"
                metadata_path = os.path.join(app.config['UPLOAD_FOLDER'], metadata_filename)
                metadata = generate_csv_metadata(file_path)
                save_csv_metadata(metadata, metadata_path)
                
                # 편집 가능한 HTML 미리보기 생성
                html_content = get_csv_preview_html(
                    df=df, 
                    filename=original_filename, 
                    system_filename=decoded_filename, 
                    metadata_filename=os.path.basename(metadata_path)
                )
                
                return jsonify({
                    'status': 'success',
                    'html_content': True,
                    'file_type': 'csv',
                    'content': html_content,
                    'metadata_generated': True,
                    'encoding': used_encoding
                })
                
            except Exception as e:
                print(f"CSV 파일 처리 중 오류: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': f'CSV 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }), 500
        
        # JSON 파일 처리
        elif file_extension == 'json':
            try:
                # JSON 파일 읽기
                try:
                    # UTF-8로 시도
                    with open(file_path, 'r', encoding='utf-8') as f:
                        json_content = f.read()
                except UnicodeDecodeError:
                    # CP949로 시도 (한글 파일명 대응)
                    with open(file_path, 'r', encoding='cp949') as f:
                        json_content = f.read()
                
                # JSON 포맷팅 처리
                import json as json_module  # 이름 충돌을 피하기 위해 별칭 사용
                try:
                    parsed_json = json_module.loads(json_content)
                    formatted_json = json_module.dumps(parsed_json, indent=2, ensure_ascii=False)
                    
                    # HTML로 표시하기 위한 처리
                    content = f"""
                    <div class="json-container">
                        <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                            <h3 style="margin: 0; color: #333;">JSON 파일 내용</h3>
                            <p style="margin: 5px 0 0;">파일명: {original_filename}</p>
                        </div>
                        <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow: auto; white-space: pre-wrap; font-family: monospace; line-height: 1.5;">{formatted_json}</pre>
                    </div>
                    """
                    
                    # HTML 콘텐츠로 반환
                    return jsonify({
                        'status': 'success',
                        'html_content': True,
                        'content': content,
                        'file_type': 'json'
                    })
                    
                except global_json.JSONDecodeError as je:
                    # 유효하지 않은 JSON인 경우 오류 메시지와 함께 원본 텍스트로 표시
                    content = f"""
                    <div class="json-container">
                        <div style="background-color: #fff0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ffcccc;">
                            <h3 style="margin: 0; color: #cc0000;">유효하지 않은 JSON 파일</h3>
                            <p style="margin: 5px 0 0;">오류: {str(je)}</p>
                        </div>
                        <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow: auto; white-space: pre-wrap; font-family: monospace; line-height: 1.5;">{json_content}</pre>
                    </div>
                    """
                    
                    return jsonify({
                        'status': 'success',
                        'html_content': True,
                        'content': content,
                        'file_type': 'json'
                    })
                    
            except Exception as e:
                print(f"JSON 파일 처리 중 오류: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': f'JSON 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }), 500

        # PDF 파일 처리
        elif file_extension == 'pdf':
            import base64
            with open(file_path, 'rb') as f:
                pdf_content = f.read()
                # PDF를 base64로 인코딩
                pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
                
                # PDF 뷰어를 위한 HTML 콘텐츠 생성
                content = f"""
                <div class="pdf-container" style="width: 100%; height: 800px; display: flex; flex-direction: column;">
                    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                        <h3 style="margin: 0; color: #333;">PDF 파일 미리보기</h3>
                        <p style="margin: 5px 0 0;">파일명: {original_filename}</p>
                    </div>
                    <iframe 
                        src="data:application/pdf;base64,{pdf_base64}" 
                        width="100%" 
                        height="100%" 
                        style="border: 1px solid #ddd; border-radius: 5px;"
                        title="PDF 미리보기">
                        <p>PDF를 표시할 수 없습니다. <a href="data:application/pdf;base64,{pdf_base64}" download="{original_filename}">여기를 클릭하여 다운로드</a>하세요.</p>
                    </iframe>
                </div>
                """
                
            return jsonify({
                'status': 'success',
                'html_content': True,
                'content': content,
                'file_type': 'pdf'
            })
        
        # CSV 파일 처리 (이 부분은 위에서 이미 처리됨)
        elif file_extension == 'csv':
            # 이미 위에서 CSV 파일 처리 로직을 구현했으므로 여기서는 건너뜀
            pass

        # Excel 파일 처리
        elif file_extension in ['xlsx', 'xls']:
            import pandas as pd
            import io
            import base64
            try:
                # 엑셀 파일의 모든 시트 읽기
                excel_file = pd.ExcelFile(file_path)
                sheet_names = excel_file.sheet_names
                
                # 모든 시트를 HTML로 변환
                all_sheets_html = []
                
                for sheet_name in sheet_names:
                    # 시트 읽기 설정 - 모든 열을 텍스트로 처리하여 데이터 유실 방지
                    df = pd.read_excel(file_path, sheet_name=sheet_name, dtype=str, na_filter=False)
                    
                    # 데이터프레임이 비어있으면 건너뛰기
                    if df.empty:
                        sheet_html = f'<div class="sheet-container"><h3 class="sheet-name">시트: {sheet_name}</h3>'
                        sheet_html += '<p class="empty-sheet">이 시트에는 데이터가 없습니다.</p>'
                        sheet_html += '</div>'
                        all_sheets_html.append(sheet_html)
                        continue
                    
                    # 테이블 HTML 생성 시 설정
                    sheet_html = f'<div class="sheet-container"><h3 class="sheet-name">시트: {sheet_name}</h3>'
                    sheet_html += df.to_html(
                        index=False, 
                        classes='table table-striped table-bordered',
                        na_rep='', 
                        escape=False,  # HTML 태그 허용
                        border=1
                    )
                    sheet_html += '</div>'
                    all_sheets_html.append(sheet_html)
                
                # 원본 엑셀 다운로드 링크 제공을 위해 엑셀 파일 base64 인코딩
                with open(file_path, 'rb') as excel:
                    excel_data = excel.read()
                    excel_base64 = base64.b64encode(excel_data).decode('utf-8')
                
                # 모든 시트 HTML 합치기 (다운로드 링크 포함)
                content = '<div class="excel-container">'
                content += f'''
                <div class="excel-download">
                    <a href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{excel_base64}" 
                       download="{original_filename}" class="excel-download-btn">
                        원본 엑셀 파일 다운로드
                    </a>
                </div>
                '''
                content += ''.join(all_sheets_html)
                content += '</div>'
            except Exception as e:
                print(f"Excel 파일 처리 중 오류: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': f'엑셀 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }), 500
        
        # Word 파일 처리
        elif file_extension == 'docx':
            try:
                from docx import Document
                doc = Document(file_path)
                # 문서의 모든 단락을 텍스트로 추출
                paragraphs = [p.text for p in doc.paragraphs]
                content = "\n\n".join(paragraphs)
            except Exception as e:
                return jsonify({
                    'status': 'error',
                    'message': f'Word 문서를 읽는 중 오류가 발생했습니다: {str(e)}'
                }), 500
        
        # 지원하지 않는 파일 형식
        else:
            return jsonify({
                'status': 'error',
                'message': f'이 파일 형식({file_extension})은 내용 조회를 지원하지 않습니다.'
            }), 400
        
        return jsonify({
            'status': 'success',
            'filename': original_filename,
            'content': content,
            'file_type': file_extension
        })
    
    except Exception as e:
        print(f"Error viewing document: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'문서 조회 중 오류가 발생했습니다: {str(e)}'
        }), 500

# 이전 편집 기능 비활성화 코드 (CSV 편집 기능으로 대체됨)
# @app.route('/api/documents/edit/<path:system_filename>', methods=['POST'])
# def edit_document_disabled(system_filename):
#     """문서 내용 편집 API - 요청에 따라 비활성화됨"""
#     return jsonify({
#         'status': 'error',
#         'message': '편집 기능이 비활성화되었습니다. 모든 문서는 읽기 전용으로 제공됩니다.'
#     }), 403
        
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
                
                # CSV 또는 Excel 파일인 경우 자동 전처리 수행
                file_extension = Path(final_path).suffix.lower()
                processed_file_path = final_path
                
                if file_extension in ['.csv', '.xlsx', '.xls']:
                    # 자동 전처리 모듈 임포트
                    from auto_processor import auto_process_file
                    
                    # 전처리 수행
                    success, processed_path = auto_process_file(final_path)
                    if success and processed_path:
                        print(f"자동 전처리 완료: {final_path} -> {processed_path}")
                        processed_file_path = processed_path
                        response_data['auto_processed'] = True
                    else:
                        print(f"자동 전처리 실패, 원본 파일을 사용합니다: {final_path}")
                        response_data['auto_processed'] = False
                
                # 문서 처리 (원본 또는 전처리된 파일)
                chunks = document_processor.process_document(processed_file_path)
                
                # 벡터 DB에 청크 추가
                if chunks:
                    print(f"벡터 DB에 {len(chunks)}개 청크 저장 중...")
                    database.add_document_embeddings(chunks)
                    print(f"벡터 DB에 {len(chunks)}개 청크 저장 완료: {safe_filename}")
                
                # 파일 완성 정보 추가
                response_data['fileComplete'] = True
                response_data['finalFilename'] = safe_filename
                response_data['size'] = os.path.getsize(processed_file_path)
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
            
            yield global_json.dumps({
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
                
                yield global_json.dumps({
                    'progress': 10,
                    'message': f'{len(files)}개 문서를 확인했습니다.'
                }) + '\n'
                
            except Exception as e:
                print(f"파일 목록 수집 오류: {str(e)}")
                yield global_json.dumps({
                    'progress': 10,
                    'message': f'파일 목록 수집 중 오류: {str(e)}'
                }) + '\n'
                return
            
            if not files:
                yield global_json.dumps({
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
            
            # 1. 파일 시스템과 벡터 DB 동기화 체크
            # 현재 파일 시스템에 있는 문서 ID 목록
            filesystem_doc_ids = set(file_info['doc_id'] for file_info in files)
            
            # 벡터 DB에는 있지만 파일 시스템에는 없는 문서 ID 찾기
            orphaned_doc_ids = existing_doc_ids - filesystem_doc_ids
            
            # 더 이상 존재하지 않는 문서의 임베딩 제거
            if orphaned_doc_ids:
                orphaned_count = len(orphaned_doc_ids)
                yield global_json.dumps({
                    'progress': 5,
                    'message': f'🔍 파일 시스템에 더 이상 존재하지 않는 {orphaned_count}개의 문서 데이터 정리 중...'
                }) + '\n'
                
                # 각 고아 문서 제거
                removed_count = 0
                for doc_id in orphaned_doc_ids:
                    if database.delete_document(doc_id):
                        removed_count += 1
                
                yield global_json.dumps({
                    'progress': 10,
                    'message': f'✅ 삭제된 문서 {removed_count}개의 정보가 벡터 DB에서 제거되었습니다. 이 정보는 더 이상 챗봇 응답에 사용되지 않습니다.'
                }) + '\n'
            
            # 2. 새로운 문서 처리
            files_to_process = []
            
            # 처리가 필요한 파일만 필터링
            for file_info in files:
                doc_id = file_info['doc_id']
                if doc_id not in existing_doc_ids:
                    files_to_process.append(file_info)
            
            # 새롭게 처리할 파일이 없고 삭제된 파일도 없으면 동기화 필요 없음
            if not files_to_process and not orphaned_doc_ids:
                yield global_json.dumps({
                    'progress': 100,
                    'message': f'🛈 동기화할 항목이 없습니다. 현재 모든 파일은 최신 상태입니다.'
                }) + '\n'
                return
            
            # 새롭게 처리가 필요한 파일로 목록 갱신
            if files_to_process:
                files = files_to_process
                total_files = len(files)
            else:
                yield global_json.dumps({
                    'progress': 100,
                    'message': f'🛈 새롭게 추가할 문서가 없습니다. 삭제된 문서 정보 정리가 완료되었습니다.'
                }) + '\n'
                return
            
            for file_info in files:
                try:
                    file_path = file_info['file_path']
                    doc_id = file_info['doc_id']
                    display_filename = file_info['display_filename']
                    
                    # 현재 파일 처리 시작 메시지
                    current_progress = 10 + int((processed_files / total_files) * 80)
                    yield global_json.dumps({
                        'progress': current_progress,
                        'message': f'({processed_files+1}/{total_files}) {display_filename} 동기화 중...'
                    }) + '\n'
                    
                    # 문서 처리 및 벡터 DB 업데이트
                    if allowed_file(display_filename):
                        # 기존 문서 ID로 먼저 삭제 (문서 업데이트 효과)
                        deleted = database.delete_document(doc_id)
                        
                        # 특별히 Excel 파일 처리 (파일명 변경에도 매핑 유지)
                        # "업무 안내 가이드" 또는 "업무안내" 등의 키워드가 포함된 엑셀 파일 식별
                        # 일자별 파일 업데이트 형식도 자동 인식 (예: 업무 안내 가이드_2025.05.19.xlsx)
                        excel_procedure_file = False
                        excel_date_pattern = re.search(r'_(\d{4}[.년\-_]\d{1,2}[.월\-_]\d{1,2})', display_filename)
                        file_date = excel_date_pattern.group(1) if excel_date_pattern else "최신"
                        
                        if display_filename.lower().endswith(('.xlsx', '.xls')):
                            # 업무 안내 가이드 파일 패턴 체크 (날짜 형식이 포함된 버전도 인식)
                            guide_keywords = ['업무 안내', '업무_안내', '업무안내', '가이드', '매뉴얼', '절차']
                            
                            if any(keyword in display_filename for keyword in guide_keywords):
                                excel_procedure_file = True
                                yield global_json.dumps({
                                    'progress': current_progress,
                                    'message': f'✨ {display_filename} - 업무 안내 가이드 파일로 인식되었습니다. 절차 안내 시트를 세부 항목별로 분리하여 처리합니다. (버전: {file_date})'
                                }) + '\n'
                            
                        # 문서 처리
                        chunks = document_processor.process_document(file_path)
                        
                        # 청크가 없으면 다음 파일로
                        if not chunks:
                            yield global_json.dumps({
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
                        
                        yield global_json.dumps({
                            'progress': current_progress + 5,
                            'message': f'{display_filename} 처리 완료 (청크 {len(chunks)}개)'
                        }) + '\n'
                    else:
                        yield global_json.dumps({
                            'progress': current_progress,
                            'message': f'{display_filename}은 지원되지 않는 파일 형식입니다.'
                        }) + '\n'
                    
                except Exception as e:
                    error_filename = file_info.get('display_filename', '알 수 없는 파일')
                    error_progress = 10 + int((processed_files / total_files) * 80)
                    print(f"파일 처리 오류 ({error_filename}): {str(e)}")
                    yield global_json.dumps({
                        'progress': error_progress,
                        'message': f'{error_filename} 처리 중 오류 발생: {str(e)}'
                    }) + '\n'
                
                processed_files += 1
            
            # 3. 완료 메시지
            db_status = database.get_database_status()
            
            if not sync_needed:
                yield global_json.dumps({
                    'progress': 100,
                    'message': f'🛈 동기화할 항목이 없습니다. 현재 모든 파일은 최신 상태입니다.'
                }) + '\n'
            else:
                yield global_json.dumps({
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