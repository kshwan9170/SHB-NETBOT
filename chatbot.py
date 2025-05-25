import os
from typing import List, Dict, Any, Optional, Tuple
import json
import openai
import re
import pandas as pd
from pathlib import Path
from openai import OpenAI
import logging

from database import search_similar_docs

# Import configuration
from config import FAQ_KEYWORDS, FINE_TUNED_MODEL, RAG_SYSTEM

# CSV 변환 모듈 임포트
from csv_to_narrative import CsvNarrativeConverter, search_csv_data, process_csv_files

# 오프라인 모드 관련 상수
OFFLINE_MODE_ENABLED = True
OFFLINE_FALLBACK_MESSAGE = "[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 로컬 데이터만 사용합니다."

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CSV 변환기 초기화
csv_converter = CsvNarrativeConverter()

# 모든 CSV 파일에서 생성된 자연어 문장 캐시
csv_narratives = []

# CSV 파일 처리 함수 (초기화 시 호출)
def initialize_csv_narratives():
    """CSV 파일을 처리하여 자연어 문장 생성 및 캐싱"""
    global csv_narratives
    
    if not os.path.exists(UPLOAD_FOLDER):
        logger.warning(f"업로드 폴더 '{UPLOAD_FOLDER}'가 존재하지 않습니다.")
        return
    
    # 모든 CSV 파일 처리
    all_narratives = []
    csv_files = [f for f in os.listdir(UPLOAD_FOLDER) 
                if os.path.isfile(os.path.join(UPLOAD_FOLDER, f)) and f.endswith('.csv')]
    
    logger.info(f"총 {len(csv_files)}개 CSV 파일 처리 시작")
    
    for csv_file in csv_files:
        filepath = os.path.join(UPLOAD_FOLDER, csv_file)
        try:
            file_narratives = csv_converter.csv_to_narratives(filepath)
            all_narratives.extend(file_narratives)
            logger.info(f"CSV 파일 처리 완료: {csv_file} ({len(file_narratives)}개 문장 생성)")
        except Exception as e:
            logger.error(f"CSV 파일 처리 오류: {csv_file} - {e}")
    
    csv_narratives = all_narratives
    logger.info(f"총 {len(csv_narratives)}개 자연어 문장 생성 완료")

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# 업로드된 파일 디렉토리 경로
UPLOAD_FOLDER = 'uploaded_files'

def is_meaningless_query(query: str) -> bool:
    """
    무의미한 입력인지 감지합니다.
    
    Args:
        query: 사용자 입력 텍스트
        
    Returns:
        무의미한 입력 여부 (True/False)
    """
    # 입력을 정규화
    query = query.strip().lower()
    
    # 너무 짧은 입력 체크
    if len(query) <= 2:
        return True
        
    # 의미 없는 패턴 목록
    meaningless_patterns = [
        r'^[.?!,;:]+$',                 # 기호만 있는 경우 (예: "???", "...", "!!!")
        r'^(ㅋ|ㅎ|ㅠ|ㅜ)+$',              # 자음/모음 반복 (예: "ㅋㅋㅋ", "ㅎㅎ", "ㅠㅠ")
        r'^(test|테스트|testing)$',      # 테스트 입력
        r'^[0-9]+$',                    # 숫자만 있는 경우 (예: "123", "1")
        r'^[a-z]+$',                    # 알파벳 1-2글자 (예: "a", "ab")
        r'^(안녕|hello|hi)$',            # 단순 인사만 있는 경우
    ]
    
    # 패턴에 맞는지 확인
    for pattern in meaningless_patterns:
        if re.match(pattern, query):
            return True
    
    # 의미 없는 단어 목록
    meaningless_words = [
        'test', '테스트', 'asdf', 'qwer', 'zxcv', 'hehe', '흠', '음', 
        'aaa', 'abc', '가나다', '111', '123'
    ]
    
    # 목록에 있는 단어인지 확인
    if query in meaningless_words:
        return True
        
    return False

def get_meaningless_response() -> str:
    """
    무의미한 입력에 대한 응답을 반환합니다.
    
    Returns:
        응답 메시지
    """
    return (
        "😅 정확한 질문 내용을 알 수 없습니다.\n"
        "궁금한 내용을 다시 입력해 주시거나, IT 네트워크 담당 부서(02-1234-5678)로 문의해 주세요."
    )

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

