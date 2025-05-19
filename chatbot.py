import os
from typing import List, Dict, Any, Optional, Tuple
import json
import openai
import re
import pandas as pd
from pathlib import Path
from openai import OpenAI
from database import search_similar_docs

# Import configuration
from config import FAQ_KEYWORDS, FINE_TUNED_MODEL, RAG_SYSTEM

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# 업로드된 파일 디렉토리 경로
UPLOAD_FOLDER = 'uploaded_files'

def detect_language(text: str) -> str:
    """
    텍스트의 언어를 감지합니다.
    
    Args:
        text: 감지할 텍스트
    
    Returns:
        언어 코드 ('ko' 또는 'en')
    """
    # 한글 문자가 포함되어 있는지 확인
    if re.search(r'[가-힣]', text):
        return 'ko'
    else:
        return 'en'

def retrieve_relevant_documents(query: str, top_k: int = 5) -> Tuple[List[Any], str]:
    """
    질문과 관련된 문서를 검색하고 컨텍스트 문자열로 포맷팅합니다.
    
    Args:
        query: 사용자 질문
        top_k: 검색할 상위 문서 수
        
    Returns:
        (문서 리스트, 컨텍스트 문자열) 튜플
    """
    try:
        # 키워드 추출 (간단한 방식으로 구현)
        keywords = extract_keywords_from_query(query)
        print(f"추출된 키워드: {keywords}")
        
        # 절차 가이드 전용 검색을 위한 필터링
        procedure_guide_filter = None
        
        # 특정 버전의 가이드를 요청하는지 확인 (예: "2025년 5월 19일 업무 가이드에서...")
        version_pattern = re.search(r'(\d{4}[.년\-_]\s?\d{1,2}[.월\-_]\s?\d{1,2})', query)
        guide_version = None
        
        if version_pattern:
            # 버전 정보 추출 및 정규화
            raw_version = version_pattern.group(1)
            
            # 공백 제거
            normalized_version = raw_version.replace(' ', '')
            
            # yyyy년mm월dd일 형식 -> yyyy.mm.dd 형식으로 변환 
            normalized_version = re.sub(r'(\d{4})년(\d{1,2})월(\d{1,2})일', r'\1.\2.\3', normalized_version)
            
            # yyyy-mm-dd 형식도 유지 (ChromaDB 검색에서는 원본 형식 그대로 사용)
            guide_version = normalized_version
            
            print(f"특정 버전 가이드 요청 감지: {raw_version} -> {guide_version}")
        
        # 절차 가이드 필터링 적용
        if any(keyword in query for keyword in ['어떻게', '방법', '절차', '신청', '신규', '변경']):
            procedure_guide_filter = {"content_type": "procedure_guide"}
            
            # 특정 버전이 요청된 경우 해당 버전으로 필터링 추가
            if guide_version:
                procedure_guide_filter["guide_version"] = guide_version
            
            print(f"절차 가이드 우선 검색 활성화됨 - 필터: {procedure_guide_filter}")
        
        # 관련 문서 검색
        docs = search_similar_docs(query, top_k=top_k, filter=procedure_guide_filter)
        
        # 가이드 문서가 없고 필터가 적용된 경우 다시 필터 없이 검색
        if (not docs or len(docs) == 0) and procedure_guide_filter:
            print("절차 가이드에서 결과를 찾지 못해 전체 문서에서 검색합니다")
            docs = search_similar_docs(query, top_k=top_k)
        
        # 문서가 없으면 빈 컨텍스트 반환
        if not docs or len(docs) == 0:
            return [], ""
        
        # 검색된 문서를 컨텍스트 문자열로 포맷팅
        context_str = "Context:\n"
        
        # 업무 안내 가이드 문서는 특별한 포맷으로 표시
        for i, doc in enumerate(docs):
            # 메타데이터에서 업무 가이드 정보 확인
            metadata = getattr(doc, 'metadata', {})
            content_type = metadata.get('content_type', '')
            
            if content_type == 'procedure_guide':
                # 업무 가이드 형식으로 포맷 (버전 정보 포함)
                guide_version = metadata.get('guide_version', 'latest')
                version_text = f" (버전: {guide_version})" if guide_version != 'latest' else ""
                context_str += f"- ({i+1}) 업무 안내{version_text}: "
                
                # 질문 예시와 상세 안내 부분 강조
                if '질문 예시' in metadata:
                    context_str += f"[질문: {metadata['질문 예시']}] "
                
                if '요약 응답' in metadata:
                    context_str += f"[요약: {metadata['요약 응답']}] "
                    
                if '상세 안내' in metadata:
                    context_str += f"[안내: {metadata['상세 안내']}] "
                
                # 일반 내용도 포함
                context_str += f"\n  원본내용: \"{doc.page_content}\"\n\n"
            else:
                # 일반 문서 형식으로 포맷
                context_str += f"- ({i+1}) \"{doc.page_content}\"\n\n"
        
        return docs, context_str
    except Exception as e:
        print(f"ERROR: RAG pipeline failed during document retrieval: {str(e)}")
        return [], ""

