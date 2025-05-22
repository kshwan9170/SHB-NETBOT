"""
CSV 데이터를 자연어 문장으로 변환하는 모듈
- CSV 행 데이터를 자연어 문장으로 변환
- 메타데이터 자동 부여
- IP 주소 및 키워드 매칭 기능
"""

import os
import re
import pandas as pd
import json
from typing import List, Dict, Any, Tuple, Optional
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# IP 주소 정규식 패턴
IP_PATTERN = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'

class CsvNarrativeConverter:
    """CSV 데이터를 자연어 문장으로 변환하는 클래스"""
    
    def __init__(self):
        self.templates = {
            "IP_사용자_조회": {
                "template": "IP {IP 주소}는 {부서}의 {사용자명} 담당자가 {상태} 상태입니다. 연락처는 {연락처}입니다. 최종 접속일은 {최종 접속일}입니다. {비고}",
                "short_template": "IP {IP 주소}는 {부서}의 {사용자명} 담당자가 {상태} 상태입니다.",
                "fallback": "요청하신 IP 주소에 대한 정보를 찾을 수 없습니다."
            },
            "절차_안내": {
                "template": "[{절차 구분}] {질문 예시}에 대한 답변은 '{요약 응답}'입니다. {상세 안내} 담당 부서는 {담당 부서}입니다.",
                "short_template": "[{절차 구분}] {질문 예시}에 대한 답변은 '{요약 응답}'입니다.",
                "fallback": "요청하신 절차에 대한 정보를 찾을 수 없습니다."
            },
            "default": {
                "template": "행 {row_index}의 데이터: {row_data}",
                "short_template": "행 {row_index}의 데이터: {row_data}",
                "fallback": "요청하신 정보를 찾을 수 없습니다."
            }
        }
    
    def detect_csv_type(self, filepath: str, headers: List[str]) -> str:
        """
        CSV 파일 유형 감지
        
        Args:
            filepath: CSV 파일 경로
            headers: CSV 헤더 목록
            
        Returns:
            감지된 CSV 유형 (templates 키에 해당)
        """
        # 파일명 기반 감지
        filename = os.path.basename(filepath)
        
        # IP 사용자 조회 유형 감지
        if 'IP_사용자_조회' in filename or ('IP' in headers and '사용자명' in headers):
            return "IP_사용자_조회"
        
        # 절차 안내 유형 감지
        if '절차_안내' in filename or ('절차 구분' in headers and '질문 예시' in headers):
            return "절차_안내"
        
        # 기본값
        return "default"
    
    def csv_to_narratives(self, 
                          filepath: str, 
                          add_metadata: bool = True) -> List[Dict[str, Any]]:
        """
        CSV 파일을 자연어 문장으로 변환
        
        Args:
            filepath: CSV 파일 경로
            add_metadata: 메타데이터 추가 여부
            
        Returns:
            자연어 문장 및 메타데이터 목록
        """
        try:
            # UTF-8 인코딩으로 시도
            df = pd.read_csv(filepath, encoding='utf-8')
        except UnicodeDecodeError:
            try:
                # CP949 인코딩으로 시도
                df = pd.read_csv(filepath, encoding='cp949')
            except Exception as e:
                logger.error(f"CSV 파일 읽기 오류: {e}")
                return []
        
        # CSV 유형 감지
        headers = list(df.columns)
        csv_type = self.detect_csv_type(filepath, headers)
        
        narratives = []
        
        for idx, row in df.iterrows():
            # 결측치 제거
            row_dict = {k: '' if pd.isna(v) else v for k, v in row.to_dict().items()}
            
            # 자연어 문장 생성
            narrative = self._create_narrative(row_dict, csv_type, int(idx))
            
            # 메타데이터 추가
            if add_metadata:
                metadata = self._create_metadata(filepath, row_dict, csv_type, int(idx))
                narrative.update(metadata)
            
            narratives.append(narrative)
        
        return narratives
    
    def _create_narrative(self, 
                          row_dict: Dict[str, Any], 
                          csv_type: str, 
                          row_idx: int) -> Dict[str, Any]:
        """
        행 데이터를 자연어 문장으로 변환
        
        Args:
            row_dict: 행 데이터 딕셔너리
            csv_type: CSV 유형
            row_idx: 행 인덱스
            
        Returns:
            자연어 문장 및 관련 정보
        """
        template = self.templates.get(csv_type, self.templates["default"])
        
        # 빈 값 처리 - 자연스러운 문장 생성을 위해
        cleaned_dict = row_dict.copy()
        for key, value in row_dict.items():
            if pd.isna(value) or value == '':
                if key == '상태':
                    cleaned_dict[key] = '사용 중'
                elif key == '비고':
                    cleaned_dict[key] = ''
                else:
                    cleaned_dict[key] = '정보 없음'
        
        try:
            # IP 주소 조회 유형인 경우 특별 처리
            if csv_type == "IP_사용자_조회":
                ip_address = cleaned_dict.get('IP 주소', '')
                user_name = cleaned_dict.get('사용자명', '정보 없음')
                department = cleaned_dict.get('부서', '정보 없음')
                contact = cleaned_dict.get('연락처', '')
                status = cleaned_dict.get('상태', '사용 중')
                last_access = cleaned_dict.get('최종 접속일', '')
                note = cleaned_dict.get('비고', '')
                
                # 기본 문장 구성
                if status in ['사용 중', '정상', '활성']:
                    narrative_text = f"IP {ip_address}는 {department}의 {user_name} 담당자가 사용 중입니다."
                else:
                    narrative_text = f"IP {ip_address}는 {department}의 {user_name} 담당자가 {status} 상태입니다."
                
                # 추가 정보
                if contact and contact != '정보 없음':
                    narrative_text += f" 연락처는 {contact}입니다."
                    
                if last_access and last_access != '정보 없음':
                    narrative_text += f" 최근 접속일은 {last_access}입니다."
                    
                if note and note.strip():
                    if any(warning in note for warning in ['차단', '만료', '경고', '주의']):
                        narrative_text += f" 주의: {note}"
                    else:
                        narrative_text += f" 참고사항: {note}"
                
                # 짧은 버전
                if status in ['사용 중', '정상', '활성']:
                    short_text = f"IP {ip_address}는 {department}의 {user_name} 담당자가 사용 중입니다."
                else:
                    short_text = f"IP {ip_address}는 {department}의 {user_name} 담당자가 {status} 상태입니다."
                
            # 기본 템플릿 적용 (다른 유형)
            elif csv_type == "default":
                narrative_text = template["template"].format(
                    row_index=row_idx + 1, 
                    row_data=", ".join([f"{k}: {v}" for k, v in cleaned_dict.items()])
                )
                short_text = template["short_template"].format(
                    row_index=row_idx + 1, 
                    row_data=", ".join([f"{k}: {v}" for k, v in cleaned_dict.items()])
                )
            else:
                # 그 외 템플릿 적용
                narrative_text = template["template"].format(**cleaned_dict)
                short_text = template["short_template"].format(**cleaned_dict)
                
        except KeyError as e:
            # 템플릿에 필요한 키가 없는 경우
            logger.warning(f"템플릿 적용 오류: {e}")
            narrative_text = f"행 {row_idx + 1} 데이터: {json.dumps(row_dict, ensure_ascii=False)}"
            short_text = narrative_text
            
        # 결과 반환
        result = {
            "text": narrative_text,
            "short_text": short_text,
            "row_data": row_dict,
            "row_index": row_idx + 1,
            "csv_type": csv_type
        }
        
        # IP 주소가 있으면 추출
        if csv_type == "IP_사용자_조회" and "IP 주소" in row_dict:
            result["ip_address"] = row_dict["IP 주소"]
        
        # 질문 키워드가 있으면 추출
        if csv_type == "절차_안내" and "질문 키워드" in row_dict:
            result["keywords"] = [kw.strip() for kw in str(row_dict["질문 키워드"]).split(',')]
        
        return result
    
    def _create_metadata(self, 
                         filepath: str, 
                         row_dict: Dict[str, Any], 
                         csv_type: str, 
                         row_idx: int) -> Dict[str, Any]:
        """
        메타데이터 생성
        
        Args:
            filepath: CSV 파일 경로
            row_dict: 행 데이터 딕셔너리
            csv_type: CSV 유형
            row_idx: 행 인덱스
            
        Returns:
            메타데이터 딕셔너리
        """
        filename = os.path.basename(filepath)
        
        metadata = {
            "metadata": {
                "source": filename,
                "row_index": row_idx + 1,
                "csv_type": csv_type,
                "content_type": "csv_narrative",
                "column_count": len(row_dict),
                "is_structured_data": True
            }
        }
        
        # 유형별 추가 메타데이터
        if csv_type == "IP_사용자_조회":
            metadata["metadata"].update({
                "category": "네트워크 자산",
                "subcategory": "IP 주소 관리"
            })
        
        elif csv_type == "절차_안내":
            metadata["metadata"].update({
                "category": "업무 절차",
                "subcategory": row_dict.get("절차 구분", "일반")
            })
        
        return metadata
    
    def search_by_ip(self, 
                     narratives: List[Dict[str, Any]], 
                     ip_address: str) -> List[Dict[str, Any]]:
        """
        IP 주소로 검색
        
        Args:
            narratives: 자연어 문장 목록
            ip_address: 검색할 IP 주소
            
        Returns:
            매칭된 결과 목록 (오프라인 모드용 자연어 문장 포함)
        """
        ip_pattern = ip_address.replace(".", r"\.")  # IP 주소 정규식 패턴화
        
        matches = []
        for narrative in narratives:
            # IP 주소 필드 확인
            if narrative.get("ip_address") == ip_address or any(str(value) == ip_address for key, value in narrative.get("row_data", {}).items()):
                # 원본 데이터 복제
                result = dict(narrative)
                
                # 자연스러운 문장 생성을 위한 데이터 추출
                row_data = result.get("row_data", {})
                
                # 필요한 정보 추출
                user_name = row_data.get("사용자명", "")
                department = row_data.get("부서", "")
                status = row_data.get("상태", "사용 중")
                contact = row_data.get("연락처", "")
                last_access = row_data.get("최종 접속일", "")
                note = row_data.get("비고", "")
                
                # 오프라인 모드 응답용 자연어 문장 생성
                offline_text = f"IP {ip_address}는 "
                
                if department and user_name:
                    if status in ["사용 중", "정상", "활성"]:
                        offline_text += f"{department}의 {user_name} 담당자가 사용 중입니다."
                    else:
                        offline_text += f"{department}의 {user_name} 담당자가 {status} 상태입니다."
                elif user_name:
                    if status in ["사용 중", "정상", "활성"]:
                        offline_text += f"{user_name} 담당자가 사용 중입니다."
                    else:
                        offline_text += f"{user_name} 담당자가 {status} 상태입니다."
                else:
                    offline_text += f"에 대한 정보입니다."
                
                # 추가 정보 포함
                if contact:
                    offline_text += f" 연락처는 {contact}입니다."
                
                if last_access:
                    offline_text += f" 최근 접속일은 {last_access}입니다."
                
                if note and note.strip():
                    if any(keyword in note for keyword in ["차단", "만료", "경고", "주의"]):
                        offline_text += f" 주의: {note}"
                    else:
                        offline_text += f" 참고사항: {note}"
                
                # 오프라인 모드용 텍스트 필드 추가
                result["offline_text"] = offline_text
                
                matches.append(result)
        
        return matches
    
    def search_by_keywords(self, 
                          narratives: List[Dict[str, Any]], 
                          keywords: List[str]) -> List[Dict[str, Any]]:
        """
        키워드로 검색
        
        Args:
            narratives: 자연어 문장 목록
            keywords: 검색할 키워드 목록
            
        Returns:
            매칭된 결과 목록 (정확도 점수 포함)
        """
        if not keywords:
            return []
            
        matches = []
        for narrative in narratives:
            score = 0
            row_data = narrative.get("row_data", {})
            
            # 키워드 필드 확인
            narrative_keywords = narrative.get("keywords", [])
            for keyword in keywords:
                if keyword in narrative_keywords:
                    score += 5  # 키워드 필드에 정확히 일치하면 높은 점수
            
            # 모든 필드에서 키워드 검색
            for key, value in row_data.items():
                value_str = str(value).lower()
                for keyword in keywords:
                    if keyword.lower() in value_str:
                        score += 1  # 일반 필드에 포함되면 낮은 점수
                    if keyword.lower() == value_str:
                        score += 3  # 정확히 일치하면 중간 점수
            
            if score > 0:
                narrative_copy = narrative.copy()
                narrative_copy["match_score"] = score
                matches.append(narrative_copy)
        
        # 점수 기준 내림차순 정렬
        return sorted(matches, key=lambda x: x.get("match_score", 0), reverse=True)
    
    def get_fallback_message(self, csv_type: str) -> str:
        """
        매칭 실패 시 안내 메시지
        
        Args:
            csv_type: CSV 유형
            
        Returns:
            안내 메시지
        """
        template = self.templates.get(csv_type, self.templates["default"])
        return template.get("fallback", "요청하신 정보를 찾을 수 없습니다.")
    
    def contains_ip_address(self, text: str) -> bool:
        """
        텍스트에 IP 주소 포함 여부 확인
        
        Args:
            text: 확인할 텍스트
            
        Returns:
            IP 주소 포함 여부
        """
        ip_matches = re.findall(IP_PATTERN, text)
        return len(ip_matches) > 0
    
    def extract_ip_address(self, text: str) -> Optional[str]:
        """
        텍스트에서 IP 주소 추출
        
        Args:
            text: 대상 텍스트
            
        Returns:
            추출된 IP 주소 (없으면 None)
        """
        ip_matches = re.findall(IP_PATTERN, text)
        return ip_matches[0] if ip_matches else None
    
    def extract_keywords(self, text: str, min_length: int = 2) -> List[str]:
        """
        텍스트에서 키워드 추출
        
        Args:
            text: 대상 텍스트
            min_length: 최소 키워드 길이
            
        Returns:
            추출된 키워드 목록
        """
        # 불용어 (영어, 한글 기본 불용어)
        stopwords = ['은', '는', '이', '가', '을', '를', '에', '의', '와', '과', 
                     '에서', '로', '으로', '하다', '있다', '되다', '않다', '않은']
        
        # 특수문자 및 숫자 제거
        clean_text = re.sub(r'[^\w\s]', ' ', text)
        clean_text = re.sub(r'\d+', ' ', clean_text)
        
        # 공백 기준 분리
        words = clean_text.split()
        
        # 키워드 필터링 (최소 길이, 불용어 제외)
        keywords = [word for word in words 
                   if len(word) >= min_length and word not in stopwords]
        
        return keywords