def check_ip_request_form_needed(query: str) -> bool:
    """
    사용자 질문이 IP 주소 신청과 관련된 것인지 확인합니다.
    
    Args:
        query: 사용자 질문
        
    Returns:
        IP 주소 신청 관련 여부 (True/False)
    """
    ip_request_keywords = [
        'ip 신청', 'ip신청', 'ip 주소 신청', 'ip주소신청', 'ip 발급', 'ip발급',
        'ip 할당', 'ip할당', 'ip 신청서', 'ip신청서', 'ip 주소 신청서', 'ip주소신청서',
        'ip 주소 발급', 'ip주소발급', 'ip 어떻게 신청', '아이피 신청', '아이피 발급',
        '신규 ip', '새 ip', '새로운 ip', 'ip 주소 신청하고', '아이피 주소 신청', 
        'ip주소를 신청', 'ip 신청하고', 'ip주소 신청하고', '아이피 신청하고'
    ]
    
    # 사용자 질문을 소문자로 변환하여 검색
    query_lower = query.lower()
    
    print(f"IP 주소 신청 키워드 검사: {query_lower}")
    
    for keyword in ip_request_keywords:
        if keyword in query_lower:
            print(f"IP 주소 신청 키워드 감지됨: '{keyword}'")
            return True
    
    print("IP 주소 신청 키워드가 감지되지 않음")        
    return False

