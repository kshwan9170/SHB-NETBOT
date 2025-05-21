"""
CSV 파일 자동 메타데이터 생성 및 편집 기능 모듈
"""

import os
import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any, Optional

def generate_csv_metadata(file_path: str) -> Dict[str, Any]:
    """
    CSV 파일의 메타데이터를 생성합니다.
    
    Args:
        file_path: CSV 파일 경로
        
    Returns:
        메타데이터 딕셔너리
    """
    # 파일 경로 및 이름 정보
    file_info = Path(file_path)
    file_name = file_info.name
    
    try:
        # 인코딩 감지 (UTF-8 시도 후 실패 시 CP949 시도)
        try:
            df = pd.read_csv(file_path, encoding='utf-8')
            encoding = 'utf-8'
        except UnicodeDecodeError:
            df = pd.read_csv(file_path, encoding='cp949')
            encoding = 'cp949'
        
        # 컬럼 정보 생성
        column_info = {}
        for column in df.columns:
            # 컬럼 타입 감지
            col_type = detect_column_type(column)
            
            # 샘플 값 추출 (처음 3개 값)
            sample_values = df[column].astype(str).head(3).tolist() if len(df) > 0 else []
            
            # 값 유형 카운트 (숫자, 문자열 등)
            value_types = {}
            
            # 컬럼 정보 저장
            column_info[str(column)] = {
                "type": col_type,
                "sample_values": sample_values,
                "null_count": df[column].isna().sum(),
            }
        
        # 메타데이터 생성
        metadata = {
            "filename": file_name,
            "file_path": file_path,
            "encoding": encoding,
            "column_count": len(df.columns),
            "row_count": len(df),
            "columns": column_info,
            "generation_date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        return metadata
    
    except Exception as e:
        # 오류 발생 시 최소한의 메타데이터 반환
        return {
            "filename": file_name,
            "file_path": file_path,
            "error": str(e),
            "generation_date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        }

def save_csv_metadata(metadata: Dict[str, Any], metadata_path: str) -> bool:
    """
    메타데이터를 파일로 저장합니다.
    
    Args:
        metadata: 메타데이터 딕셔너리
        metadata_path: 저장할 파일 경로
        
    Returns:
        저장 성공 여부
    """
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"메타데이터 저장 중 오류: {str(e)}")
        return False

def detect_column_type(column_name: str) -> str:
    """
    컬럼 이름을 분석하여 컬럼 유형 추측
    
    Args:
        column_name: 컬럼 이름
        
    Returns:
        컬럼 유형 문자열
    """
    column_name = str(column_name).lower()
    
    # 컬럼 유형 매핑
    type_mappings = {
        'ID': ['id', 'no', 'num', '번호', '순번', 'idx', 'index'],
        'DATE': ['date', 'dt', '날짜', '일자', '기간', '시간', 'date_time', 'datetime', '년월일', '등록일'],
        'NAME': ['name', '이름', '성명', '담당자', '담당자명', '책임자', '직원', '직원명'],
        'DEPARTMENT': ['dept', 'department', '부서', '팀', '조직', '담당부서', '담당 부서'],
        'CATEGORY': ['category', 'cat', '유형', '분류', '카테고리', '구분', '구분자'],
        'SYSTEM': ['system', 'sys', '시스템', '장비', '서버', '서버명', '장비명'],
        'IP': ['ip', 'ip_address', 'ip주소', '아이피', '주소'],
        'KEYWORD': ['keyword', 'key', '키워드', '검색어', '용어', '단어'],
        'DESCRIPTION': ['desc', 'description', '설명', '내용', '상세', '비고', '메모', '설명서', '방법']
    }
    
    for col_type, keywords in type_mappings.items():
        for keyword in keywords:
            if keyword in column_name:
                return col_type
    
    return 'UNKNOWN'

def update_csv_file(file_path: str, headers: List[str], data: List[List[str]], encoding: str = 'utf-8') -> bool:
    """
    CSV 파일을 업데이트합니다.
    
    Args:
        file_path: CSV 파일 경로
        headers: 헤더 목록
        data: 데이터 행 목록 (2차원 배열)
        encoding: 파일 인코딩 (기본값: utf-8)
        
    Returns:
        업데이트 성공 여부
    """
    try:
        # 데이터프레임 생성
        df = pd.DataFrame(data, columns=headers)
        
        # CSV 파일로 저장
        df.to_csv(file_path, index=False, encoding=encoding)
        
        # 메타데이터 자동 업데이트
        metadata_path = f"{os.path.splitext(file_path)[0]}_metadata.json"
        metadata = generate_csv_metadata(file_path)
        save_csv_metadata(metadata, metadata_path)
        
        return True
    except Exception as e:
        print(f"CSV 파일 업데이트 중 오류: {str(e)}")
        return False

def get_csv_preview_html(df: pd.DataFrame, filename: str, system_filename: str, metadata_filename: str = None) -> str:
    """
    CSV 파일을 편집 가능한 HTML 테이블로 변환합니다.
    
    Args:
        df: CSV 데이터프레임
        filename: 원본 파일명
        system_filename: 시스템 파일명
        metadata_filename: 메타데이터 파일명 (선택 사항)
        
    Returns:
        HTML 문자열
    """
    # 메타데이터 파일 존재 여부 확인
    metadata_exists = metadata_filename and os.path.exists(metadata_filename)
    
    # HTML 생성
    html = f"""
    <div style="padding: 20px; max-width: 100%; overflow-x: auto;">
        <h3>CSV 파일: {filename}</h3>
        <div class="csv-controls" style="margin-bottom: 15px;">
            <button id="csv-edit-btn" class="btn btn-primary" onclick="enableCsvEditing()">편집 모드</button>
            <button id="csv-save-btn" class="btn btn-success" style="display:none;" onclick="saveCsvChanges('{system_filename}')">변경사항 저장</button>
            <button id="csv-cancel-btn" class="btn btn-secondary" style="display:none;" onclick="cancelCsvEditing()">취소</button>
            <a href="/api/documents/download/{system_filename}" class="btn btn-info">다운로드</a>
            {f'<button class="btn btn-info" onclick="viewMetadata(\'{metadata_filename}\')">메타데이터 보기</button>' if metadata_exists else ''}
        </div>
        <div id="csv-table-container" style="max-height: 600px; overflow-y: auto;">
            {df.to_html(classes='table table-striped table-bordered table-hover editable-csv-table', index=False, na_rep='')}
        </div>
    </div>
    
    <script>
    let originalCsvData = null;
    
    function enableCsvEditing() {
        // 현재 테이블 상태 저장
        originalCsvData = document.getElementById('csv-table-container').innerHTML;
        
        // 테이블 셀을 편집 가능하게 변경
        const table = document.querySelector('.editable-csv-table');
        const cells = table.querySelectorAll('td');
        
        cells.forEach(cell => {
            cell.contentEditable = true;
            cell.style.backgroundColor = '#fffde7';
            cell.addEventListener('focus', function() {
                this.style.backgroundColor = '#fff9c4';
            });
            cell.addEventListener('blur', function() {
                this.style.backgroundColor = '#fffde7';
            });
        });
        
        // 버튼 상태 변경
        document.getElementById('csv-edit-btn').style.display = 'none';
        document.getElementById('csv-save-btn').style.display = 'inline-block';
        document.getElementById('csv-cancel-btn').style.display = 'inline-block';
    }
    
    function cancelCsvEditing() {
        // 원래 테이블로 복원
        document.getElementById('csv-table-container').innerHTML = originalCsvData;
        
        // 버튼 상태 변경
        document.getElementById('csv-edit-btn').style.display = 'inline-block';
        document.getElementById('csv-save-btn').style.display = 'none';
        document.getElementById('csv-cancel-btn').style.display = 'none';
    }
    
    function saveCsvChanges(filename, encoding = 'utf-8') {
        // 테이블에서 데이터 추출
        const table = document.querySelector('.editable-csv-table');
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
        );
        
        // 데이터 전송
        fetch('/api/documents/edit/' + filename, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                headers: headers,
                data: rows,
                encoding: encoding
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('CSV 파일이 성공적으로 저장되었습니다.');
                // 편집 모드 종료
                cancelCsvEditing();
                // 변경된 내용으로 테이블 업데이트
                document.getElementById('csv-table-container').innerHTML = data.content;
            } else {
                alert('저장 중 오류가 발생했습니다: ' + data.message);
            }
        })
        .catch(error => {
            alert('저장 중 오류가 발생했습니다: ' + error);
        });
    }
    
    function viewMetadata(metadataFilename) {
        fetch('/api/documents/view/' + metadataFilename)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 새 창에 메타데이터 표시
                const metadataWindow = window.open('', '_blank', 'width=800,height=600');
                const html = '<html>' + 
                    '<head>' + 
                    '<title>메타데이터: ' + metadataFilename + '</title>' + 
                    '<link rel="stylesheet" href="/static/css/modern.css">' + 
                    '<style>' + 
                    'body { padding: 20px; font-family: Arial, sans-serif; }' + 
                    'pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }' + 
                    '</style>' + 
                    '</head>' + 
                    '<body>' + 
                    '<h2>메타데이터: ' + metadataFilename + '</h2>' + 
                    data.content + 
                    '</body>' + 
                    '</html>';
                metadataWindow.document.write(html);
            } else {
                alert('메타데이터를 불러오는 중 오류가 발생했습니다: ' + data.message);
            }
        })
        .catch(error => {
            alert('메타데이터를 불러오는 중 오류가 발생했습니다: ' + error);
        });
    }
    </script>
    """
    
    return html