# 엑셀 처리 관련 함수들
def find_excel_files(search_keyword="업무 절차 안내 가이드"):
    """
    업로드된 파일 중 엑셀 파일을 검색합니다.
    
    Args:
        search_keyword: 검색할 키워드
        
    Returns:
        찾은 엑셀 파일의 경로 목록
    """
    excel_files = []
    
    # 업로드 폴더가 존재하는지 확인
    if not os.path.exists(UPLOAD_FOLDER):
        print(f"업로드 폴더가 존재하지 않습니다: {UPLOAD_FOLDER}")
        return excel_files
    
    # 업로드 폴더 내 파일 검색
    for filename in os.listdir(UPLOAD_FOLDER):
        if filename.endswith(('.xlsx', '.xls')):
            # 키워드가 포함된 파일인지 확인
            if search_keyword.lower() in filename.lower():
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                excel_files.append(file_path)
    
    # 키워드가 없으면 모든 엑셀 파일 검색
    if not excel_files:
        for filename in os.listdir(UPLOAD_FOLDER):
            if filename.endswith(('.xlsx', '.xls')):
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                excel_files.append(file_path)
    
    return excel_files

def get_sheet_names(excel_file):
    """
    엑셀 파일의 시트 이름 목록을 반환합니다.
    
    Args:
        excel_file: 엑셀 파일 경로
        
    Returns:
        시트 이름 목록
    """
    try:
        xls = pd.ExcelFile(excel_file)
        return xls.sheet_names
    except Exception as e:
        print(f"시트 이름을 가져오는 중 오류 발생: {str(e)}")
        return []

def read_excel_sheet(excel_file, sheet_name):
    """
    엑셀 파일의 특정 시트를 DataFrame으로 읽어옵니다.
    
    Args:
        excel_file: 엑셀 파일 경로
        sheet_name: 시트 이름
        
    Returns:
        pandas DataFrame
    """
    try:
        # 모든 열을 문자열로 처리하여 데이터 유실 방지
        df = pd.read_excel(excel_file, sheet_name=sheet_name, dtype=str, na_filter=False)
        
        # NaN 값을 빈 문자열로 대체
        df = df.fillna('')
        
        return df
    except Exception as e:
        print(f"엑셀 시트 '{sheet_name}'를 읽는 중 오류 발생: {str(e)}")
        return pd.DataFrame()

def extract_keywords_from_query(query):
    """
    사용자 질문에서 키워드를 추출합니다.
    
    Args:
        query: 사용자 질문
        
    Returns:
        추출된 키워드 리스트
    """
    # 기본 키워드 추출 (공백 기준)
    basic_keywords = query.split()
    
    # OpenAI를 사용한 키워드 추출 (API 키가 있는 경우)
    try:
        if OPENAI_API_KEY:
            messages = [
                {"role": "system", "content": "사용자의 질문에서 중요한 키워드를 추출해주세요. JSON 형식의 배열로 반환해야 합니다."},
                {"role": "user", "content": f"다음 질문에서 네트워크 관련 중요 키워드를 추출해주세요: {query}"}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                temperature=0.3,
                max_tokens=150
            )
            
            content = response.choices[0].message.content
            
            # JSON 부분 추출 시도
            try:
                # JSON 배열이 직접 반환된 경우
                keywords = json.loads(content)
                if isinstance(keywords, list):
                    return keywords
            except:
                # 텍스트에서 JSON 배열 찾기 시도
                match = re.search(r'\[(.*?)\]', content)
                if match:
                    try:
                        keywords = json.loads('[' + match.group(1) + ']')
                        if isinstance(keywords, list):
                            return keywords
                    except:
                        pass
                
                # 줄바꿈을 기준으로 키워드 추출 시도
                if '\n' in content:
                    lines = content.split('\n')
                    keywords = []
                    for line in lines:
                        line = line.strip()
                        if line and not line.startswith(('•', '-', '*', '1.', '2.')):
                            keywords.append(line)
                        elif line.startswith(('•', '-', '*')):
                            keyword = line[1:].strip()
                            keywords.append(keyword)
                        elif re.match(r'^\d+\.', line):
                            keyword = re.sub(r'^\d+\.', '', line).strip()
                            keywords.append(keyword)
                    
                    if keywords:
                        return keywords
    except Exception as e:
        print(f"OpenAI를 사용한 키워드 추출 중 오류 발생: {str(e)}")
    
    # 기본 키워드 반환
    return basic_keywords

def find_relevant_rows(df, keywords):
    """
    키워드와 관련된 행을 찾습니다.
    
    Args:
        df: 데이터프레임
        keywords: 키워드 리스트
        
    Returns:
        관련 행의 인덱스 리스트
    """
    relevant_indices = []
    
    # 각 행에 대해 키워드 매칭 확인
    for idx, row in df.iterrows():
        row_text = ' '.join(str(val).lower() for val in row.values)
        
        # 키워드 일치 확인
        match_score = 0
        for keyword in keywords:
            if keyword.lower() in row_text:
                match_score += 1
        
        if match_score > 0:
            # (인덱스, 매칭 점수) 형태로 저장
            relevant_indices.append((idx, match_score))
    
    # 매칭 점수 기준으로 정렬하고 인덱스만 추출
    if relevant_indices:
        relevant_indices.sort(key=lambda x: x[1], reverse=True)
        return [idx for idx, _ in relevant_indices]
    
    # 매칭되는 내용이 없으면 처음 몇 개 행만 반환
    return list(range(min(5, len(df))))

def dataframe_to_text(df):
    """
    데이터프레임을 문자열로 변환합니다.
    
    Args:
        df: 데이터프레임
        
    Returns:
        데이터프레임 내용을 표현한 문자열
    """
    # 빈 데이터프레임 처리
    if df.empty:
        return "데이터가 없습니다."
    
    # 데이터프레임의 열 이름과 값을 텍스트로 변환
    text_parts = []
    
    # 테이블 헤더 추가
    columns = ' | '.join(df.columns)
    text_parts.append(columns)
    text_parts.append('-' * len(columns))
    
    # 각 행 데이터 추가
    for _, row in df.iterrows():
        row_text = ' | '.join(str(val) for val in row.values)
        text_parts.append(row_text)
    
    return '\n'.join(text_parts)

