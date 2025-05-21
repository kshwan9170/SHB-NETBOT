"""
CSV 파일 편집 기능 추가 스크립트
이 파일을 실행하여 app.py에 CSV 편집 관련 라우트를 추가합니다.
"""

import os
import re

# app.py 파일 읽기
with open('app.py', 'r', encoding='utf-8') as f:
    app_code = f.read()

# edit_document 라우트 추가 - 기존 라우트 직전에 삽입
new_route = '''
@app.route('/api/documents/edit/<path:system_filename>', methods=['POST'])
def edit_document(system_filename):
    """문서 내용 편집 API - CSV 파일 웹 편집 지원"""
    try:
        import json
        import pandas as pd
        from csv_editor import update_csv_file, get_csv_preview_html
        
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
        success = update_csv_file(file_path, headers, data, encoding)
        
        if not success:
            return jsonify({
                'status': 'error',
                'message': 'CSV 파일 업데이트 중 오류가 발생했습니다.'
            }), 500
        
        # 업데이트된 CSV 파일 읽기
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

'''

# 다운로드 라우트 직전에 삽입
download_route_pattern = r'@app\.route\(\'/api/documents/download/<path:system_filename>\'\)\ndef download_document'
if download_route_pattern in app_code:
    modified_app_code = app_code.replace(download_route_pattern, new_route + '\n\n' + download_route_pattern)
    
    # 파일 저장
    with open('app.py', 'w', encoding='utf-8') as f:
        f.write(modified_app_code)
    
    print("CSV 편집 기능이 app.py에 성공적으로 추가되었습니다.")
else:
    print("다운로드 라우트를 찾을 수 없습니다. app.py 파일에 직접 기능을 추가해야 합니다.")

# CSV 파일 처리 부분 수정 (파일 용량 문제로 전체 코드를 수정하진 않고, 방법만 제시)
print("""
이제 app.py 파일의 CSV 처리 부분을 수정해야 합니다.
다음 위치에서 코드를 찾으세요:

1. 'file_extension == 'csv'' 부분을 찾아서
2. 다음 코드로 교체하세요:

elif file_extension == 'csv':
    import pandas as pd
    from csv_editor import generate_csv_metadata, save_csv_metadata, get_csv_preview_html
    try:
        # CSV 읽기 (UTF-8 먼저 시도)
        try:
            df = pd.read_csv(file_path, encoding='utf-8')
            encoding = 'utf-8'
        except UnicodeDecodeError:
            df = pd.read_csv(file_path, encoding='cp949')
            encoding = 'cp949'
        
        # 메타데이터 생성 및 저장
        metadata_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{os.path.splitext(decoded_filename)[0]}_metadata.json")
        metadata = generate_csv_metadata(file_path)
        save_csv_metadata(metadata, metadata_path)
        
        # HTML 미리보기 생성
        html = get_csv_preview_html(
            df=df, 
            filename=original_filename, 
            system_filename=decoded_filename, 
            metadata_filename=os.path.basename(metadata_path)
        )
        
        return jsonify({
            'status': 'success',
            'html_content': True,
            'file_type': 'csv',
            'content': html,
            'metadata_generated': True,
            'encoding': encoding
        })
    except Exception as e:
        print(f"CSV 파일 처리 중 오류: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'CSV 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
        }), 500
""")