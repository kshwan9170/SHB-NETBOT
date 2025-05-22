/**
 * IP 주소 검색 결과를 자연어 문장으로 변환하는 유틸리티
 * 
 * 오프라인 모드에서 IP 주소 검색 시 "A: ~, B: ~" 형식이 아닌
 * 자연스러운 한국어 문장으로 응답을 변환합니다.
 */

// 즉시 실행 함수로 래핑하여 전역 스코프 오염 방지
(function() {
    // IP 주소 응답 변환 함수를 로컬 스토리지 객체에 연결
    const originalGetLocalResponse = window.getLocalResponse;
    
    if (typeof originalGetLocalResponse === 'function') {
        // 기존 함수를 오버라이드
        window.getLocalResponse = function(query) {
            const originalResponse = originalGetLocalResponse(query);
            
            if (originalResponse && query.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)) {
                return formatIPResponse(query, originalResponse);
            }
            
            return originalResponse;
        };
    }
    
    // IP 응답 변환 헬퍼 함수
    function formatIPResponse(query, response) {
        // 기본 응답은 원본 유지
        let formattedResponse = response;
        
        // IP 주소 추출
        const ipMatch = query.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        const ipAddress = ipMatch ? ipMatch[0] : '';
        
        console.log('IP 주소 응답 변환 시작:', response);
        
        // 레이블-값 형식 추출 (A: 값, B: 값 또는 사용자: 값, 부서: 값 등)
        const extractedData = {};
        
        // 알파벳 단일문자 레이블 추출 (A:, B:, C: 등)
        const alphaPattern = /([A-G])\s*:\s*([^.,;]+)/g;
        let match;
        
        while ((match = alphaPattern.exec(response)) !== null) {
            const key = match[1];
            const value = match[2].trim();
            extractedData[key] = value;
            console.log(`알파벳 패턴 매칭: ${key} => ${value}`);
        }
        
        // 추출된 데이터를 기반으로 자연어 문장 생성
        if (Object.keys(extractedData).length > 0) {
            // 필드 매핑
            const user = extractedData['A'] || '';
            const dept = extractedData['B'] || '';
            const contact = extractedData['C'] || '';
            const status = extractedData['D'] || '사용 중';
            const date = extractedData['E'] || '';
            const note = extractedData['F'] || '';
            const updated = extractedData['G'] || '';
            
            // 기본 문장 구성
            let naturalResponse = '';
            
            if (dept && user) {
                if (status === '사용 중' || status === '정상') {
                    naturalResponse = `IP ${ipAddress}는 ${dept}의 ${user} 담당자가 사용 중입니다.`;
                } else {
                    naturalResponse = `IP ${ipAddress}는 ${dept}의 ${user} 담당자가 ${status} 상태입니다.`;
                }
            } else if (user) {
                if (status === '사용 중' || status === '정상') {
                    naturalResponse = `IP ${ipAddress}는 ${user} 담당자가 사용 중입니다.`;
                } else {
                    naturalResponse = `IP ${ipAddress}는 ${user} 담당자가 ${status} 상태입니다.`;
                }
            } else {
                naturalResponse = `IP ${ipAddress}에 대한 정보입니다.`;
            }
            
            // 추가 정보
            if (contact) {
                naturalResponse += ` 연락처는 ${contact}입니다.`;
            }
            
            if (date) {
                naturalResponse += ` 최근 접속일은 ${date}입니다.`;
            }
            
            if (note) {
                if (note.includes('차단') || note.includes('만료') || note.includes('경고')) {
                    naturalResponse += ` 주의: ${note}`;
                } else {
                    naturalResponse += ` 참고사항: ${note}`;
                }
            }
            
            if (updated && !naturalResponse.includes(updated)) {
                naturalResponse += ` (${updated} 기준)`;
            }
            
            formattedResponse = naturalResponse;
            console.log('변환된 IP 응답:', formattedResponse);
        }
        
        return formattedResponse;
    }
    
    // 디버깅용 로그
    console.log('IP 주소 응답 포맷터가 로드되었습니다.');
})();