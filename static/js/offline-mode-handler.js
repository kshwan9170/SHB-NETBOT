/**
 * 오프라인 모드 핸들러
 * 인터넷 연결이 끊겼을 때 로컬에 저장된 데이터를 이용하여 응답합니다.
 */

// 전역 네임스페이스
window.offlineModeHandler = (function() {
    // 오프라인 모드 메시지 헤더
    const OFFLINE_HEADER = "[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다]\n\n";
    
    // 저장된 데이터 없음 메시지
    const NO_DATA_MESSAGE = "현재 오프라인 상태입니다. 저장된 메뉴얼 데이터만으로 응답할 수 있습니다.";
    
    // 검색 결과 없음 메시지
    const NO_RESULT_MESSAGE = "요청하신 정보에 대한 답변을 찾지 못했습니다. 서버 연결이 복구된 후 다시 시도해 주세요.";
    
    /**
     * 쿼리에 대한 오프라인 응답 생성
     * @param {string} query - 사용자 질문
     * @returns {Promise<string>} 응답 메시지
     */
    async function getOfflineResponse(query) {
        try {
            // 질문이 비어있는 경우
            if (!query || query.trim() === '') {
                return OFFLINE_HEADER + NO_DATA_MESSAGE;
            }
            
            // 오프라인 저장소가 초기화되어 있는지 확인
            if (!window.offlineStorage || typeof window.offlineStorage.searchSimilarText !== 'function') {
                console.error('오프라인 저장소가 초기화되지 않았습니다.');
                return OFFLINE_HEADER + NO_DATA_MESSAGE;
            }
            
            // IP 주소 쿼리인지 확인
            const ipRegex = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
            const ipMatch = query.match(ipRegex);
            
            // 키워드 추출
            const keywords = query.split(/[\s,.?!]+/).filter(word => word.length >= 2);
            
            let results;
            
            // IP 주소로 검색 시도
            if (ipMatch) {
                console.log('IP 주소 검색:', ipMatch[0]);
                results = await window.offlineStorage.searchByIp(ipMatch[0]);
                
                // IP 검색 결과가 없으면 유사도 검색으로 폴백
                if (!results || results.length === 0) {
                    results = await window.offlineStorage.searchSimilarText(query, keywords);
                }
            } else {
                // 키워드 기반 유사도 검색
                results = await window.offlineStorage.searchSimilarText(query, keywords);
            }
            
            // 결과 처리
            if (results && results.length > 0) {
                // 가장 유사한 결과 하나만 사용
                const bestMatch = results[0];
                
                // 유사도가 너무 낮으면 일반 안내 메시지 표시
                if (bestMatch.similarity < 0.15) {
                    return OFFLINE_HEADER + NO_RESULT_MESSAGE;
                }
                
                // 응답 구성
                let response = OFFLINE_HEADER;
                
                // 메타데이터에 question이 있으면 표시
                if (bestMatch.metadata && bestMatch.metadata.question) {
                    response += `"${bestMatch.metadata.question}"에 대한 답변:\n\n`;
                }
                
                // 텍스트 표시
                response += bestMatch.text;
                
                // 출처 표시
                if (bestMatch.metadata && bestMatch.metadata.source) {
                    response += `\n\n출처: ${bestMatch.metadata.source}`;
                }
                
                return response;
            } else {
                return OFFLINE_HEADER + NO_RESULT_MESSAGE;
            }
        } catch (error) {
            console.error('오프라인 응답 생성 중 오류:', error);
            return OFFLINE_HEADER + NO_DATA_MESSAGE;
        }
    }
    
    /**
     * 오프라인 모드 상태 확인
     * @returns {boolean} 오프라인 모드 여부
     */
    function isOfflineMode() {
        // 브라우저 온라인 상태 확인
        const browserOnline = navigator.onLine;
        
        // 강제 오프라인 모드 확인 (테스트용)
        const forceOffline = document.body.classList.contains('offline-mode');
        
        return !browserOnline || forceOffline;
    }
    
    /**
     * IndexedDB 데이터 초기화 상태 확인
     * @returns {Promise<boolean>} 초기화 여부
     */
    async function isDataInitialized() {
        try {
            if (!window.offlineStorage || typeof window.offlineStorage.getDataCount !== 'function') {
                return false;
            }
            
            const count = await window.offlineStorage.getDataCount();
            return count > 0;
        } catch (error) {
            console.error('데이터 초기화 상태 확인 중 오류:', error);
            return false;
        }
    }
    
    /**
     * 초기화 필요 시 샘플 데이터 추가
     * @returns {Promise<void>}
     */
    async function initializeIfNeeded() {
        try {
            const initialized = await isDataInitialized();
            
            if (!initialized && window.offlineDataInitializer && 
                typeof window.offlineDataInitializer.initialize === 'function') {
                await window.offlineDataInitializer.initialize();
                console.log('오프라인 모드 데이터 초기화 완료');
            }
        } catch (error) {
            console.error('오프라인 모드 초기화 중 오류:', error);
        }
    }
    
    // 페이지 로드 시 초기화
    document.addEventListener('DOMContentLoaded', async function() {
        // IndexedDB가 초기화된 후 데이터 초기화 확인
        setTimeout(async function() {
            await initializeIfNeeded();
        }, 1500);
    });
    
    // 공개 API
    return {
        getResponse: getOfflineResponse,
        isOffline: isOfflineMode,
        initialize: initializeIfNeeded
    };
})();