def format_reference_result(df, search_term):
    """
    조회 결과를 포맷팅합니다.
    
    Args:
        df: 결과 데이터프레임
        search_term: 검색어
        
    Returns:
        포맷팅된 결과 문자열
    """
    if df.empty:
        return f"'{search_term}'에 대한 정보를 찾을 수 없습니다."
    
    # 마크다운 테이블 형식으로 변환
    md_table = []
    
    # 헤더 추가
    headers = '| ' + ' | '.join(df.columns) + ' |'
    md_table.append(headers)
    
    # 구분선 추가
    separator = '| ' + ' | '.join(['---'] * len(df.columns)) + ' |'
    md_table.append(separator)
    
    # 데이터 행 추가
    for _, row in df.iterrows():
        row_values = '| ' + ' | '.join(str(val) for val in row.values) + ' |'
        md_table.append(row_values)
    
    result = '\n'.join(md_table)
    result = f"'{search_term}'에 대한 조회 결과:\n\n{result}"
    
    return result

def summarize_dataframe(df):
    """
    데이터프레임 내용을 요약합니다.
    
    Args:
        df: 데이터프레임
        
    Returns:
        요약 문자열
    """
    if df.empty:
        return "데이터가 없습니다."
    
    # 마크다운 테이블 형식으로 변환
    md_table = []
    
    # 헤더 추가
    headers = '| ' + ' | '.join(df.columns) + ' |'
    md_table.append(headers)
    
    # 구분선 추가
    separator = '| ' + ' | '.join(['---'] * len(df.columns)) + ' |'
    md_table.append(separator)
    
    # 데이터 행 추가 (최대 5개 행만)
    for _, row in df.head(5).iterrows():
        row_values = '| ' + ' | '.join(str(val) for val in row.values) + ' |'
        md_table.append(row_values)
    
    result = '\n'.join(md_table)
    
    # 행이 더 있으면 메시지 추가
    if len(df) > 5:
        result += f"\n\n(총 {len(df)}개 중 5개 결과만 표시합니다.)"
    
    return result

