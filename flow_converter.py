"""
SHB-NetBot Flow CSV → JSON 자동 변환 모듈
- SHB-NetBot_Flow.csv 파일을 감지하여 자동으로 JSON 구조로 변환
- 오프라인 모드에서 사용할 Flow 형태로 저장
"""

import os
import pandas as pd
import json
import logging
from typing import Dict, List, Any, Optional

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FlowConverter:
    """CSV Flow 파일을 JSON으로 변환하는 클래스"""
    
    def __init__(self):
        self.flow_file_pattern = "SHB-NetBot_Flow"
        self.output_path = "static/data/offline_flow.json"
        
    def detect_flow_file(self, uploaded_files_dir: str = "uploaded_files") -> Optional[str]:
        """
        업로드된 파일 중 SHB-NetBot_Flow.csv 파일을 찾습니다.
        
        Args:
            uploaded_files_dir: 업로드된 파일들이 있는 디렉토리
            
        Returns:
            찾은 파일의 전체 경로 또는 None
        """
        try:
            for filename in os.listdir(uploaded_files_dir):
                if self.flow_file_pattern in filename and filename.endswith('.csv'):
                    full_path = os.path.join(uploaded_files_dir, filename)
                    logger.info(f"Flow 파일 발견: {filename}")
                    return full_path
        except Exception as e:
            logger.error(f"Flow 파일 탐색 중 오류: {e}")
        return None
    
    def parse_options(self, options_str: str) -> List[Dict[str, str]]:
        """
        선택지 문자열을 파싱하여 옵션 리스트로 변환합니다.
        
        Args:
            options_str: "예:check_phone_light, 아니요:check_pc_lan_light" 형태의 문자열
            
        Returns:
            [{"label": "예", "next": "check_phone_light"}, ...] 형태의 리스트
        """
        if not options_str or options_str.strip() == "(종료)":
            return []
            
        options = []
        try:
            # 쉼표로 분리
            option_pairs = [opt.strip() for opt in options_str.split(',')]
            
            for pair in option_pairs:
                if ':' in pair:
                    label, next_id = pair.split(':', 1)
                    options.append({
                        "label": label.strip(),
                        "next": next_id.strip()
                    })
        except Exception as e:
            logger.error(f"옵션 파싱 중 오류: {e}, 입력: {options_str}")
            
        return options
    
    def convert_csv_to_json(self, csv_file_path: str) -> Dict[str, Any]:
        """
        CSV 파일을 JSON Flow 구조로 변환합니다.
        
        Args:
            csv_file_path: CSV 파일 경로
            
        Returns:
            JSON Flow 구조 딕셔너리
        """
        try:
            # CSV 파일 읽기 (UTF-8 시도 후 CP949로 fallback)
            try:
                df = pd.read_csv(csv_file_path, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(csv_file_path, encoding='cp949')
            
            logger.info(f"CSV 파일 로드 완료: {len(df)}개 행")
            
            # JSON Flow 구조 생성
            flow_data = {}
            
            # 컬럼명 정규화 (다양한 컬럼명 지원)
            columns = df.columns.tolist()
            question_col = None
            options_col = None
            
            # 질문/안내 컬럼 찾기
            for col in columns:
                if '질문' in col or '안내' in col:
                    question_col = col
                    break
            
            # 선택지 컬럼 찾기  
            for col in columns:
                if '선택' in col:
                    options_col = col
                    break
            
            if not question_col:
                question_col = columns[1] if len(columns) > 1 else columns[0]
            if not options_col:
                options_col = columns[2] if len(columns) > 2 else columns[-1]
            
            for _, row in df.iterrows():
                node_id = str(row['ID']).strip()
                text = str(row[question_col]).strip()
                options_str = str(row[options_col]).strip() if pd.notna(row[options_col]) else ""
                
                # 옵션 파싱
                options = self.parse_options(options_str)
                
                flow_data[node_id] = {
                    "id": node_id,
                    "text": text,
                    "options": options
                }
                
            logger.info(f"JSON Flow 변환 완료: {len(flow_data)}개 노드")
            return flow_data
            
        except Exception as e:
            logger.error(f"CSV → JSON 변환 중 오류: {e}")
            return {}
    
    def save_flow_json(self, flow_data: Dict[str, Any]) -> bool:
        """
        변환된 Flow 데이터를 JSON 파일로 저장합니다.
        
        Args:
            flow_data: 변환된 Flow 데이터
            
        Returns:
            저장 성공 여부
        """
        try:
            # 디렉토리 생성 (존재하지 않는 경우)
            os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
            
            with open(self.output_path, 'w', encoding='utf-8') as f:
                json.dump(flow_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Flow JSON 저장 완료: {self.output_path}")
            return True
            
        except Exception as e:
            logger.error(f"Flow JSON 저장 중 오류: {e}")
            return False
    
    def auto_sync_flow(self, uploaded_files_dir: str = "uploaded_files") -> Dict[str, Any]:
        """
        SHB-NetBot_Flow.csv 파일을 자동으로 감지하여 JSON으로 변환 및 저장합니다.
        
        Args:
            uploaded_files_dir: 업로드된 파일 디렉토리
            
        Returns:
            변환 결과 딕셔너리 {'success': bool, 'message': str, 'flow_data': dict}
        """
        try:
            # Flow 파일 탐색
            flow_file_path = self.detect_flow_file(uploaded_files_dir)
            
            if not flow_file_path:
                return {
                    'success': False, 
                    'message': 'SHB-NetBot_Flow.csv 파일을 찾을 수 없습니다.',
                    'flow_data': {}
                }
            
            # CSV → JSON 변환
            flow_data = self.convert_csv_to_json(flow_file_path)
            
            if not flow_data:
                return {
                    'success': False,
                    'message': 'CSV 파일 변환에 실패했습니다.',
                    'flow_data': {}
                }
            
            # JSON 파일 저장
            save_success = self.save_flow_json(flow_data)
            
            if save_success:
                logger.info(f"Flow 자동 동기화 완료: {len(flow_data)}개 노드")
                return {
                    'success': True,
                    'message': f'Flow 동기화 완료: {len(flow_data)}개 노드가 업데이트되었습니다.',
                    'flow_data': flow_data
                }
            else:
                return {
                    'success': False,
                    'message': 'JSON 파일 저장에 실패했습니다.',
                    'flow_data': flow_data
                }
                
        except Exception as e:
            logger.error(f"Flow 자동 동기화 중 오류: {e}")
            return {
                'success': False,
                'message': f'동기화 중 오류 발생: {str(e)}',
                'flow_data': {}
            }


# 전역 FlowConverter 인스턴스
flow_converter = FlowConverter()


def check_and_sync_flow(uploaded_files_dir: str = "uploaded_files") -> Dict[str, Any]:
    """
    Flow 파일 자동 동기화 실행 함수 (외부에서 호출용)
    
    Args:
        uploaded_files_dir: 업로드된 파일 디렉토리
        
    Returns:
        동기화 결과 딕셔너리
    """
    return flow_converter.auto_sync_flow(uploaded_files_dir)


def get_offline_flow() -> Dict[str, Any]:
    """
    오프라인 모드용 Flow 데이터를 가져오는 함수
    
    Returns:
        Flow 데이터 딕셔너리
    """
    try:
        if os.path.exists(flow_converter.output_path):
            with open(flow_converter.output_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"오프라인 Flow 데이터 로드 중 오류: {e}")
    
    return {}