def process_csv_files(directory: str = 'uploaded_files') -> Dict[str, List[Dict[str, Any]]]:
    """
    디렉토리 내 모든 CSV 파일 처리
    
    Args:
        directory: CSV 파일이 있는 디렉토리 경로
        
    Returns:
        파일별 자연어 문장 목록
    """
    converter = CsvNarrativeConverter()
    results = {}
    
    csv_files = [f for f in os.listdir(directory) 
                if os.path.isfile(os.path.join(directory, f)) and f.endswith('.csv')]
    
    for csv_file in csv_files:
        filepath = os.path.join(directory, csv_file)
        try:
            narratives = converter.csv_to_narratives(filepath)
            results[csv_file] = narratives
            logger.info(f"처리 완료: {csv_file} ({len(narratives)}개 문장 생성)")
        except Exception as e:
            logger.error(f"파일 처리 오류: {csv_file} - {e}")
    
    return results


def search_csv_data(query: str, narratives: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], str]:
    """
    CSV 데이터 검색 (IP 또는 키워드 기반)
    
    Args:
        query: 검색 쿼리
        narratives: 자연어 문장 목록
        
    Returns:
        (검색 결과 목록, 검색 방법) 튜플
    """
    converter = CsvNarrativeConverter()
    
    # 쿼리에서 IP 주소 확인
    ip_address = converter.extract_ip_address(query)
    if ip_address:
        results = converter.search_by_ip(narratives, ip_address)
        return results, "ip_search"
    
    # 키워드 추출 및 검색
    keywords = converter.extract_keywords(query)
    if keywords:
        results = converter.search_by_keywords(narratives, keywords)
        return results, "keyword_search"
    
    return [], "no_match"


if __name__ == "__main__":
    # 모듈 테스트
    results = process_csv_files()
    print(f"총 {len(results)}개 CSV 파일 처리 완료")
    
    # 모든 자연어 문장 병합
    all_narratives = []
    for file_narratives in results.values():
        all_narratives.extend(file_narratives)
    
    # 검색 테스트
    test_queries = [
        "192.168.0.1 IP 주소는 누가 사용하나요?",
        "네트워크 연결이 안됩니다",
        "IP 주소 할당은 어떻게 하나요?"
    ]
    
    for query in test_queries:
        matched_results, search_type = search_csv_data(query, all_narratives)
        print(f"\n검색 쿼리: {query}")
        print(f"검색 방법: {search_type}")
        print(f"결과 수: {len(matched_results)}")
        
        if matched_results:
            for i, result in enumerate(matched_results[:3]):  # 상위 3개만 표시
                print(f"{i+1}. {result['text']}")
        else:
            print("결과 없음")