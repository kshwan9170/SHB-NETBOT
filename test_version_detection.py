import os
import document_processor
import database
import chatbot

# Test the version detection from filenames
def test_version_detection():
    print("\n=== 파일명 기반 버전 감지 테스트 ===")
    
    # Test cases with various date formats
    test_filenames = [
        "업무 안내 가이드_2025.05.19.xlsx",
        "업무 안내 가이드_2025-05-19.xlsx",
        "업무_안내_가이드_2025_05_19.xlsx",
        "업무안내_2025년05월19일.xlsx",
        "절차매뉴얼_2025-05-19.xlsx",
        "절차 가이드.xlsx"  # No date (should be "latest")
    ]
    
    for filename in test_filenames:
        # Extract date pattern from filename
        date_pattern = document_processor.re.search(r'_(\d{4}[.년\-_]\d{1,2}[.월\-_]\d{1,2})', filename)
        guide_version = date_pattern.group(1) if date_pattern else "latest"
        
        print(f"파일명: {filename}")
        print(f"감지된 버전: {guide_version}")
        print("---")

# Test version-specific document retrieval
def test_version_query():
    print("\n=== 버전 기반 문서 검색 테스트 ===")
    
    # Test queries with version references
    test_queries = [
        "IP 주소 신청 방법을 알려주세요",
        "2025년 5월 19일 업무 가이드에서 IP 주소 신청 방법을 알려주세요",
        "2025-05-19 가이드에 있는 LAN 공사 신청 절차는?",
        "2025.05.19 버전의 전화기 설정 방법은?"
    ]
    
    for query in test_queries:
        print(f"\n쿼리: '{query}'")
        
        # Check for version pattern in query
        version_pattern = chatbot.re.search(r'(\d{4}[.년\-_]\s?\d{1,2}[.월\-_]\s?\d{1,2})', query)
        guide_version = version_pattern.group(1) if version_pattern else "none"
        
        print(f"쿼리에서 감지된 버전: {guide_version}")
        print("---")

if __name__ == "__main__":
    # 파일명 기반 버전 감지 테스트
    test_version_detection()
    
    # 버전 기반 문서 검색 테스트 
    test_version_query()