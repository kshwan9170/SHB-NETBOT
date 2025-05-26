"""
업무 안내 가이드 전용 처리 모듈
- 업무 안내 가이드(~).csv 파일들에서 키워드 우선 매칭
- 정형화된 템플릿 응답 생성
- GPT 응답은 매칭 실패 시에만 사용
"""

import os
import pandas as pd
import re
from typing import List, Dict, Any, Optional, Tuple
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class BusinessGuideProcessor:
    """업무 안내 가이드 CSV 파일 전용 처리기"""
    
    def __init__(self, upload_folder: str = "uploaded_files"):
        self.upload_folder = upload_folder
        self.guide_files = {}  # 가이드 파일별 데이터 캐시
        self.load_guide_files()
    
    def load_guide_files(self):
        """업무 안내 가이드 CSV 파일들을 로드하고 캐시"""
        if not os.path.exists(self.upload_folder):
            logger.warning(f"업로드 폴더 '{self.upload_folder}'가 존재하지 않습니다.")
            return
        
        # 업무 안내 가이드 파일 패턴
        guide_patterns = [
            r".*업무\s*안내\s*가이드.*\.csv$",
            r".*업무.*가이드.*\.csv$",
            r".*안내.*가이드.*\.csv$"
        ]
        
        for filename in os.listdir(self.upload_folder):
            filepath = os.path.join(self.upload_folder, filename)
            
            # 업무 안내 가이드 파일인지 확인
            is_guide_file = any(re.search(pattern, filename, re.IGNORECASE) for pattern in guide_patterns)
            
            if is_guide_file and os.path.isfile(filepath):
                try:
                    # 파일 유형별 구분
                    guide_type = self._determine_guide_type(filename)
                    df = self._load_csv_file(filepath)
                    
                    if df is not None and not df.empty:
                        self.guide_files[filename] = {
                            'type': guide_type,
                            'data': df,
                            'filepath': filepath,
                            'columns': list(df.columns)
                        }
                        logger.info(f"업무 안내 가이드 로드 완료: {filename} ({guide_type})")
                
                except Exception as e:
                    logger.error(f"업무 안내 가이드 로드 실패 {filename}: {str(e)}")
        
        logger.info(f"총 {len(self.guide_files)}개 업무 안내 가이드 파일 로드 완료")
    
    def _determine_guide_type(self, filename: str) -> str:
        """파일명으로 가이드 유형 결정"""
        filename_lower = filename.lower()
        
        if 'ip' in filename_lower and ('사용자' in filename_lower or '조회' in filename_lower):
            return 'ip_user_guide'
        elif '대외계' in filename_lower or '연동' in filename_lower:
            return 'external_system_guide'
        elif '장애' in filename_lower or '문의' in filename_lower:
            return 'trouble_inquiry_guide'
        elif '절차' in filename_lower or '안내' in filename_lower:
            return 'procedure_guide'
        else:
            return 'general_guide'
    
    def _load_csv_file(self, filepath: str) -> Optional[pd.DataFrame]:
        """CSV 파일 로드 (인코딩 자동 감지)"""
        encodings = ['utf-8', 'cp949', 'euc-kr', 'latin-1']
        
        for encoding in encodings:
            try:
                df = pd.read_csv(filepath, encoding=encoding)
                logger.info(f"CSV 파일 '{filepath}' {encoding} 인코딩으로 성공적으로 읽음")
                return df
            except UnicodeDecodeError:
                continue
            except Exception as e:
                logger.error(f"CSV 파일 읽기 오류 {filepath}: {str(e)}")
                break
        
        logger.error(f"CSV 파일 읽기 실패: {filepath}")
        return None
    
    def search_keywords(self, query: str) -> Optional[Dict[str, Any]]:
        """
        사용자 질문에서 키워드를 추출하고 업무 안내 가이드에서 매칭 검색
        
        Args:
            query: 사용자 질문
            
        Returns:
            매칭된 결과 딕셔너리 또는 None
        """
        if not self.guide_files:
            return None
        
        # 키워드 추출
        keywords = self._extract_keywords(query)
        logger.info(f"추출된 키워드: {keywords}")
        
        # 모든 가이드 파일에서 검색
        best_match = None
        best_score = 0
        
        for filename, guide_info in self.guide_files.items():
            matches = self._search_in_guide(guide_info, keywords, query)
            
            for match in matches:
                if match['score'] > best_score:
                    best_score = match['score']
                    best_match = match
                    best_match['source_file'] = filename
                    best_match['guide_type'] = guide_info['type']
        
        return best_match if best_score > 0 else None
    
    def _extract_keywords(self, query: str) -> List[str]:
        """질문에서 키워드 추출"""
        # 불용어 제거
        stopwords = ['을', '를', '이', '가', '은', '는', '의', '에', '에서', '로', '으로', 
                    '와', '과', '하고', '그리고', '또는', '하는', '되는', '있는', '없는',
                    '어떻게', '무엇', '언제', '어디서', '왜', '누가', '뭐', '어떤',
                    '입니다', '습니다', '해요', '예요', '이에요', '네요', '요']
        
        # 특수문자 제거 및 공백으로 분할
        cleaned_query = re.sub(r'[^\w\s]', ' ', query)
        words = [word.strip() for word in cleaned_query.split() if len(word.strip()) > 1]
        
        # 불용어 제거
        keywords = [word for word in words if word not in stopwords]
        
        return keywords
    
    def _search_in_guide(self, guide_info: Dict[str, Any], keywords: List[str], original_query: str) -> List[Dict[str, Any]]:
        """특정 가이드 파일에서 키워드 검색"""
        df = guide_info['data']
        guide_type = guide_info['type']
        results = []
        
        # 검색 대상 컬럼 결정
        search_columns = self._get_search_columns(guide_type, list(df.columns))
        
        for idx, row in df.iterrows():
            score = 0
            matched_fields = []
            
            # 각 검색 컬럼에서 키워드 매칭
            for col in search_columns:
                if col in df.columns and pd.notna(row[col]):
                    cell_value = str(row[col]).lower()
                    
                    for keyword in keywords:
                        if keyword.lower() in cell_value:
                            score += 2  # 키워드 정확 매칭
                            matched_fields.append(f"{col}: {keyword}")
                    
                    # 부분 매칭 점수
                    for keyword in keywords:
                        if len(keyword) > 2:
                            for word in cell_value.split():
                                if keyword.lower() in word and len(word) > 2:
                                    score += 1  # 부분 매칭
            
            if score > 0:
                result = {
                    'score': score,
                    'row_data': row.to_dict(),
                    'matched_fields': matched_fields,
                    'guide_type': guide_type,
                    'row_index': idx
                }
                results.append(result)
        
        # 점수별 정렬
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:3]  # 상위 3개만 반환
    
    def _get_search_columns(self, guide_type: str, available_columns: List[str]) -> List[str]:
        """가이드 유형별 검색 대상 컬럼 결정"""
        search_priority = {
            'ip_user_guide': ['질문 키워드', '질문 예시', 'IP 주소', '사용자명', '부서'],
            'external_system_guide': ['대외기관명', '서비스명', '질문 키워드', '비고'],
            'trouble_inquiry_guide': ['질문 카테고리', '질문 키워드', '질문 예시'],
            'procedure_guide': ['절차 구분', '질문 키워드', '질문 예시'],
            'general_guide': ['질문 키워드', '질문 예시', '카테고리', '구분']
        }
        
        priority_columns = search_priority.get(guide_type, ['질문 키워드', '질문 예시'])
        
        # 실제 존재하는 컬럼만 반환
        result_columns = []
        for col in priority_columns:
            if col in available_columns:
                result_columns.append(col)
        
        # 추가로 키워드나 예시가 포함된 컬럼 찾기
        for col in available_columns:
            col_lower = col.lower()
            if ('키워드' in col_lower or '예시' in col_lower or '카테고리' in col_lower or 
                '구분' in col_lower or '문의' in col_lower) and col not in result_columns:
                result_columns.append(col)
        
        return result_columns
    
    def generate_template_response(self, match_result: Dict[str, Any]) -> Optional[str]:
        """매칭 결과를 기반으로 정형화된 템플릿 응답 생성"""
        if not match_result:
            return None
        
        row_data = match_result['row_data']
        guide_type = match_result['guide_type']
        source_file = match_result.get('source_file', '업무 안내 가이드')
        
        # 가이드 유형별 템플릿 응답 생성
        if guide_type == 'ip_user_guide':
            return self._generate_ip_user_response(row_data, source_file)
        elif guide_type == 'external_system_guide':
            return self._generate_external_system_response(row_data, source_file)
        elif guide_type == 'trouble_inquiry_guide':
            return self._generate_trouble_inquiry_response(row_data, source_file)
        elif guide_type == 'procedure_guide':
            return self._generate_procedure_response(row_data, source_file)
        else:
            return self._generate_general_response(row_data, source_file)
    
    def _generate_ip_user_response(self, row_data: Dict[str, Any], source_file: str) -> str:
        """IP 사용자 조회 가이드 응답 생성"""
        response_parts = []
        
        if 'IP 주소' in row_data and pd.notna(row_data['IP 주소']):
            response_parts.append(f"🌐 **IP 주소**: {row_data['IP 주소']}")
        
        if '사용자명' in row_data and pd.notna(row_data['사용자명']):
            response_parts.append(f"👤 **사용자**: {row_data['사용자명']}")
        
        if '부서' in row_data and pd.notna(row_data['부서']):
            response_parts.append(f"🏢 **부서**: {row_data['부서']}")
        
        if '연락처' in row_data and pd.notna(row_data['연락처']):
            response_parts.append(f"📞 **연락처**: {row_data['연락처']}")
        
        if '상태' in row_data and pd.notna(row_data['상태']):
            response_parts.append(f"📊 **상태**: {row_data['상태']}")
        
        if '비고' in row_data and pd.notna(row_data['비고']):
            response_parts.append(f"📝 **비고**: {row_data['비고']}")
        
        response = "\n".join(response_parts)
        response += f"\n\n📋 **출처**: {source_file}"
        
        return response
    
    def _generate_external_system_response(self, row_data: Dict[str, Any], source_file: str) -> str:
        """대외계 연동 가이드 응답 생성"""
        # 표 헤더 생성
        response = "## 📋 대외기관 연결 정보\n\n"
        
        # 표 형태로 정보 구성
        table_rows = []
        
        if '대외기관명' in row_data and pd.notna(row_data['대외기관명']):
            table_rows.append(f"| 🏛️ **기관명** | {row_data['대외기관명']} |")
        
        if '서비스명' in row_data and pd.notna(row_data['서비스명']):
            table_rows.append(f"| ⚙️ **서비스** | {row_data['서비스명']} |")
        
        if '회선사' in row_data and pd.notna(row_data['회선사']):
            table_rows.append(f"| 📡 **회선사** | {row_data['회선사']} |")
        
        if '회선번호' in row_data and pd.notna(row_data['회선번호']):
            table_rows.append(f"| 📞 **회선번호** | {row_data['회선번호']} |")
        
        if 'IP(운영)' in row_data and pd.notna(row_data['IP(운영)']):
            table_rows.append(f"| 🌐 **운영 IP** | `{row_data['IP(운영)']}` |")
        
        if 'IP(개발)' in row_data and pd.notna(row_data['IP(개발)']):
            table_rows.append(f"| 🔧 **개발 IP** | `{row_data['IP(개발)']}` |")
        
        # 담당자 정보 섹션
        contact_info = []
        if '당행 담당자' in row_data and pd.notna(row_data['당행 담당자']):
            contact_info.append(f"| 👤 **담당자** | {row_data['당행 담당자']} |")
        
        if '당행 연락처' in row_data and pd.notna(row_data['당행 연락처']):
            contact_info.append(f"| 📞 **연락처** | {row_data['당행 연락처']} |")
        
        if '당행 부서' in row_data and pd.notna(row_data['당행 부서']):
            contact_info.append(f"| 🏢 **부서** | {row_data['당행 부서']} |")
        
        # 기관 담당자 정보
        if '기관 담당자' in row_data and pd.notna(row_data['기관 담당자']):
            contact_info.append(f"| 👥 **기관 담당자** | {row_data['기관 담당자']} |")
        
        if '기관 연락처' in row_data and pd.notna(row_data['기관 연락처']):
            contact_info.append(f"| 📱 **기관 연락처** | {row_data['기관 연락처']} |")
        
        # 표 구성
        if table_rows:
            response += "| 구분 | 내용 |\n"
            response += "|------|------|\n"
            response += "\n".join(table_rows)
            response += "\n\n"
        
        # 담당자 정보가 있으면 별도 섹션으로 추가
        if contact_info:
            response += "### 👥 담당자 정보\n\n"
            response += "| 구분 | 내용 |\n"
            response += "|------|------|\n"
            response += "\n".join(contact_info)
            response += "\n\n"
        
        # 비고 정보
        if '비고' in row_data and pd.notna(row_data['비고']):
            response += f"### 📝 비고\n{row_data['비고']}\n\n"
        
        # 기관 주소 정보
        if '기관 주소' in row_data and pd.notna(row_data['기관 주소']):
            response += f"### 📍 기관 주소\n{row_data['기관 주소']}\n\n"
        
        # 원본 파일명에서 UUID 제거
        clean_source_file = source_file
        if '_' in source_file and len(source_file.split('_')[0]) == 36:
            clean_source_file = '_'.join(source_file.split('_')[1:])
        
        # 참고 문서 출처 제거 - 사용자 요청
        
        return response
    
    def _generate_trouble_inquiry_response(self, row_data: Dict[str, Any], source_file: str) -> str:
        """장애 문의 가이드 응답 생성"""
        response_parts = []
        
        # 1. 요약 (첫 번째)
        if '요약 응답' in row_data and pd.notna(row_data['요약 응답']):
            response_parts.append(f"💡 **요약**\n{row_data['요약 응답']}")
        
        # 2. 상세 안내 (두 번째)
        if '상세 안내' in row_data and pd.notna(row_data['상세 안내']):
            detailed_info = str(row_data['상세 안내'])
            
            # 기기별 설정법 시각적 구분 (iPhone, Galaxy 등)
            formatted_info = detailed_info.replace('iPhone', '\n\n📱 **iPhone 설정법**:')
            formatted_info = formatted_info.replace('Galaxy', '\n\n📱 **Galaxy 설정법**:')
            formatted_info = formatted_info.replace('Android', '\n\n🤖 **Android 설정법**:')
            
            # 숫자로 시작하는 단계들을 구분
            formatted_info = formatted_info.replace('1. ', '\n\n**1.** ').replace('2. ', '\n\n**2.** ').replace('3. ', '\n\n**3.** ')
            formatted_info = formatted_info.replace('4. ', '\n\n**4.** ').replace('5. ', '\n\n**5.** ')
            formatted_info = formatted_info.replace('6. ', '\n\n**6.** ').replace('7. ', '\n\n**7.** ')
            
            # URL을 하이퍼링크 문구로 대체
            import re
            url_pattern = r'https?://[^\s]+'
            urls = re.findall(url_pattern, formatted_info)
            for url in urls:
                if 'wifi' in url.lower() or 'wi-fi' in url.lower():
                    formatted_info = formatted_info.replace(url, '[Wi-Fi 연결 가이드 바로가기]')
                else:
                    formatted_info = formatted_info.replace(url, '[관련 가이드 바로가기]')
            
            # ?? 기호를 이모지로 변경
            formatted_info = formatted_info.replace('??', '📱')
            
            response_parts.append(f"📋 **안내**{formatted_info}")
        
        # 3. 설정법 (기기별로 이미 위에서 처리됨)
        
        # 4. 관련 정보 (마지막)
        info_parts = []
        
        if '담당 부서' in row_data and pd.notna(row_data['담당 부서']):
            info_parts.append(f"🏢 **담당 부서**: {row_data['담당 부서']}")
        
        if '관련 문서/링크' in row_data and pd.notna(row_data['관련 문서/링크']):
            link_text = str(row_data['관련 문서/링크'])
            # URL을 하이퍼링크 문구로 대체
            import re
            url_pattern = r'https?://[^\s]+'
            urls = re.findall(url_pattern, link_text)
            for url in urls:
                if 'wifi' in url.lower() or 'wi-fi' in url.lower():
                    link_text = link_text.replace(url, '[Wi-Fi 연결 가이드 바로가기]')
                else:
                    link_text = link_text.replace(url, '[관련 가이드 바로가기]')
            info_parts.append(f"🔗 **관련 문서**: {link_text}")
        
        if info_parts:
            # 각 항목을 개별 줄로 표시
            info_text = "ℹ️ **관련 정보**\n" + "\n".join(info_parts)
            # [🟢 온라인 모드] 표시 추가
            info_text += "\n[🟢 온라인 모드] 내부 업무 가이드 기반 응답"
            response_parts.append(info_text)
        
        # 각 항목 사이에 공백 라인 추가하여 시각적 분리 강화
        response = "\n\n".join(response_parts)
        
        return response
    
    def _generate_procedure_response(self, row_data: Dict[str, Any], source_file: str) -> str:
        """절차 안내 가이드 응답 생성"""
        response_parts = []
        
        # 1. 요약 (첫 번째)
        if '요약 응답' in row_data and pd.notna(row_data['요약 응답']):
            response_parts.append(f"💡 **요약**\n{row_data['요약 응답']}")
        
        # 2. 상세 안내 (두 번째)
        if '상세 안내' in row_data and pd.notna(row_data['상세 안내']):
            detailed_info = str(row_data['상세 안내'])
            
            # 기기별 설정법 시각적 구분
            formatted_info = detailed_info.replace('iPhone', '\n\n📱 **iPhone 설정법**:')
            formatted_info = formatted_info.replace('Galaxy', '\n\n📱 **Galaxy 설정법**:')
            formatted_info = formatted_info.replace('Android', '\n\n🤖 **Android 설정법**:')
            
            # 숫자로 시작하는 단계들을 구분
            formatted_info = formatted_info.replace('1. ', '\n\n**1.** ').replace('2. ', '\n\n**2.** ').replace('3. ', '\n\n**3.** ')
            formatted_info = formatted_info.replace('4. ', '\n\n**4.** ').replace('5. ', '\n\n**5.** ')
            formatted_info = formatted_info.replace('6. ', '\n\n**6.** ').replace('7. ', '\n\n**7.** ')
            
            # URL을 하이퍼링크 문구로 대체
            import re
            url_pattern = r'https?://[^\s]+'
            urls = re.findall(url_pattern, formatted_info)
            for url in urls:
                if 'wifi' in url.lower() or 'wi-fi' in url.lower():
                    formatted_info = formatted_info.replace(url, '[Wi-Fi 연결 가이드 바로가기]')
                else:
                    formatted_info = formatted_info.replace(url, '[관련 가이드 바로가기]')
            
            # ?? 기호를 이모지로 변경
            formatted_info = formatted_info.replace('??', '📱')
            
            response_parts.append(f"📝 **절차 안내**{formatted_info}")
        
        # 3. 관련 정보 (마지막)
        info_parts = []
        
        if '절차 구분' in row_data and pd.notna(row_data['절차 구분']):
            info_parts.append(f"📋 **절차 구분**: {row_data['절차 구분']}")
        
        if '담당 부서' in row_data and pd.notna(row_data['담당 부서']):
            info_parts.append(f"🏢 **담당 부서**: {row_data['담당 부서']}")
        
        if '관련 문서/링크' in row_data and pd.notna(row_data['관련 문서/링크']):
            link_text = str(row_data['관련 문서/링크'])
            # URL을 하이퍼링크 문구로 대체
            import re
            url_pattern = r'https?://[^\s]+'
            urls = re.findall(url_pattern, link_text)
            for url in urls:
                if 'wifi' in url.lower() or 'wi-fi' in url.lower():
                    link_text = link_text.replace(url, '[Wi-Fi 연결 가이드 바로가기]')
                else:
                    link_text = link_text.replace(url, '[관련 가이드 바로가기]')
            info_parts.append(f"🔗 **관련 문서**: {link_text}")
        
        # 참고 문서 출처 제거 - 사용자 요청
        
        if info_parts:
            response_parts.append("ℹ️ **관련 정보**\n" + "\n".join(info_parts))
        
        # 각 항목 사이에 공백 라인 추가하여 시각적 분리 강화
        response = "\n\n".join(response_parts)
        
        return response
    
    def _generate_general_response(self, row_data: Dict[str, Any], source_file: str) -> str:
        """일반 가이드 응답 생성"""
        response_parts = []
        
        # 주요 필드들을 순서대로 확인
        key_fields = ['요약 응답', '상세 안내', '질문 예시', '비고', '설명', '내용']
        
        for field in key_fields:
            if field in row_data and pd.notna(row_data[field]):
                response_parts.append(f"📝 **{field}**: {row_data[field]}")
        
        # 추가 정보 필드들
        info_fields = ['담당 부서', '관련 문서/링크', '연락처']
        for field in info_fields:
            if field in row_data and pd.notna(row_data[field]):
                response_parts.append(f"ℹ️ **{field}**: {row_data[field]}")
        
        response = "\n".join(response_parts)
        
        # 참고 문서 출처 제거 - 사용자 요청
        
        return response
    
    def reload_guide_files(self):
        """가이드 파일 재로드 (새 파일 업로드 시 호출)"""
        self.guide_files.clear()
        self.load_guide_files()
        logger.info("업무 안내 가이드 파일 재로드 완료")

# 전역 인스턴스
business_guide_processor = BusinessGuideProcessor()