def process_excel_query(query):
    """
    엑셀 기반 처리 흐름에 따라 사용자 질문을 처리합니다.
    
    1. 전체_관리_시트를 검색하여 업무 유형/키워드 파악
    2. 연결 시트로 이동하여 필요 데이터 찾기
    3. 처리 방식에 맞게 응답 생성
    
    Args:
        query: 사용자 질문
        
    Returns:
        처리 결과와 응답 내용을 담은 딕셔너리
    """
    # 결과 저장용 딕셔너리
    result = {
        "found": False,
        "response": "",
        "from_excel": True,
        "category": "",
        "sheet_used": "",
        "response_type": ""
    }
    
    # 엑셀 파일 검색
    excel_files = find_excel_files()
    if not excel_files:
        result["response"] = "참조할 엑셀 데이터를 찾을 수 없습니다."
        result["from_excel"] = False
        return result
    
    # 첫 번째 엑셀 파일 사용
    excel_file = excel_files[0]
    print(f"엑셀 파일 사용: {excel_file}")
    
    # 시트 목록 가져오기
    sheet_names = get_sheet_names(excel_file)
    if not sheet_names:
        result["response"] = "엑셀 파일에서 시트를 찾을 수 없습니다."
        result["from_excel"] = False
        return result
    
    print(f"시트 목록: {sheet_names}")
    
    # 1. 전체_관리_시트 검색
    main_sheet = None
    for sheet in sheet_names:
        if "전체" in sheet and "관리" in sheet:
            main_sheet = sheet
            break
    
    # 전체 관리 시트가 없으면 첫 번째 시트 사용
    if not main_sheet:
        main_sheet = sheet_names[0]
    
    print(f"메인 시트 사용: {main_sheet}")
    
    # 전체 관리 시트 데이터 읽기
    main_df = read_excel_sheet(excel_file, main_sheet)
    if main_df.empty:
        result["response"] = f"'{main_sheet}' 시트에서 데이터를 읽을 수 없습니다."
        result["from_excel"] = False
        return result
    
    # 전체 관리 시트의 데이터를 기반으로 사용자 질문과 관련된 내용 찾기
    matched_row = None
    target_sheet = None
    category = None
    response_type = "DB 응답 (자연어)"  # 기본 응답 유형
    
    # 질문에서 키워드 추출 (OpenAI 사용)
    query_keywords = extract_keywords_from_query(query)
    print(f"추출된 키워드: {query_keywords}")
    
    # 각 행을 확인하며 매칭되는 내용 찾기
    for idx, row in main_df.iterrows():
        # 필요한 열이 존재하는지 확인
        if '구분' in main_df.columns and '카테고리' in main_df.columns:
            row_category = str(row.get('구분', '')) + " " + str(row.get('카테고리', ''))
            keywords = []
            
            # 키워드 열 확인
            for col in main_df.columns:
                if '키워드' in col or '검색어' in col:
                    if row[col]:
                        keywords.extend(str(row[col]).split(','))
            
            # 시트 정보 열 확인
            sheet_col = None
            for col in main_df.columns:
                if '시트' in col or '링크' in col:
                    sheet_col = col
                    break
            
            # 요약 내용 열 확인
            summary_col = None
            for col in main_df.columns:
                if '요약' in col or '설명' in col:
                    summary_col = col
                    break
            
            # 처리 방식 열 확인
            response_type_col = None
            for col in main_df.columns:
                if '처리' in col or '방식' in col:
                    response_type_col = col
                    break
            
            # 키워드 매칭 확인
            match_found = False
            for kw in query_keywords:
                if any(kw.lower() in keyword.lower() for keyword in keywords):
                    match_found = True
                    break
            
            if match_found:
                matched_row = row
                category = row_category
                
                # 연결 시트 정보 추출
                if sheet_col and row[sheet_col]:
                    target_sheet_info = str(row[sheet_col])
                    # "XX 시트 참조" 형식에서 시트 이름 추출
                    sheet_match = re.search(r'([가-힣A-Za-z0-9_]+)[\s_]시트', target_sheet_info)
                    if sheet_match:
                        target_sheet = sheet_match.group(1)
                
                # 처리 방식 정보 추출
                if response_type_col and row[response_type_col]:
                    response_type = str(row[response_type_col])
                
                break
    
    # 매칭되는 내용을 찾지 못한 경우
    if not matched_row or not target_sheet:
        # 일단 기본 처리로 전환하고 첫 번째 내용 시트 사용
        alternative_sheet = None
        for sheet in sheet_names:
            if "전체" not in sheet and "관리" not in sheet and sheet != main_sheet:
                alternative_sheet = sheet
                break
        
        if alternative_sheet:
            target_sheet = alternative_sheet
            result["sheet_used"] = "대체 시트 사용: " + target_sheet
        else:
            result["response"] = "질문과 관련된 정보를 찾을 수 없습니다."
            result["from_excel"] = False
            return result
    
    # 2. 연결 시트로 이동하여 필요 데이터 찾기
    # 실제 시트 이름 찾기 (부분 매칭)
    actual_sheet = None
    for sheet in sheet_names:
        if target_sheet in sheet:
            actual_sheet = sheet
            break
    
    if not actual_sheet:
        actual_sheet = target_sheet  # 직접 매칭 시도
    
    print(f"연결 시트 사용: {actual_sheet}")
    
    # 연결 시트 데이터 읽기
    sheet_df = read_excel_sheet(excel_file, actual_sheet)
    if sheet_df.empty:
        result["response"] = f"'{actual_sheet}' 시트에서 데이터를 읽을 수 없습니다."
        result["from_excel"] = False
        return result
    
    # 3. 처리 방식에 맞게 응답 생성
    result["found"] = True
    result["category"] = category
    result["sheet_used"] = actual_sheet
    result["response_type"] = response_type
    
    # 처리 방식에 따른 분기 처리
    if "자연어" in response_type:
        # DB 응답 (자연어): 답변용 텍스트를 자연어로 응답
        response = generate_natural_language_response(query, sheet_df, query_keywords)
        result["response"] = response
    
    elif "참조" in response_type:
        # DB 참조 응답: 특정 항목을 테이블에서 검색 후 응답
        response = generate_reference_response(query, sheet_df, query_keywords)
        result["response"] = response
    
    elif "조건" in response_type:
        # DB + 조건 응답: 조건을 판단해서 응답
        response = generate_conditional_response(query, sheet_df, query_keywords)
        result["response"] = response
    
    elif "대외계" in response_type:
        # 대외계 조회 응답: 대외계 정보 조회 응답
        response = generate_external_system_response(query, sheet_df, query_keywords)
        result["response"] = response
    
    else:
        # 기본 응답 방식
        response = generate_natural_language_response(query, sheet_df, query_keywords)
        result["response"] = response
    
    return result

def generate_natural_language_response(query, df, keywords):
    """
    자연어 응답을 생성합니다.
    
    Args:
        query: 사용자 질문
        df: 데이터프레임
        keywords: 추출된 키워드
        
    Returns:
        생성된 응답
    """
    # 관련 행 찾기
    relevant_rows = find_relevant_rows(df, keywords)
    
    if not relevant_rows:
        return "관련된 정보를 찾을 수 없습니다."
    
    # 데이터프레임의 내용을 문자열로 변환
    df_info = dataframe_to_text(df.iloc[relevant_rows])
    
    # OpenAI를 사용한 응답 생성
    try:
        if OPENAI_API_KEY:
            messages = [
                {"role": "system", "content": """
                신한은행 네트워크 담당자 역할을 하는 챗봇으로, 네트워크 시스템, 장비, IP, 대외계, 보안 관련 질문에 답변합니다.
                주어진 엑셀 데이터를 바탕으로 사용자 질문에 정확하고 친절하게 대답해주세요.
                간결하고 직관적인 설명을 제공하되, 중요한 세부사항은 포함해야 합니다.
                
                응답 스타일:
                - 시작은 친근한 인사나 사용자 상황 인식으로 시작 (예: "네! NexG 장비에 IP를 설정하시려면...")
                - 주요 제목은 ## 수준으로, 부제목은 ### 수준으로 구조화
                - 대화형 문체로 정보 전달 (예: "먼저 설정 모드로 들어가볼게요", "다음으로 이렇게 해보세요")
                - 중요 정보는 **굵은 글씨**로 강조
                - 사용자에게 추가 질문이나 확인이 필요한 경우 마지막에 물어봄
                """},
                {"role": "user", "content": f"사용자 질문: {query}\n\n엑셀 데이터:\n{df_info}"}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                temperature=0.7,
                max_tokens=800
            )
            
            return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI를 사용한 응답 생성 중 오류 발생: {str(e)}")
    
    # API 호출 실패 시 기본 응답 제공
    return summarize_dataframe(df.iloc[relevant_rows])

