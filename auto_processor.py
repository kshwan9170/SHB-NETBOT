"""
자동 전처리 모듈 - CSV 및 Excel 파일을 자동으로 전처리하는 기능 제공
"""

import os
import re
import json
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple, Set
from document_processor import chunk_text, process_text

# 컬럼 유형 인식 상수 정의
COLUMN_TYPES = {
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

def detect_column_type(column_name: str) -> str:
    """
    컬럼 이름을 분석하여 컬럼 유형 추측
    
    Args:
        column_name: 컬럼 이름
        
    Returns:
        컬럼 유형 문자열
    """
    column_name = column_name.lower()
    
    for column_type, keywords in COLUMN_TYPES.items():
        for keyword in keywords:
            if keyword.lower() in column_name:
                return column_type
    
    return 'UNKNOWN'

def clean_column_name(column_name: str) -> str:
    """
    컬럼 이름에서 특수문자와 공백 정리
    
    Args:
        column_name: 원본 컬럼 이름
        
    Returns:
        정리된 컬럼 이름
    """
    # 한글/영문/숫자/공백만 남기고 제거
    cleaned = re.sub(r'[^\w\s가-힣]', '', column_name)
    # 여러 공백을 하나로 변경
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def preprocess_csv(file_path: str) -> bool:
    """
    CSV 파일 자동 전처리
    
    Args:
        file_path: CSV 파일 경로
        
    Returns:
        전처리 성공 여부 (True/False)
    """
    try:
        # CSV 파일 읽기
        df = pd.read_csv(file_path)
        
        # 빈 행 제거
        df.dropna(how='all', inplace=True)
        
        # 빈 열 제거
        df.dropna(axis=1, how='all', inplace=True)
        
        # 컬럼명 정리
        df.columns = [clean_column_name(col) for col in df.columns]
        
        # 전처리된 파일을 저장할 경로 생성
        filename = os.path.basename(file_path)
        directory = os.path.dirname(file_path)
        processed_filename = f"processed_{filename}"
        processed_path = os.path.join(directory, processed_filename)
        
        # 처리된 데이터 저장
        df.to_csv(processed_path, index=False)
        
        # 컬럼 정보 추출
        column_info = {}
        for column in df.columns:
            column_info[column] = detect_column_type(column)
        
        # 메타데이터 파일 생성 (컬럼 정보, 관계 등)
        metadata = {
            "original_file": filename,
            "processed_file": processed_filename,
            "column_count": len(df.columns),
            "row_count": len(df),
            "columns": column_info,
            "processing_date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        metadata_path = os.path.join(directory, f"{os.path.splitext(filename)[0]}_metadata.json")
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        print(f"전처리 완료: {filename} -> {processed_filename}")
        return True
    
    except Exception as e:
        print(f"CSV 파일 전처리 중 오류 발생: {str(e)}")
        return False

def preprocess_excel(file_path: str) -> bool:
    """
    Excel 파일 자동 전처리
    
    Args:
        file_path: Excel 파일 경로
        
    Returns:
        전처리 성공 여부 (True/False)
    """
    try:
        # Excel 파일 읽기
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names
        
        # 메타데이터 준비
        filename = os.path.basename(file_path)
        directory = os.path.dirname(file_path)
        processed_filename = f"processed_{filename}"
        processed_path = os.path.join(directory, processed_filename)
        
        # 각 시트 정보를 저장할 딕셔너리
        sheets_info = {}
        
        # 새 엑셀 파일 생성을 위한 writer
        with pd.ExcelWriter(processed_path) as writer:
            # 각 시트 처리
            for sheet_name in sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # 빈 행 제거
                df.dropna(how='all', inplace=True)
                
                # 빈 열 제거
                df.dropna(axis=1, how='all', inplace=True)
                
                # 컬럼명 정리
                if not df.empty and all(isinstance(col, str) for col in df.columns):
                    df.columns = [clean_column_name(col) for col in df.columns]
                
                # 현재 시트의 컬럼 정보 추출
                column_info = {}
                if not df.empty:
                    for column in df.columns:
                        column_info[str(column)] = detect_column_type(str(column))
                
                # 전처리된 시트 저장
                df.to_excel(writer, sheet_name=sheet_name, index=False)
                
                # 시트 정보 저장
                sheets_info[sheet_name] = {
                    "column_count": len(df.columns),
                    "row_count": len(df),
                    "columns": column_info
                }
        
        # 메타데이터 생성
        metadata = {
            "original_file": filename,
            "processed_file": processed_filename,
            "sheet_count": len(sheet_names),
            "sheets": sheets_info,
            "processing_date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        metadata_path = os.path.join(directory, f"{os.path.splitext(filename)[0]}_metadata.json")
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        print(f"전처리 완료: {filename} -> {processed_filename}")
        return True
    
    except Exception as e:
        print(f"Excel 파일 전처리 중 오류 발생: {str(e)}")
        return False

def auto_process_file(file_path: str) -> Tuple[bool, Optional[str]]:
    """
    파일 확장자에 따라 적절한 전처리 함수 호출
    
    Args:
        file_path: 파일 경로
        
    Returns:
        (성공 여부, 처리된 파일 경로) 튜플
    """
    file_extension = os.path.splitext(file_path)[1].lower()
    
    # 처리된 파일 경로 계산
    directory = os.path.dirname(file_path)
    filename = os.path.basename(file_path)
    processed_filename = f"processed_{filename}"
    processed_path = os.path.join(directory, processed_filename)
    
    if file_extension == '.csv':
        success = preprocess_csv(file_path)
        return (success, processed_path if success else None)
    
    elif file_extension in ['.xlsx', '.xls']:
        success = preprocess_excel(file_path)
        return (success, processed_path if success else None)
    
    else:
        # 지원하지 않는 파일 형식
        print(f"지원하지 않는 파일 형식: {file_extension}")
        return (False, None)

def auto_process_directory(directory_path: str) -> Dict[str, List[str]]:
    """
    디렉토리 내 모든 CSV/Excel 파일 전처리
    
    Args:
        directory_path: 디렉토리 경로
        
    Returns:
        처리 결과 요약 (성공/실패 파일 목록)
    """
    results = {
        "success": [],
        "failed": []
    }
    
    for filename in os.listdir(directory_path):
        file_path = os.path.join(directory_path, filename)
        
        # 파일이 아니면 건너뜀
        if not os.path.isfile(file_path):
            continue
            
        # 확장자 확인
        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.csv', '.xlsx', '.xls']:
            success, _ = auto_process_file(file_path)
            if success:
                results["success"].append(filename)
            else:
                results["failed"].append(filename)
    
    # 처리 결과 출력
    if results["success"]:
        print(f"성공적으로 처리된 파일 ({len(results['success'])}개): {', '.join(results['success'])}")
    if results["failed"]:
        print(f"처리 실패한 파일 ({len(results['failed'])}개): {', '.join(results['failed'])}")
    
    return results