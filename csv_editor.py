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
        
        # 데이터프레임 기본 정보
        row_count = len(df)
        col_count = len(df.columns)
        
        # 컬럼 정보 처리
        columns_info = []
        for col_name in df.columns:
            col_type = detect_column_type(col_name)
            sample_values = df[col_name].dropna().head(3).tolist()
            # 정수형 등 int64 타입 데이터 JSON 직렬화를 위한 변환
            sample_values = [str(val) if not isinstance(val, str) else val for val in sample_values]
            
            columns_info.append({
                'name': col_name,
                'type': col_type,
                'sample_values': sample_values
            })
        
        # 공통 패턴 분석 (예: 컬럼명에 공통 접두어가 있는지)
        common_prefix = os.path.commonprefix([col.lower() for col in df.columns])
        if len(common_prefix) < 3:  # 너무 짧은 공통 접두어는 무시
            common_prefix = ''
        
        # 메타데이터 종합
        metadata = {
            'file_name': file_name,
            'file_path': str(file_path),
            'encoding': encoding,
            'row_count': row_count,
            'column_count': col_count,
            'columns': columns_info,
            'common_prefix': common_prefix,
            'generated_at': pd.Timestamp.now().isoformat(),
            'suggestions': generate_suggestions(df, columns_info)
        }
        
        return metadata
        
    except Exception as e:
        print(f"메타데이터 생성 중 오류: {str(e)}")
        return {
            'file_name': file_name,
            'file_path': str(file_path),
            'error': str(e)
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

def generate_suggestions(df: pd.DataFrame, columns_info: List[Dict[str, Any]]) -> List[str]:
    """
    데이터프레임 분석 결과에 기반한 제안사항을 생성합니다.
    
    Args:
        df: 데이터프레임
        columns_info: 컬럼 정보 목록
        
    Returns:
        제안사항 목록
    """
    suggestions = []
    
    # 행 수가 많은 경우 제안
    if len(df) > 1000:
        suggestions.append(f"이 CSV 파일은 {len(df)}개의 행이 있어 큰 파일입니다. 데이터 분석 시 샘플링을 고려하세요.")
    
    # 빈 값이 많은 컬럼 확인
    for col in df.columns:
        null_percent = df[col].isna().mean() * 100
        if null_percent > 50:
            suggestions.append(f"'{col}' 컬럼은 {null_percent:.1f}%가 빈 값입니다. 이 컬럼 사용 시 주의하세요.")
    
    # 키워드 컬럼과 설명 컬럼 식별 제안
    keyword_cols = [info['name'] for info in columns_info if info['type'] in ['KEYWORD', 'CATEGORY']]
    desc_cols = [info['name'] for info in columns_info if info['type'] == 'DESCRIPTION']
    
    if keyword_cols and desc_cols:
        suggestions.append(f"키워드 검색에는 {', '.join(keyword_cols)} 컬럼을, 설명 검색에는 {', '.join(desc_cols)} 컬럼을 활용하세요.")
    
    return suggestions

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
    # 메타데이터 버튼 HTML 생성 (조건부)
    metadata_button = ''
    if metadata_exists:
        metadata_button = f'<button class="btn btn-info" style="padding: 8px 16px; border-radius: 4px; font-weight: 500;" onclick="viewMetadata(\'{metadata_filename}\')">메타데이터 보기</button>'
    
    # 테이블 HTML 생성 (특수 스타일 적용)
    # 테이블 스크롤을 고려하여 고정 너비를 제거함
    table_html = df.to_html(classes='editable-csv-table', index=False, na_rep='', 
                           border=1, justify='left', 
                           col_space=120)  # 컬럼 최소 너비 설정
    
    # 모든 컬럼이 제대로 표시되는지 확인
    print(f"CSV 열 목록: {df.columns.tolist()}")
    print(f"생성된 테이블 HTML 크기: {len(table_html)}")
    
    # 모든 열이 표시되도록 스타일 추가
    table_html = table_html.replace('<table', '<table style="width: 100%; min-width: 1000px;"')
    
    html = """
    <div style="padding: 20px; max-width: 100%; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="color: #333; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #0064E1; padding-bottom: 10px;">CSV 파일: """ + filename + """</h3>
        
        <div class="csv-controls" style="margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button id="csv-edit-btn" class="btn btn-primary" style="padding: 8px 16px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                </svg>
                편집 모드
            </button>
            <button id="csv-save-btn" class="btn btn-success" style="display:none; padding: 8px 16px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
                변경사항 저장
            </button>
            <button id="csv-cancel-btn" class="btn btn-secondary" style="display:none; padding: 8px 16px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                </svg>
                취소
            </button>
            <button id="csv-add-row-btn" class="btn btn-light" style="display:none; padding: 8px 16px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0a.5.5 0 0 1 .5.5v7.5H16a.5.5 0 0 1 0 1H8.5V16a.5.5 0 0 1-1 0V9H0a.5.5 0 0 1 0-1h7.5V.5A.5.5 0 0 1 8 0z"/>
                </svg>
                행 추가
            </button>
            <button id="csv-add-col-btn" class="btn btn-light" style="display:none; padding: 8px 16px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 0a.5.5 0 0 1 .5.5v7.5H16a.5.5 0 0 1 0 1H8.5V16a.5.5 0 0 1-1 0V9H0a.5.5 0 0 1 0-1h7.5V.5A.5.5 0 0 1 8 0z"/>
                </svg>
                열 추가
            </button>
            <a href="/api/documents/download/""" + system_filename + """" class="btn btn-info" style="padding: 8px 16px; border-radius: 4px; font-weight: 500; text-decoration: none; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                다운로드
            </a>
            """ + metadata_button + """
        </div>
        
        <div id="csv-table-container" style="max-height: 600px; overflow: auto; background-color: white; border-radius: 4px; border: 1px solid #e0e0e0; overflow-x: auto; width: 100%;">
            <style>
                .editable-csv-table {
                    border-collapse: collapse;
                    font-size: 14px;
                    table-layout: auto;
                    width: 100%;
                    min-width: 800px;
                }
                .editable-csv-table th {
                    background-color: #f2f2f2;
                    color: #333;
                    font-weight: 600;
                    text-align: left;
                    padding: 12px 15px;
                    border: 1px solid #ddd;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    box-shadow: 0 1px 1px rgba(0,0,0,0.1);
                    min-width: 120px;
                    max-width: 300px;
                    white-space: normal;
                    word-break: break-word;
                }
                .editable-csv-table td {
                    padding: 10px 15px;
                    border: 1px solid #ddd;
                    min-width: 120px;
                    max-width: 300px;
                    white-space: normal;
                    word-break: break-word;
                }
                .editable-csv-table tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .editable-csv-table tr:hover {
                    background-color: #f1f8ff;
                }
            </style>
            """ + table_html + """
        </div>
    </div>

    <script>
    // 전역 변수
    const csvFilename = '""" + system_filename + """';
    let originalCsvData = null;
    
    // 문서 로드 완료 후 이벤트 리스너 등록
    document.addEventListener('DOMContentLoaded', function() {
        // 버튼 요소 가져오기
        const editBtn = document.getElementById('csv-edit-btn');
        const saveBtn = document.getElementById('csv-save-btn');
        const cancelBtn = document.getElementById('csv-cancel-btn');
        
        // 편집 버튼 이벤트 리스너
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                // 현재 테이블 상태 저장
                originalCsvData = document.getElementById('csv-table-container').innerHTML;
                
                // 테이블 셀 편집 가능하게 변경
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
                editBtn.style.display = 'none';
                saveBtn.style.display = 'inline-block';
                cancelBtn.style.display = 'inline-block';
                document.getElementById('csv-add-row-btn').style.display = 'inline-flex';
                document.getElementById('csv-add-col-btn').style.display = 'inline-flex';
            });
        }
        
        // 취소 버튼 이벤트 리스너
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                // 원래 테이블로 복원
                document.getElementById('csv-table-container').innerHTML = originalCsvData;
                
                // 버튼 상태 변경
                editBtn.style.display = 'inline-block';
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                document.getElementById('csv-add-row-btn').style.display = 'none';
                document.getElementById('csv-add-col-btn').style.display = 'none';
            });
        }
        
        // 행 추가 버튼 이벤트 리스너
        const addRowBtn = document.getElementById('csv-add-row-btn');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', function() {
                const table = document.querySelector('.editable-csv-table');
                if (!table) return;
                
                // 컬럼 수 계산
                const headerCells = table.querySelectorAll('thead th');
                const columnCount = headerCells.length;
                
                // 새 행 생성
                const tbody = table.querySelector('tbody');
                const newRow = document.createElement('tr');
                
                // 빈 셀 추가
                for (let i = 0; i < columnCount; i++) {
                    const cell = document.createElement('td');
                    cell.contentEditable = true;
                    cell.style.backgroundColor = '#fffde7';
                    cell.addEventListener('focus', function() {
                        this.style.backgroundColor = '#fff9c4';
                    });
                    cell.addEventListener('blur', function() {
                        this.style.backgroundColor = '#fffde7';
                    });
                    newRow.appendChild(cell);
                }
                
                // 새 행을 테이블에 추가
                tbody.appendChild(newRow);
                
                // 추가 효과 (깜빡임)
                newRow.style.transition = 'background-color 0.5s';
                newRow.style.backgroundColor = '#e3f2fd';
                setTimeout(() => {
                    newRow.style.backgroundColor = '';
                }, 1000);
            });
        }
        
        // 열 추가 버튼 이벤트 리스너
        const addColBtn = document.getElementById('csv-add-col-btn');
        if (addColBtn) {
            addColBtn.addEventListener('click', function() {
                // 컬럼 이름 입력 받기
                const columnName = prompt('새 열의 이름을 입력하세요:', '');
                if (columnName === null) return; // 취소한 경우
                
                const table = document.querySelector('.editable-csv-table');
                if (!table) return;
                
                // 헤더에 새 열 추가
                const headerRow = table.querySelector('thead tr');
                const newHeaderCell = document.createElement('th');
                newHeaderCell.textContent = columnName;
                headerRow.appendChild(newHeaderCell);
                
                // 데이터 행에 새 열 추가
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cell = document.createElement('td');
                    cell.contentEditable = true;
                    cell.style.backgroundColor = '#fffde7';
                    cell.addEventListener('focus', function() {
                        this.style.backgroundColor = '#fff9c4';
                    });
                    cell.addEventListener('blur', function() {
                        this.style.backgroundColor = '#fffde7';
                    });
                    row.appendChild(cell);
                });
                
                // 추가 효과 (깜빡임)
                const newCells = table.querySelectorAll('td:last-child, th:last-child');
                newCells.forEach(cell => {
                    cell.style.transition = 'background-color 0.5s';
                    cell.style.backgroundColor = '#e3f2fd';
                    setTimeout(() => {
                        if (cell.tagName === 'TH') {
                            cell.style.backgroundColor = '#f2f2f2';
                        } else {
                            cell.style.backgroundColor = '';
                        }
                    }, 1000);
                });
            });
        }
        
        // 저장 버튼 이벤트 리스너
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                // 테이블에서 데이터 추출
                const table = document.querySelector('.editable-csv-table');
                if (!table) {
                    alert('편집할 테이블을 찾을 수 없습니다.');
                    return;
                }
                
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
                const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
                    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
                );
                
                // 저장 알림 표시
                const savingNotice = document.createElement('div');
                savingNotice.innerHTML = `
                    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                background-color: rgba(0,0,0,0.8); color: white; padding: 20px; 
                                border-radius: 8px; z-index: 9999; display: flex; align-items: center; gap: 10px;">
                        <div class="spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; 
                                          border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
                        <span>변경사항 저장 중...</span>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
                document.body.appendChild(savingNotice);
                
                // 데이터 전송
                fetch('/api/documents/edit/' + csvFilename, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        headers: headers,
                        data: rows,
                        encoding: 'cp949'  // 한글 파일 지원을 위해 cp949 사용
                    })
                })
                .then(response => response.json())
                .then(data => {
                    // 저장 알림 제거
                    document.body.removeChild(savingNotice);
                    
                    if (data.status === 'success') {
                        // 성공 메시지 표시
                        const successNotice = document.createElement('div');
                        successNotice.innerHTML = `
                            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                        background-color: rgba(25,135,84,0.9); color: white; padding: 20px; 
                                        border-radius: 8px; z-index: 9999; display: flex; align-items: center; gap: 10px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                </svg>
                                <span>CSV 파일이 성공적으로 저장되었습니다</span>
                            </div>
                        `;
                        document.body.appendChild(successNotice);
                        
                        // 3초 후에 성공 메시지 제거
                        setTimeout(() => {
                            document.body.removeChild(successNotice);
                        }, 3000);
                        
                        // 변경된 내용으로 테이블 업데이트
                        document.getElementById('csv-table-container').innerHTML = data.content;
                        // 버튼 상태 변경
                        editBtn.style.display = 'inline-block';
                        saveBtn.style.display = 'none';
                        cancelBtn.style.display = 'none';
                        document.getElementById('csv-add-row-btn').style.display = 'none';
                        document.getElementById('csv-add-col-btn').style.display = 'none';
                    } else {
                        // 오류 메시지 표시
                        const errorNotice = document.createElement('div');
                        errorNotice.innerHTML = `
                            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                        background-color: rgba(220,53,69,0.9); color: white; padding: 20px; 
                                        border-radius: 8px; z-index: 9999; display: flex; align-items: center; gap: 10px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
                                </svg>
                                <span>저장 중 오류가 발생했습니다: ${data.message}</span>
                            </div>
                        `;
                        document.body.appendChild(errorNotice);
                        
                        // 5초 후에 오류 메시지 제거
                        setTimeout(() => {
                            document.body.removeChild(errorNotice);
                        }, 5000);
                    }
                })
                .catch(error => {
                    // 저장 알림 제거
                    document.body.removeChild(savingNotice);
                    
                    // 오류 메시지 표시
                    const errorNotice = document.createElement('div');
                    errorNotice.innerHTML = `
                        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                    background-color: rgba(220,53,69,0.9); color: white; padding: 20px; 
                                    border-radius: 8px; z-index: 9999; display: flex; align-items: center; gap: 10px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
                            </svg>
                            <span>저장 중 오류가 발생했습니다: ${error}</span>
                        </div>
                    `;
                    document.body.appendChild(errorNotice);
                    
                    // 5초 후에 오류 메시지 제거
                    setTimeout(() => {
                        document.body.removeChild(errorNotice);
                    }, 5000);
                });
            });
        }
    });
    
    // 메타데이터 보기 함수
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
                    '<pre>' + data.content + '</pre>' + 
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
    </script>"""
    
    return html