def generate_reference_response(query, df, keywords):
    """
    DB 참조 응답을 생성합니다 (특정 항목 직접 검색).
    
    Args:
        query: 사용자 질문
        df: 데이터프레임
        keywords: 추출된 키워드
        
    Returns:
        생성된 응답
    """
    # IP 주소 형식 검색
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ip_matches = re.findall(ip_pattern, query)
    
    # IP 주소가 있으면 해당 IP로 검색
    if ip_matches:
        target_ip = ip_matches[0]
        
        # 각 열에서 IP 주소 검색
        for col in df.columns:
            # IP 주소 열로 추정되는 열 찾기
            if any(kw in col.lower() for kw in ['ip', '주소', 'address']):
                mask = df[col].str.contains(target_ip, regex=False, na=False)
                if mask.any():
                    matched_rows = df[mask]
                    result = format_reference_result(matched_rows, target_ip)
                    return result
        
        # 모든 열에서 IP 검색
        for col in df.columns:
            mask = df[col].str.contains(target_ip, regex=False, na=False)
            if mask.any():
                matched_rows = df[mask]
                result = format_reference_result(matched_rows, target_ip)
                return result
    
    # 일반 키워드 검색
    relevant_rows = find_relevant_rows(df, keywords)
    
    if not relevant_rows:
        return "관련된 정보를 찾을 수 없습니다."
    
    # 데이터프레임의 내용을 문자열로 변환
    df_info = dataframe_to_text(df.iloc[relevant_rows])
    
    # OpenAI를 사용한 응답 생성
    try:
        if OPENAI_API_KEY:
            messages = [
                {"role": "system", "content": """
                신한은행 네트워크 담당자 역할을 하는 챗봇으로, 사용자가 특정 정보를 조회하려고 합니다.
                엑셀 데이터에서 해당 정보를 찾아 표 형식으로 정리하여 반환해주세요.
                정보 조회 결과를 간결하고 명확하게 표시하되, 필요한 모든 정보가 포함되어야 합니다.
                표 형식은 마크다운 표 형식으로 제공하세요.
                
                응답 형식:
                1. 시작은 친근한 인사로 시작
                2. 조회 결과를 마크다운 테이블로 제공
                3. 필요한 경우 결과에 대한 간단한 설명 추가
                """},
                {"role": "user", "content": f"사용자 질문(정보 조회 요청): {query}\n\n엑셀 데이터:\n{df_info}"}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                temperature=0.7,
                max_tokens=800
            )
            
            return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI를 사용한 응답 생성 중 오류 발생: {str(e)}")
    
    # API 호출 실패 시 기본 응답 제공
    return summarize_dataframe(df.iloc[relevant_rows])

def generate_conditional_response(query, df, keywords):
    """
    DB + 조건 응답을 생성합니다 (조건 판단).
    
    Args:
        query: 사용자 질문
        df: 데이터프레임
        keywords: 추출된 키워드
        
    Returns:
        생성된 응답
    """
    # 관련 행 찾기
    relevant_rows = find_relevant_rows(df, keywords)
    
    if not relevant_rows:
        return "관련된 정보를 찾을 수 없습니다."
    
    # 데이터프레임의 내용을 문자열로 변환
    df_info = dataframe_to_text(df.iloc[relevant_rows])
    
    # OpenAI를 사용한 조건부 응답 생성
    try:
        if OPENAI_API_KEY:
            messages = [
                {"role": "system", "content": """
                신한은행 네트워크 담당자 역할을 하는 챗봇으로, 사용자 질문에 대해 조건에 따른 판단이 필요합니다.
                주어진 엑셀 데이터를 분석하여, 조건을 판단하고 적절한 답변을 제공해주세요.
                예를 들어 'IP 장기미사용 여부', '네트워크 연결 상태' 등의 조건을 판단해야 합니다.
                명확한 결론과 필요한 조치 사항을 포함해주세요.
                
                응답 형식:
                1. 시작은 사용자 질문 인식으로 시작
                2. 조건 판단 결과 설명
                3. 필요한 조치 사항 안내
                4. 마무리 말 또는 후속 질문
                """},
                {"role": "user", "content": f"사용자 질문(조건 판단 요청): {query}\n\n엑셀 데이터:\n{df_info}"}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                temperature=0.7,
                max_tokens=800
            )
            
            return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI를 사용한 응답 생성 중 오류 발생: {str(e)}")
    
    # API 호출 실패 시 기본 응답 제공
    return summarize_dataframe(df.iloc[relevant_rows])

