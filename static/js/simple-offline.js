/**
 * SHB-NetBot 간소화된 오프라인 모드 지원
 * 기본 샘플 데이터를 localStorage에 저장하여 오프라인 모드에서 사용
 */

// 전역 네임스페이스로 노출
window.offlineHelper = {
    // 저장소 키
    STORAGE_KEY: 'shb_netbot_offline_data',
    
    // 샘플 데이터 생성
    createSampleData: function() {
        return [
            {
                query: "192.168.0.1 정보 알려줘",
                response: "IP 192.168.0.1은 네트워크관리팀의 김철수 담당자가 사용 중입니다. 연락처는 02-123-4567입니다."
            },
            {
                query: "대외계 연동 방법",
                response: "대외계 연동을 위해서는 VPN 접속이 필요합니다. 금융결제원 시스템은 10.10.20.5, 신한금융지주 시스템은 10.10.30.8로 연결하세요."
            },
            {
                query: "네트워크 연결 오류",
                response: "네트워크 연결 오류의 증상은 \"인터넷 연결이 끊어지거나 불안정함\"입니다. 조치 방법은 다음과 같습니다:\n1. 네트워크 케이블 연결 확인\n2. 공유기 재시작\n3. IP 설정 확인"
            },
            {
                query: "서버 접속 불가",
                response: "서버 접속 불가의 증상은 \"특정 서버에 연결할 수 없음\"입니다. 조치 방법은 다음과 같습니다:\n1. 서버 IP 주소 확인\n2. 방화벽 설정 확인\n3. VPN 연결 상태 확인"
            },
            {
                query: "금융결제원 시스템",
                response: "금융결제원 시스템(10.10.20.5)에 접속하려면 VPN 연결 후 전용 클라이언트 사용이(가) 필요합니다."
            },
            {
                query: "신한금융지주 시스템",
                response: "신한금융지주 시스템(10.10.30.8)에 접속하려면 전용 VPN 연결이(가) 필요합니다."
            }
        ];
    },
    
    // 데이터 초기화
    initialize: function() {
        // 이미 데이터가 있는지 확인
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            // 샘플 데이터 저장
            const sampleData = this.createSampleData();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sampleData));
            console.log('오프라인 모드 샘플 데이터 초기화 완료');
        } else {
            console.log('이미 오프라인 데이터가 존재합니다.');
        }
    },
    
    // 유사도 기반 검색
    search: function(query) {
        // 저장된 데이터 가져오기
        const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        
        if (data.length === 0) {
            return null;
        }
        
        // 정규화된 쿼리
        const normalizedQuery = query.toLowerCase().trim();
        
        // IP 주소가 포함된 경우 IP 주소 검색
        const ipMatch = normalizedQuery.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
        if (ipMatch) {
            // IP 주소 패턴에 정확히 일치하는 항목이 있는지 확인
            const ipResults = data.filter(item => 
                item.query.toLowerCase().includes(ipMatch[0]) || 
                item.response.toLowerCase().includes(ipMatch[0])
            );
            
            if (ipResults.length > 0) {
                return this.formatOfflineResponse(ipResults[0].response);
            }
        }
        
        // 쿼리 단어 추출
        const queryWords = normalizedQuery.split(/[\s,.?!]+/).filter(word => word.length >= 2);
        
        // 각 항목에 대한 점수 계산
        const scoredResults = data.map(item => {
            const itemQuery = item.query.toLowerCase();
            const itemResponse = item.response.toLowerCase();
            let score = 0;
            
            // 전체 쿼리가 포함된 경우 높은 점수
            if (itemQuery.includes(normalizedQuery)) score += 5;
            if (itemResponse.includes(normalizedQuery)) score += 3;
            
            // 개별 단어 매칭
            for (const word of queryWords) {
                if (itemQuery.includes(word)) score += 2;
                if (itemResponse.includes(word)) score += 1;
            }
            
            return { item, score };
        });
        
        // 점수에 따라 정렬
        scoredResults.sort((a, b) => b.score - a.score);
        
        // 가장 높은 점수의 결과 반환 (최소 점수 임계값 적용)
        if (scoredResults.length > 0 && scoredResults[0].score >= 2) {
            return this.formatOfflineResponse(scoredResults[0].item.response);
        }
        
        // 적절한 결과가 없으면 null 반환
        return null;
    },
    
    // 오프라인 응답 포맷
    formatOfflineResponse: function(response) {
        return "[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다]\n\n" + response;
    },
    
    // 온라인 응답 저장
    saveResponse: function(query, response) {
        try {
            // 기존 데이터 가져오기
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            
            // 중복 제거 (동일한 쿼리가 있으면 제거)
            const filteredData = data.filter(item => item.query.toLowerCase() !== query.toLowerCase());
            
            // 새 데이터 추가
            filteredData.push({ query, response });
            
            // 데이터 저장 (최대 100개 항목으로 제한)
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredData.slice(-100)));
            
            console.log('응답이 오프라인 캐시에 저장되었습니다.');
            return true;
        } catch (error) {
            console.error('응답 저장 중 오류:', error);
            return false;
        }
    }
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    window.offlineHelper.initialize();
});