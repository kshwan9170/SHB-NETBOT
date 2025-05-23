"""
새로운 파일 미리보기 API - 파일 형식별 최적화된 렌더링
"""
import os
import json
import base64
import pandas as pd
from flask import jsonify

def view_document_new(system_filename, upload_folder):
    """파일 형식별 최적화된 미리보기 제공"""
    try:
        file_path = os.path.join(upload_folder, system_filename)
        
        if not os.path.exists(file_path):
            return jsonify({
                'status': 'error',
                'message': '파일을 찾을 수 없습니다.'
            }), 404
        
        # 파일 정보 추출
        original_filename = '_'.join(system_filename.split('_')[1:])
        file_extension = original_filename.split('.')[-1].lower()
        
        # CSV 파일 처리
        if file_extension == 'csv':
            try:
                # 인코딩 감지 및 CSV 읽기
                try:
                    df = pd.read_csv(file_path, encoding='utf-8')
                except UnicodeDecodeError:
                    try:
                        df = pd.read_csv(file_path, encoding='cp949')
                    except UnicodeDecodeError:
                        df = pd.read_csv(file_path, encoding='iso-8859-1')
                
                # HTML 테이블 생성
                html_table = '''
                <div style="max-height: 400px; overflow: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; font-family: Arial, sans-serif;">
                <thead style="background-color: #f8f9fa; position: sticky; top: 0;">
                <tr>
                '''
                
                # 헤더 생성
                for col in df.columns:
                    html_table += f'<th style="border: 1px solid #dee2e6; padding: 8px; text-align: left; font-weight: 600;">{col}</th>'
                html_table += '</tr></thead><tbody>'
                
                # 데이터 행 생성 (최대 100행)
                for i, row in df.head(100).iterrows():
                    html_table += '<tr style="border-bottom: 1px solid #dee2e6;">'
                    for col in df.columns:
                        cell_value = str(row[col]) if pd.notna(row[col]) else ''
                        html_table += f'<td style="border: 1px solid #dee2e6; padding: 8px; vertical-align: top;">{cell_value}</td>'
                    html_table += '</tr>'
                
                html_table += '</tbody></table></div>'
                
                if len(df) > 100:
                    html_table += f'<p style="margin-top: 10px; color: #6c757d; font-style: italic; font-size: 12px;">처음 100행만 표시됩니다. (전체 {len(df)}행)</p>'
                
                return {
                    'status': 'success',
                    'content': html_table,
                    'content_type': 'html',
                    'filename': original_filename,
                    'file_type': file_extension
                }
                
            except Exception as e:
                return {
                    'status': 'error',
                    'message': f'CSV 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }
        
        # JSON 파일 처리
        elif file_extension == 'json':
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                
                # JSON을 예쁘게 포맷팅 (한글 보존)
                formatted_json = json.dumps(json_data, ensure_ascii=False, indent=2)
                
                content = f'''
                <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; max-height: 400px; overflow: auto;">
                <pre style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4; white-space: pre-wrap;">{formatted_json}</pre>
                </div>
                '''
                
                return {
                    'status': 'success',
                    'content': content,
                    'content_type': 'html',
                    'filename': original_filename,
                    'file_type': file_extension
                }
                
            except Exception as e:
                return {
                    'status': 'error',
                    'message': f'JSON 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }
        
        # PDF 파일 처리
        elif file_extension == 'pdf':
            try:
                with open(file_path, 'rb') as f:
                    pdf_content = f.read()
                    pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
                
                # PDF iframe 생성
                content = f'''
                <div style="width: 100%; height: 500px; border: 1px solid #dee2e6; border-radius: 4px;">
                <iframe src="data:application/pdf;base64,{pdf_base64}" 
                        style="width: 100%; height: 100%; border: none;" 
                        type="application/pdf">
                    <p>PDF를 표시할 수 없습니다. <a href="data:application/pdf;base64,{pdf_base64}" target="_blank">새 창에서 열기</a></p>
                </iframe>
                </div>
                '''
                
                return {
                    'status': 'success',
                    'content': content,
                    'content_type': 'html',
                    'filename': original_filename,
                    'file_type': file_extension
                }
                
            except Exception as e:
                return {
                    'status': 'error',
                    'message': f'PDF 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }
        
        # 텍스트 파일 처리
        elif file_extension in ['txt', 'md', 'py', 'js', 'html', 'css', 'xml']:
            try:
                # 인코딩 감지
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        text_content = f.read()
                except UnicodeDecodeError:
                    with open(file_path, 'r', encoding='cp949') as f:
                        text_content = f.read()
                
                # 텍스트 미리보기 (최대 10000자)
                if len(text_content) > 10000:
                    preview_content = text_content[:10000] + '\n\n... (파일이 잘렸습니다)'
                else:
                    preview_content = text_content
                
                content = f'''
                <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; max-height: 400px; overflow: auto;">
                <pre style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4; white-space: pre-wrap;">{preview_content}</pre>
                </div>
                '''
                
                return {
                    'status': 'success',
                    'content': content,
                    'content_type': 'html',
                    'filename': original_filename,
                    'file_type': file_extension
                }
                
            except Exception as e:
                return {
                    'status': 'error',
                    'message': f'텍스트 파일을 읽는 중 오류가 발생했습니다: {str(e)}'
                }
        
        # 지원하지 않는 파일 형식
        else:
            return {
                'status': 'error',
                'message': f'이 파일 형식({file_extension})은 미리보기를 지원하지 않습니다.'
            }
            
    except Exception as e:
        return {
            'status': 'error',
            'message': f'파일 조회 중 오류가 발생했습니다: {str(e)}'
        }