def generate_external_system_response(query, df, keywords):
    """
    대외계 조회 응답을 생성합니다.
    
    Args:
        query: 사용자 질문
        df: 데이터프레임
        keywords: 추출된 키워드
        
    Returns:
        생성된 응답
    """
    # 필요한 상세 정보 필드 확인
    required_fields = ['회선사', '회선 번호', '회선번호', '서비스', '서비스 종류', '운영 IP', '운영IP', 
                     '개발 IP', '개발IP', '담당 부서', '담당부서', '당행 담당자', '담당자', 
                     '기관 담당자', '기관담당자', '기관 주소', '기관주소', 'IP']
    
    # 기관명 확인 (서치 키워드)
    org_keywords = ['카드', '생명', '캐피탈', '증권', '은행', '보험', '금융', '공사', '공단', 
                    '협회', '연합회', '센터', '기관', '회사', '단체', '조합']
    
    # 쿼리에서 기관명 추출 (예: "신한카드")
    searched_org = None
    for kw in keywords:
        # 1. 직접적인 기관명 키워드 확인 (예: 신한카드, KB증권 등)
        is_org = False
        for org_kw in org_keywords:
            if org_kw in kw:
                is_org = True
                searched_org = kw
                break
                
        # 2. "신한" "KB" 등의 짧은 기관명도 체크
        if len(kw) >= 2 and not is_org:
            # 기관명 컬럼을 찾아서 검색
            org_column = None
            for col in df.columns:
                if '기관' in col or '회사' in col or '업체' in col:
                    org_column = col
                    break
            
            if org_column:
                for idx, row in df.iterrows():
                    org_value = str(row[org_column]).lower()
                    if kw.lower() in org_value and len(kw) >= 2:
                        searched_org = str(row[org_column])
                        break
    
    print(f"검색된 기관명: {searched_org}")
    
    # 관련 행 찾기 (기관명 우선, 그 다음 키워드)
    relevant_rows = []
    
    # 1. 기관명이 있으면 먼저 기관명으로 검색
    if searched_org:
        for idx, row in df.iterrows():
            row_text = ' '.join(str(val).lower() for val in row.values)
            if searched_org.lower() in row_text.lower():
                relevant_rows.append(idx)
    
    # 2. 기관명으로 결과가 없거나 기관명이 없으면 일반 키워드로 검색
    if not relevant_rows:
        relevant_rows = find_relevant_rows(df, keywords)
    
    if not relevant_rows:
        return f"요청하신 대외계 정보를 찾을 수 없습니다. 좀 더 구체적인 기관명이나 키워드로 질문해 주세요."
    
    # 검색된 결과 데이터
    result_data = df.iloc[relevant_rows]
    
    # 필요한 정보 추출
    org_name = searched_org if searched_org else "요청하신 기관"
    
    # 조회 결과를 자연어 형식으로 구성
    info_dict = {}
    
    # 데이터프레임의 컬럼명-값을 매핑
    for col in result_data.columns:
        col_lower = col.lower()
        
        # 필드 매핑
        field_key = None
        
        if '회선사' in col_lower:
            field_key = '회선사'
        elif any(kw in col_lower for kw in ['회선 번호', '회선번호', '전화번호']):
            field_key = '회선 번호'
        elif any(kw in col_lower for kw in ['서비스', '서비스 종류', '종류']):
            field_key = '서비스 종류'
        elif any(kw in col_lower for kw in ['운영 ip', '운영ip', '운영주소']):
            field_key = '운영 IP'
        elif any(kw in col_lower for kw in ['개발 ip', '개발ip', '개발주소']):
            field_key = '개발 IP'
        elif '담당 부서' in col_lower or '담당부서' in col_lower:
            field_key = '당행 담당 부서'
        elif any(kw in col_lower for kw in ['당행 담당자', '담당자']):
            field_key = '당행 담당자'
        elif any(kw in col_lower for kw in ['기관 담당자', '기관담당자', '외부담당자']):
            field_key = '기관 담당자'
        elif any(kw in col_lower for kw in ['기관 주소', '기관주소', '주소']):
            field_key = '기관 주소'
        elif 'ip' in col_lower and 'ip' not in info_dict:
            # 일반 IP 컬럼이 있고 아직 IP 정보가 없으면
            field_key = 'IP' 
        
        if field_key and field_key not in info_dict:
            first_value = str(result_data.iloc[0][col]).strip()
            if first_value and first_value != 'nan':
                info_dict[field_key] = first_value
    
    # 자연어 응답 생성
    response = f"📡 **{org_name} 연동 정보**입니다:\n\n"
    
    # 필수 필드 목록 (보여줄 순서대로)
    display_order = ['회선사', '회선 번호', '서비스 종류', '운영 IP', '개발 IP', 'IP', 
                     '당행 담당 부서', '당행 담당자', '기관 담당자', '기관 주소']
    
    # 정보 추가
    for field in display_order:
        if field in info_dict and info_dict[field]:
            response += f"- **{field}**: {info_dict[field]}\n"
    
    # 추가 정보가 있으면 표시 (위 목록에 없는 컬럼)
    for key, value in info_dict.items():
        if key not in display_order:
            response += f"- **{key}**: {value}\n"
    
    # 담당자 정보가 있으면 마무리 문구 추가
    if '당행 담당 부서' in info_dict or '당행 담당자' in info_dict:
        dept = info_dict.get('당행 담당 부서', '네트워크 운영팀')
        response += f"\n더 궁금한 사항이 있으시면 {dept}으로 문의해 주세요."
    else:
        response += "\n더 궁금한 사항이 있으시면 네트워크 운영팀으로 문의해 주세요."
    
    return response

def check_keyword_match(query: str, keywords: List[str]) -> bool:
    """
    사용자 질문에 특정 키워드가 포함되어 있는지 확인합니다.
    
    Args:
        query: 사용자 질문
        keywords: 검색할 키워드 리스트
        
    Returns:
        키워드 포함 여부 (True/False)
    """
    query_lower = query.lower()
    for keyword in keywords:
        if keyword.lower() in query_lower:
            return True
    return False