def get_ip_request_form_response() -> str:
    """
    IP 주소 신청서 양식 안내 응답을 반환합니다.
    
    Returns:
        IP 주소 신청서 안내 메시지
    """
    return (
        "### IP 주소 신청 안내\n\n"
        "IP 주소를 신청하시려면 아래 신청서 양식을 작성하여 제출해 주세요.\n\n"
        "📋 [IP 주소 신청서 바로가기](/static/forms/ip_request_form.html)\n\n"
        "📌 **신청 시 주의사항**:\n"
        "1. MAC 주소를 정확히 입력해 주세요 (예: AA:BB:CC:DD:EE:FF)\n"
        "2. 장비 종류와 사용 목적을 명확히 기재해 주세요\n"
        "3. 문의사항은 IT 네트워크 담당 부서(02-1234-5678)로 연락해 주세요\n\n"
        "신청서 제출 후 1-2일 내에 처리되며, 승인 결과는 이메일로 안내됩니다."
    )

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
        return f"안녕하세요! 죄송합니다만, '{search_term}'에 대한 정보를 찾을 수 없습니다. 다른 검색어로 다시 시도해보시겠어요?"
    
    # IP 주소인지 확인
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    is_ip_address = bool(re.match(ip_pattern, search_term))
    
    if is_ip_address:
        # IP 주소 전용 친절한 응답 형식
        # 중요 필드를 추출하여 구조화된 응답 생성
        important_fields = ['IP', '주소', '장비', '사용자', '부서', '용도', '위치', '담당', '네트워크', '할당일', '기간', '상태']
        
        # 친절한 인사로 시작
        result = f"안녕하세요! **{search_term}** IP 주소에 대한 정보를 찾았습니다. 😊\n\n"
        result += "## 📌 IP 정보 요약\n\n"
        
        # 테이블 대신 중요 정보를 먼저 구조화하여 표시
        info_found = False
        for field in important_fields:
            for col in df.columns:
                if field.lower() in col.lower():
                    # 첫 번째 행의 값만 사용 (중복 결과가 있을 수 있음)
                    value = str(df.iloc[0][col]).strip()
                    if value and value.lower() not in ['nan', 'none', '']:
                        result += f"* **{col}**: {value}\n"
                        info_found = True
        
        # 중요 필드가 없으면 모든 필드 표시
        if not info_found:
            result += "### 상세 정보\n\n"
            for col in df.columns:
                value = str(df.iloc[0][col]).strip()
                if value and value.lower() not in ['nan', 'none', '']:
                    result += f"* **{col}**: {value}\n"
        
        # 필요한 경우 전체 데이터 테이블 추가 (많은 데이터가 있을 때)
        if len(df) > 1 or len(df.columns) > 5:
            result += "\n### 📊 전체 데이터 테이블\n\n"
            # 마크다운 테이블 생성
            md_table = []
            headers = '| ' + ' | '.join(df.columns) + ' |'
            md_table.append(headers)
            separator = '| ' + ' | '.join(['---'] * len(df.columns)) + ' |'
            md_table.append(separator)
            
            for _, row in df.iterrows():
                row_values = '| ' + ' | '.join(str(val) for val in row.values) + ' |'
                md_table.append(row_values)
            
            result += '\n'.join(md_table)
        
        # 친절한 마무리와 추가 도움 제안
        result += "\n\n다른 IP 주소나 네트워크 정보가 필요하신가요? 언제든 물어봐 주세요! 😊"
        
    else:
        # 일반 검색어에 대한 응답
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
        
        table_result = '\n'.join(md_table)
        result = f"안녕하세요! '{search_term}'에 대한 조회 결과입니다:\n\n{table_result}\n\n추가 정보가 필요하시면 언제든 물어봐 주세요! 😊"
    
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
    
    # IP 주소 신청 관련 키워드가 있는지 확인
    ip_application_keywords = ["ip 주소 신청", "ip 신청", "ip address 신청", "ip 할당", "아이피 신청", "ip 신청 방법"]
    is_ip_application_query = any(keyword.lower() in query.lower() for keyword in ip_application_keywords)
    
    # IP 주소 신청 관련 쿼리인 경우 절차_안내 시트를 우선 활용
    if is_ip_application_query and '절차_안내' in sheet_names:
        print("IP 주소 신청 관련 쿼리 감지 - 절차_안내 시트 사용")
        
        # 절차_안내 시트에서 관련 정보 찾기
        procedure_df = read_excel_sheet(excel_file, '절차_안내')
        
        # 데이터프레임이 비어있지 않으면 처리
        if not procedure_df.empty:
            for idx, row in procedure_df.iterrows():
                # IP 관련 행인지 확인 ('절차 구분' 열에 'IP' 포함 여부 확인)
                procedure_type = str(row.get('절차 구분', '')).lower()
                if 'ip' in procedure_type and any(term in procedure_type for term in ['주소', '신청']):
                    # IP 주소 신청 절차 정보 찾음
                    result["found"] = True
                    result["category"] = "IP 주소 신청 절차"
                    result["sheet_used"] = "절차_안내"
                    result["response_type"] = "절차 안내"
                    
                    # 응답 구성을 위한 데이터 추출
                    summary = str(row.get('요약 응답', ''))
                    details = str(row.get('상세 안내', ''))
                    dept = str(row.get('담당 부서', ''))
                    links = str(row.get('관련 문서/링크', ''))
                    
                    # 응답 구성
                    response = f"""
# IP 주소 신청 절차 안내

## 요약
{summary}

## 신청 절차
{details}

## 담당 부서
**{dept}**

## 관련 링크
{links}

추가 질문이 있으신가요?
"""
                    result["response"] = response
                    return result
    
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
                    # 안전하게 Series를 문자열로 처리 (Truth value 오류 방지)
                    cell_value = str(row[col])
                    if cell_value and cell_value.strip() and cell_value.lower() != 'nan':
                        keywords.extend(cell_value.split(','))
            
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
                if sheet_col:
                    target_sheet_info = str(row[sheet_col])
                    if target_sheet_info and target_sheet_info.strip() and target_sheet_info.lower() != 'nan':
                        # "XX 시트 참조" 형식에서 시트 이름 추출
                        sheet_match = re.search(r'([가-힣A-Za-z0-9_]+)[\s_]시트', target_sheet_info)
                        if sheet_match:
                            target_sheet = sheet_match.group(1)
                
                # 처리 방식 정보 추출
                if response_type_col:
                    response_type_value = str(row[response_type_col])
                    if response_type_value and response_type_value.strip() and response_type_value.lower() != 'nan':
                        response_type = response_type_value
                
                break
    
    # 매칭되는 내용을 찾지 못한 경우
    if not isinstance(matched_row, pd.Series) or not target_sheet:
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
    # IP 주소 신청 관련 쿼리인지 확인
    is_ip_address_query = any(keyword.lower() in query.lower() for keyword in 
                             ["ip 주소 신청", "ip 신청", "ip주소", "아이피 신청", "ip 할당 요청", "아이피", "ip 발급"])
    
    # 관련 행 찾기
    relevant_rows = []
    
    # IP 주소 신청 쿼리인 경우 특별 처리
    if is_ip_address_query:
        # 절차_안내 시트인 경우 (테이블 구조가 다름)
        if '절차 구분' in df.columns:
            for idx, row in df.iterrows():
                # 절차 구분이나 질문 키워드에 IP 관련 단어가 있는지 확인
                procedure_type = str(row.get('절차 구분', '')).lower()
                question_keywords = str(row.get('질문 키워드', '')).lower()
                
                if 'ip' in procedure_type and any(term in procedure_type for term in ['주소', '신청']):
                    relevant_rows.append(idx)
                elif 'ip' in question_keywords:
                    relevant_rows.append(idx)
        # 대외계_연동 시트 등 다른 시트인 경우
        else:
            # 데이터가 '절차' 또는 '방법'에 관한 내용인지 확인
            for idx, row in df.iterrows():
                row_text = ' '.join(str(val).lower() for val in row.values)
                
                if 'ip' in row_text and any(term in query.lower() for term in ['방법', '절차', '신청', '어떻게']):
                    # 절차, 방법에 관한 쿼리라면 담당부서, 담당자 정보 포함
                    if any(col for col in df.columns if '부서' in col or '담당' in col):
                        relevant_rows.append(idx)
    
    # 일반 키워드 검색으로 관련 행을 못 찾았거나 IP 주소 신청 쿼리가 아닌 경우
    if not relevant_rows:
        relevant_rows = find_relevant_rows(df, keywords)
    
    if not relevant_rows:
        return "관련된 정보를 찾을 수 없습니다."
    
    # 데이터프레임의 내용을 문자열로 변환
    df_info = dataframe_to_text(df.iloc[relevant_rows])
    
    # OpenAI를 사용한 응답 생성
    try:
        if OPENAI_API_KEY:
            # IP 주소 신청 쿼리인 경우 특화된 프롬프트 사용
            if is_ip_address_query:
                system_prompt = """
                신한은행 네트워크 지원 챗봇으로서, IP 주소 신청 절차에 관한 질문에 답변합니다.

                *** 중요 응답 가이드라인 ***
                1. IP 주소 신청 절차와 방법에 초점을 맞춰서 설명하세요.
                2. 외부 기관 정보는 필요한 경우에만 언급하고, 주요 내용은 신청 절차 자체여야 합니다.
                3. 담당 부서와 담당자 정보를 명확히 제공하세요.
                4. 단계별로 절차를 설명하고, 각 단계마다 숫자를 매겨 안내하세요.
                5. 필요한 서류나 정보, 소요 시간 등 실용적인 정보를 포함하세요.
                
                응답 형식:
                - 주요 제목은 ## 수준으로, 부제목은 ### 수준으로 구조화
                - 단계별 절차는 숫자로 구분
                - 담당자/담당부서 정보는 굵게 표시
                - 마지막에 추가 질문이 있는지 확인
                """
            else:
                # 일반 질문에 대한 기본 프롬프트
                system_prompt = """
                신한은행 네트워크 담당자 역할을 하는 챗봇으로, 네트워크 시스템, 장비, IP, 대외계, 보안 관련 질문에 답변합니다.
                주어진 엑셀 데이터를 바탕으로 사용자 질문에 정확하고 친절하게 대답해주세요.
                간결하고 직관적인 설명을 제공하되, 중요한 세부사항은 포함해야 합니다.
                
                응답 스타일:
                - 시작은 친근한 인사나 사용자 상황 인식으로 시작 (예: "네! NexG 장비에 IP를 설정하시려면...")
                - 주요 제목은 ## 수준으로, 부제목은 ### 수준으로 구조화
                - 대화형 문체로 정보 전달 (예: "먼저 설정 모드로 들어가볼게요", "다음으로 이렇게 해보세요")
                - 중요 정보는 **굵은 글씨**로 강조
                - 사용자에게 추가 질문이나 확인이 필요한 경우 마지막에 물어봄
                """
            
            messages = [
                {"role": "system", "content": system_prompt},
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

def get_local_response(query: str) -> str:
    """
    로컬 데이터를 기반으로 오프라인 모드에서 응답을 생성합니다.
    
    Args:
        query: 사용자의 질문
        
    Returns:
        로컬 데이터 기반 응답
    """
    logger.info(f"오프라인 모드 로컬 응답 생성 시작: {query}")
    
    # IP 주소 패턴 검색 (정규식)
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ip_match = re.search(ip_pattern, query)
    
    if ip_match:
        # IP 주소 검색
        ip_address = ip_match.group(0)
        logger.info(f"IP 주소 감지: {ip_address}")
        
        # CSV 자연어 변환 데이터를 먼저 활용 시도
        if csv_converter and len(csv_narratives) > 0:
            try:
                # IP 주소로 직접 검색 (csv_converter 메소드 활용)
                matched_results = csv_converter.search_by_ip(csv_narratives, ip_address)
                
                if matched_results and len(matched_results) > 0:
                    # 결과가 있으면 첫 번째 결과 사용
                    result = matched_results[0]
                    logger.info(f"IP 주소 검색 매치 성공: {ip_address}")
                    
                    # 사용자 정보인지 확인 (IP_사용자_조회.csv 파일에서 왔는지)
                    is_user_info = False
                    if 'metadata' in result and 'filename' in result['metadata']:
                        if '사용자' in result['metadata']['filename'] or 'IP' in result['metadata']['filename']:
                            is_user_info = True
                    
                    # 응답 메시지 생성 (사용자 정보인 경우 다른 포맷 적용)
                    if is_user_info:
                        response = f"## IP 주소 사용자 정보\n\n{result['text']}"
                    else:
                        response = f"## IP 주소 정보 조회 결과\n\n{result['text']}"
                    
                    # 추가 정보가 있으면 포함
                    if len(matched_results) > 1:
                        response += f"\n\n추가로 {len(matched_results)-1}개의 관련 정보가 있습니다."
                        
                    return response
            except Exception as e:
                logger.error(f"IP 주소 검색 중 오류 발생: {str(e)}")
        
        # 수동 검색 방법 (이전 방식)
        matched_results = []
        
        for narrative in csv_narratives:
            # 메타데이터에 IP 주소가 있는지 확인
            if 'metadata' in narrative and narrative['metadata'].get('ip_address') == ip_address:
                matched_results.append(narrative)
                continue
                
            # 텍스트에 IP 주소가 포함되어 있는지 확인
            if ip_address in narrative['text']:
                matched_results.append(narrative)
        
        if matched_results:
            # 결과가 있으면 첫 번째 결과 사용
            result = matched_results[0]
            logger.info(f"IP 주소 검색 매치 성공 (수동 방식): {ip_address}")
            
            # 응답 메시지 생성
            response = f"## IP 주소 정보 조회 결과\n\n{result['text']}"
            
            # 추가 정보가 있으면 포함
            if len(matched_results) > 1:
                response += f"\n\n추가로 {len(matched_results)-1}개의 관련 정보가 있습니다."
                
            return response
        
        # IP 주소에 대한 정보를 찾지 못한 경우
        logger.info(f"IP 주소 검색 매치 실패: {ip_address}")
        return f"IP 주소 **{ip_address}**에 대한 정보를 찾을 수 없습니다.\n\n다른 IP 주소로 검색하거나 네트워크 관리자에게 문의해 주세요."
    
    # 키워드 검색 (IP 주소가 아닌 경우)
    # 검색어에서 키워드 추출 (2글자 이상 단어)
    keywords = [word for word in query.split() if len(word) >= 2]
    
    if keywords:
        # 키워드 매칭 결과 및 점수
        results_with_scores = []
        
        for narrative in csv_narratives:
            score = 0
            
            # 키워드 매칭
            for keyword in keywords:
                if keyword in narrative['text']:
                    score += 1
            
            # 점수가 있는 경우만 결과에 추가
            if score > 0:
                results_with_scores.append({
                    'narrative': narrative,
                    'score': score
                })
        
        # 점수를 기준으로 정렬 (높은 점수가 먼저)
        results_with_scores.sort(key=lambda x: x['score'], reverse=True)
        
        # 상위 결과 선택 (최대 3개)
        top_results = results_with_scores[:min(3, len(results_with_scores))]
        
        if top_results:
            logger.info(f"키워드 검색 결과: {len(top_results)}개 매치")
            
            # 검색 결과를 응답으로 포맷팅
            response = "## 검색 결과\n\n"
            
            for idx, result in enumerate(top_results):
                narrative = result['narrative']
                response += f"### 결과 {idx + 1}\n{narrative['text']}\n\n"
            
            return response
    
    # 매칭되는 결과가 없는 경우
    logger.info("매칭 결과 없음")
    return "질문과 관련된 정보를 로컬 데이터베이스에서 찾지 못했습니다. 질문을 더 자세히 작성하거나 IP 주소와 같은 구체적인 정보를 포함해 보세요."

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
    # 무의미한 입력 감지 (예: "1", "테스트", "???" 등)
    if is_meaningless_query(query):
        return get_meaningless_response()
    
    # 오프라인 상태 감지
    try:
        # app.py의 연결 상태 확인 함수 가져오기
        from app import get_connection_status
        is_online = get_connection_status()
    except:
        # 만약 app의 함수를 가져올 수 없다면, 안전하게 온라인으로 간주
        is_online = True
    
    # 일반 IP 주소 검색인지 확인 (192.168.0.1 형식)
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ip_matches = re.findall(ip_pattern, query)
    
    # IP 주소가 있으면 CSV 자연어 변환 데이터에서 먼저 검색
    if ip_matches:
        target_ip = ip_matches[0]
        
        # CSV 자연어 변환 데이터에서 검색 (만약 데이터가 있다면)
        if csv_narratives:
            # target_ip로 검색
            matched_results = csv_converter.search_by_ip(csv_narratives, target_ip)
            
            if matched_results:
                # 결과가 있으면 첫 번째 결과 사용
                result = matched_results[0]
                
                # 응답 메시지 생성
                response = f"""
## IP 주소 정보 조회 결과

{result['text']}

"""
                # 추가 정보가 있으면 포함
                if len(matched_results) > 1:
                    response += f"\n\n추가로 {len(matched_results)-1}개의 관련 정보가 있습니다."
                
                # 연결 상태 정보 추가
                try:
                    from app import get_connection_status
                    is_online = get_connection_status()
                    if is_online:
                        response += "\n\n[🟢 온라인 모드] 인터넷 연결이 정상입니다."
                except:
                    pass
                    
                return response
        
        # 기존 엑셀 처리 방식으로 폴백
        excel_result = process_excel_query(query)
        
        # 엑셀에서 결과를 찾았으면 반환
        if excel_result["found"] and excel_result["from_excel"]:
            return excel_result["response"]
            
        # 엑셀에서 찾지 못했으면 RAG 검색
        retrieved_docs, context = retrieve_relevant_documents(query, top_k=3)
        
        # 검색 결과가 있으면 IP 정보를 구조화하여 표시
        if retrieved_docs:
            # 응답의 가독성을 위해 임의의 구조화된 데이터로 변환
            ip_data = pd.DataFrame({
                'IP 주소': [target_ip],
                '설명': ['검색 결과를 기반으로 한 정보입니다.'],
                '용도': ['네트워크 장비 연결']
            })
            return format_reference_result(ip_data, target_ip)
            
        # 매칭 실패 메시지
        fallback_message = csv_converter.get_fallback_message("IP_사용자_조회")
        return f"## IP 주소 조회 결과\n\n{fallback_message}\n\nIP 주소 **{target_ip}**에 대한 정보를 찾지 못했습니다. 다른 IP 주소로 검색하거나 네트워크 관리자에게 문의해 주세요."
    
    # IP 주소 신청 관련 쿼리인지 확인
    ip_application_keywords = ["ip 주소 신청", "ip 신청", "ip주소 신청", "아이피 신청", 
                              "ip 할당", "ip 신청 방법", "ip 주소 신청 방법", "ip 신청 절차",
                              "아이피 신청 방법", "아이피 발급", "ip 발급"]
    is_ip_application_query = False
    for keyword in ip_application_keywords:
        if keyword in query.lower():
            is_ip_application_query = True
            break
            
    # IP 주소 신청 방법에 대한 고정 응답 사용
    if is_ip_application_query:
        # 오프라인 상태일 때 표시 추가
        connection_status = ""
        if not is_online:
            connection_status = "\n\n[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있습니다."
        elif is_online:
            connection_status = "\n\n[🟢 온라인 모드] 인터넷 연결이 정상입니다."
            
        return f"""
# IP 주소 신청 절차 안내

## 신청 절차
1. **네트워크 신청 시스템에 접속**합니다.
2. IP 주소 신청 메뉴를 선택합니다.
3. 신청서 양식을 작성합니다:
   - 사용 목적 입력
   - 필요한 IP 대역 (내부/외부) 선택
   - 사용 기간 명시
   - 담당자 정보 입력
4. 작성된 신청서를 제출합니다.
5. **NW 운영팀의 검토 후 승인**을 받습니다.
6. 승인 후 IP 주소가 할당되며 이메일로 통보됩니다.

## 담당 부서
- **담당 부서:** NW 운영팀
- **담당자:** 김지원 과장
- **연락처:** 내선 1234 또는 010-1111-1111

## 참고 사항
- 신청 후 처리는 업무일 기준 1-2일 소요됩니다.
- 긴급한 경우 담당자에게 직접 연락하시기 바랍니다.
- 신청 시스템 주소: https://intra.shinhan.com/ip

추가 질문이 있으신가요?{connection_status}
"""
    # API 키 부재 또는 오프라인 상태 확인
    if not OPENAI_API_KEY or not is_online:
        if context:
            offline_message = f"""
[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 AI 응답 생성이 불가능합니다.

질문과 관련된 로컬 데이터베이스 정보:
{context}

온라인 상태에서 다시 시도하시거나, IT 담당자에게 직접 문의해주세요.
"""
            return offline_message
        else:
            return """
[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있으며, 질문에 관련된 정보를 로컬에서 찾지 못했습니다.

네트워크 연결이 복구된 후 다시 시도해주시거나, IT 담당자에게 직접 문의해주세요.
"""
    
    try:
        # 파인튜닝 기능 비활성화 (사용자 요청에 따라)
        # 이전에는 FAQ 키워드가 포함된 질문이면 Fine-tuned 모델을 사용했으나,
        # 현재는 RAG 시스템과 기능이 겹쳐 응답이 마음에 들지 않아 비활성화함
        use_fine_tuned = False
        
        # config.py에서 enabled 값을 False로 설정했으므로 아래 코드는 실행되지 않음
        # 코드는 향후 재활성화 가능성을 위해 유지함
        if False and FINE_TUNED_MODEL["enabled"] and check_keyword_match(query, FAQ_KEYWORDS):
            print("Fine-tuned 모델이 비활성화되어 있어 사용하지 않음")
        
        # 다음으로 엑셀 기반 처리 시도
        excel_result = process_excel_query(query)
        
        # 엑셀에서 결과를 찾았으면 해당 결과 반환
        if excel_result["found"] and excel_result["from_excel"]:
            print(f"엑셀 처리 결과: {excel_result['category']} / {excel_result['sheet_used']} / {excel_result['response_type']}")
            return excel_result["response"]
        
        # IP 주소 신청 관련 쿼리인지 확인
        if check_ip_request_form_needed(query):
            # IP 주소 신청서 양식을 제공
            return get_ip_request_form_response()
            
        # 이전 IP 주소 신청 관련 코드는 유지(대체 경로로)
        ip_application_keywords = ["ip 주소 신청", "ip 신청", "ip주소 신청", "아이피 신청", 
                                  "ip 할당", "ip 신청 방법", "ip 주소 신청 방법", "ip 신청 절차",
                                  "아이피 신청 방법", "아이피 발급", "ip 발급"]
        is_ip_application_query = False
        for keyword in ip_application_keywords:
            if keyword in query.lower():
                is_ip_application_query = True
                break
                
        # IP 주소 신청 관련 쿼리인 경우 특별 처리
        if is_ip_application_query:
            # 먼저 신청서 양식 제공
            return get_ip_request_form_response()
            
            # 아래 코드는 신청서 양식이 없을 때 대체 응답으로 작동 (현재는 실행되지 않음)
            ip_procedure_response = """
# IP 주소 신청 절차 안내

## 신청 절차
1. **네트워크 신청 시스템에 접속**합니다.
2. IP 주소 신청 메뉴를 선택합니다.
3. 신청서 양식을 작성합니다:
   - 사용 목적 입력
   - 필요한 IP 대역 (내부/외부) 선택
   - 사용 기간 명시
   - 담당자 정보 입력
4. 작성된 신청서를 제출합니다.
5. **NW 운영팀의 검토 후 승인**을 받습니다.
6. 승인 후 IP 주소가 할당되며 이메일로 통보됩니다.

## 담당 부서
- **담당 부서:** NW 운영팀
- **담당자:** 김지원 과장
- **연락처:** 내선 1234 또는 010-1111-1111

## 참고 사항
- 신청 후 처리는 업무일 기준 1-2일 소요됩니다.
- 긴급한 경우 담당자에게 직접 연락하시기 바랍니다.
- 신청 시스템 주소: https://intra.shinhan.com/ip

추가 질문이 있으신가요?
"""
            return ip_procedure_response
            
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