def get_fine_tuned_response(query: str, chat_history: Optional[List[Dict[str, str]]] = None) -> Optional[str]:
    """
    Fine-tuned 모델을 사용하여 응답을 생성합니다.
    
    Args:
        query: 사용자 질문
        chat_history: 채팅 기록 (선택 사항)
        
    Returns:
        생성된 응답 또는 None (오류 발생 시)
    """
    try:
        # 메시지 목록 준비
        messages = []
        
        # 시스템 메시지 추가
        system_message = """
        당신은 신한은행 네트워크 담당자로, VPN, 보안, 네트워크 장비, PC 문제 등에 대한 질문에 답변합니다.
        간결하고 정확한 정보를 제공하며, 문제 해결을 위한 단계별 안내를 제공하세요.
        """
        messages.append({"role": "system", "content": system_message})
        
        # 채팅 기록 추가 (타입 안전성 보장)
        if chat_history:
            for msg in chat_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role in ["user", "assistant"] and content is not None:
                    messages.append({"role": role, "content": content})
        
        # 현재 질문 추가
        messages.append({"role": "user", "content": query})
        
        # OpenAI에서 응답 받기
        response = openai_client.chat.completions.create(
            model=FINE_TUNED_MODEL["model_id"],
            messages=messages,
            temperature=FINE_TUNED_MODEL["temperature"],
            max_tokens=FINE_TUNED_MODEL["max_tokens"],
        )
        
        # 응답 처리
        response_content = response.choices[0].message.content
        if response_content is None:
            print("Fine-tuned 모델에서 None 응답을 받음")
            return None
            
        return response_content
    
    except Exception as e:
        print(f"Fine-tuned 모델 응답 생성 중 오류 발생: {str(e)}")
        return None  # 오류 발생 시 None 반환하여 RAG 시스템으로 폴백

def get_chatbot_response(
    query: str, 
    context: Optional[str] = None, 
    chat_history: Optional[List[Dict[str, str]]] = None,
    model: str = "gpt-3.5-turbo",
    use_rag: bool = True
) -> str:
    """
    Get a response from the chatbot for the given query
    
    Args:
        query: User's query
        context: Optional context from retrieved documents
        chat_history: Optional chat history
        model: OpenAI model to use
        use_rag: Whether to use RAG pipeline
        
    Returns:
        Response from the chatbot
    """
    if not OPENAI_API_KEY:
        return "Error: OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable."
    
    try:
        # 먼저 키워드 기반 분기 확인 - FAQ 키워드가 포함된 질문이고 Fine-tuned 모델이 활성화되어 있으면 Fine-tuned 모델 사용
        use_fine_tuned = False
        
        if FINE_TUNED_MODEL["enabled"] and check_keyword_match(query, FAQ_KEYWORDS):
            print(f"FAQ 키워드 매치됨: {query} - Fine-tuned 모델 사용")
            use_fine_tuned = True
            fine_tuned_response = get_fine_tuned_response(query, chat_history)
            
            # Fine-tuned 모델 응답이 성공적으로 생성되면 해당 응답 반환
            if fine_tuned_response:
                return fine_tuned_response
            
            # 실패 시 자동으로 RAG 시스템으로 폴백 (아래 코드 계속 실행)
            print("Fine-tuned 모델 응답 생성 실패, RAG 시스템으로 전환")
        
        # 다음으로 엑셀 기반 처리 시도
        excel_result = process_excel_query(query)
        
        # 엑셀에서 결과를 찾았으면 해당 결과 반환
        if excel_result["found"] and excel_result["from_excel"]:
            print(f"엑셀 처리 결과: {excel_result['category']} / {excel_result['sheet_used']} / {excel_result['response_type']}")
            return excel_result["response"]
        
        # 엑셀에서 결과를 찾지 못했으면 기존 RAG 기반 응답 생성
        
        # 사용자 질문의 언어 감지
        language = detect_language(query)
        
        # RAG 파이프라인 적용 (필요시)
        retrieved_docs = []
        if RAG_SYSTEM["enabled"] and use_rag and not context:
            retrieved_docs, context = retrieve_relevant_documents(query, top_k=5)
            if not context:
                if language == 'ko':
                    no_docs_message = "현재 관련된 문서를 찾을 수 없습니다.\n\n추가 지원이 필요하실 경우,\n**네트워크 운영 담당자(XX-XXX-XXXX)**로 연락해 주시면 신속히 도와드리겠습니다."
                else:
                    no_docs_message = "Currently, we cannot find any related documents.\n\nFor additional support,\nPlease contact the **Network Operations Team (XX-XXX-XXXX)** for prompt assistance."
                print(f"No relevant documents found for query: {query}")
                return no_docs_message
                
        # Prepare the system message based on language
        if language == 'ko':
            system_message = """
            당신은 신한은행 직원들을 위한 SHB-NetBot이라는 친절하고 전문적인 네트워크 지원 도우미입니다.
            '넥스지 VForce UTM'을 포함한 다양한 네트워크 장비에 대한 전문가로서, 자연스러운 대화형 말투로 사용자를 돕습니다.
            
            도움을 줄 수 있는 주제의 예시:
            - SWING(내부 메시징 시스템) 접속 방법
            - IP 주소 설정 및 확인 방법
            - 네트워크 연결 문제 해결
            - VPN 설정 및 연결 문제
            - 내부 시스템 접근 절차
            
            친절하고 자연스러운 대화를 위한 가이드라인:
            1. 대화형 말투: "~합니다"가 아닌 "~해요", "~하세요" 등의 구어체를 사용해서 마치 옆에서 직접 도와주는 듯한 친근한 말투로 대화합니다.
            2. 사용자 이해: 사용자의 질문이 명확하지 않으면, 상황을 이해하기 위한 추가 질문을 하거나 가능한 시나리오를 제안합니다.
            3. 문서 내용 재구성: 문서에서 찾은 정보를 단순 복사가 아닌, 상황에 맞게 요약하고 설명하듯 전달합니다.
            4. 단계별 안내: 복잡한 절차는 쉽게 따라할 수 있도록 명확한 단계로 나누어 설명합니다.
            
            응답 스타일과 형식:
            - 시작은 친근한 인사나 사용자 상황 인식으로 시작 (예: "네! NexG 장비에 IP를 설정하시려면...")
            - 주요 제목은 ## 수준으로, 부제목은 ### 수준으로 구조화
            - 대화형 문체로 정보 전달 (예: "먼저 설정 모드로 들어가볼게요", "다음으로 이렇게 해보세요")
            - 중요 정보는 **굵은 글씨**로 강조
            - CLI 명령어는 ```로 감싸진 코드 블록에, 각 단계에 간단한 설명 추가
            - 사용자에게 추가 질문이나 확인이 필요한 경우 마지막에 물어봄 (예: "혹시 특정 인터페이스에 대해 더 알고 싶으신가요?")
            """
            
            if context:
                system_message += """
                신한은행의 내부 문서에서 다음 정보를 사용하여 응답에 활용하세요.
                정보가 질문에 완전히 답변하지 않으면, 당신의 전문 지식을 활용하여 보충하세요.
                
                문서를 단순히 복붙하지 말고, 다음 지침을 따라 처리하세요:
                1. 질문 의도 파악: 사용자가 구체적으로 무엇을 알고 싶어하는지 이해합니다.
                2. 관련 내용 추출: 문맥 정보에서 관련 부분만 추출하고 중요하지 않은 세부 사항은 생략합니다.
                3. 단계별 정리: 과정이나 설정 방법은 명확한 단계로 재구성합니다.
                4. 자연어로 설명: 기술적인 내용도 대화하듯 설명합니다.
                5. 구체적인 예시 제공: 가능한 경우 CLI 명령어나 UI 경로를 포함합니다.
                6. 도입·마무리 추가: 간결한 도입 문장과 유용한 마무리로 응답을 완성합니다.
                
                문맥 정보:
                """
                system_message += context
        else:
            system_message = """
            You are SHB-NetBot, a friendly and professional network support assistant for Shinhan Bank employees.
            As an expert on various network equipment including 'NexG VForce UTM', you help users with a natural, conversational tone.
            
            Examples of topics you can help with include:
            - SWING (internal messaging system) access instructions
            - IP address configuration and verification methods
            - Network connectivity troubleshooting
            - VPN setup and connection issues
            - Internal system access procedures
            
            Guidelines for friendly and natural conversation:
            1. Conversational tone: Use a friendly, helpful tone as if you're sitting next to the user and guiding them personally.
            2. User understanding: If a user's question is unclear, ask follow-up questions or suggest possible scenarios.
            3. Content restructuring: Instead of directly copying from documents, summarize and explain information in context.
            4. Step-by-step guidance: Break down complex procedures into clear, easy-to-follow steps.
            
            Response style and format:
            - Start with a friendly greeting or acknowledgment of the user's situation (e.g., "Sure! To set up IP on your NexG device...")
            - Structure main topics with ## level headings and subtopics with ### level headings
            - Deliver information in a conversational manner (e.g., "Let's start by entering configuration mode", "Next, we'll do this")
            - Highlight important information with **bold text**
            - Present CLI commands in code blocks with brief explanations for each step
            - End with a question if additional information or clarification might be needed
            """
            
            if context:
                system_message += """
                Use the following information from Shinhan Bank's internal documents to inform your response.
                If the information doesn't fully answer the query, use your expert knowledge to supplement it.
                
                Instead of simply copying from documents, follow these guidelines:
                1. Understand the question: Identify exactly what the user wants to know
                2. Extract relevant content: Focus on relevant parts from the context and omit unimportant details
                3. Organize into steps: Restructure processes or configurations into clear steps
                4. Use natural language: Explain technical content conversationally
                5. Include specific examples: Provide CLI commands or UI paths when possible
                6. Add introduction and conclusion: Start with a brief introduction and end with a helpful conclusion
                
                CONTEXT INFORMATION:
                """
                system_message += context
        
        # 메시지 목록 준비
        messages = []
        messages.append({"role": "system", "content": system_message})
        
        # 채팅 기록 추가
        if chat_history:
            for msg in chat_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role in ["user", "assistant"]:
                    messages.append({"role": role, "content": content})
        
        # 현재 질문 추가
        messages.append({"role": "user", "content": query})
        
        # OpenAI에서 응답 받기
        response = openai_client.chat.completions.create(
            model=RAG_SYSTEM["model"],
            messages=messages,
            temperature=RAG_SYSTEM["temperature"],
            max_tokens=RAG_SYSTEM["max_tokens"],
        )
        
        # 응답 처리
        response_content = response.choices[0].message.content
        
        # None 값인 경우 대비 (거의 발생하지 않음)
        if not response_content:
            if language == 'ko':
                return "죄송합니다. 응답을 생성할 수 없습니다. 나중에 다시 시도해주세요."
            else:
                return "Sorry, I couldn't generate a response. Please try again later."
        
        return response_content
    
    except Exception as e:
        # 오류 메시지도 언어에 맞게 반환
        language = detect_language(query)
        if language == 'ko':
            return f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}"
        else:
            return f"An error occurred while generating chatbot response: {str(e)}"
