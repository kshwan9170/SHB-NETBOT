/**
 * IndexedDB와 기존 오프라인 시스템 통합 모듈
 * 기존 localStorage 기반 시스템과 새로운 IndexedDB 시스템을 연결
 */

class IndexedDBIntegration {
    constructor() {
        this.isEnabled = true;
        this.fallbackToLocalStorage = true;
    }

    // IndexedDB에서 오프라인 데이터로 변환
    async convertToOfflineFormat() {
        try {
            if (!window.indexedDBSync || !window.indexedDBSync.isInitialized) {
                console.warn('IndexedDB 동기화가 아직 준비되지 않았습니다.');
                return null;
            }

            // IndexedDB에서 모든 CSV 데이터 가져오기
            const allRecords = await this.getAllCsvRecords();
            if (!allRecords || allRecords.length === 0) {
                console.log('IndexedDB에 저장된 CSV 데이터가 없습니다.');
                return null;
            }

            // 기존 오프라인 형식으로 변환
            const offlineData = [];
            const groupedByFile = this.groupRecordsByFile(allRecords);

            for (const [filename, records] of Object.entries(groupedByFile)) {
                const convertedRecords = this.convertRecordsToQA(filename, records);
                offlineData.push(...convertedRecords);
            }

            console.log(`IndexedDB에서 ${offlineData.length}개 질의응답 데이터 생성`);
            return offlineData;
        } catch (error) {
            console.error('IndexedDB 데이터 변환 오류:', error);
            return null;
        }
    }

    // IndexedDB에서 모든 CSV 레코드 가져오기
    async getAllCsvRecords() {
        return new Promise((resolve, reject) => {
            const transaction = window.indexedDBSync.db.transaction([window.indexedDBSync.storeName], 'readonly');
            const store = transaction.objectStore(window.indexedDBSync.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('IndexedDB 레코드 가져오기 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 파일별로 레코드 그룹화
    groupRecordsByFile(records) {
        const grouped = {};
        records.forEach(record => {
            if (!grouped[record.filename]) {
                grouped[record.filename] = [];
            }
            grouped[record.filename].push(record);
        });
        return grouped;
    }

    // CSV 레코드를 질의응답 형식으로 변환
    convertRecordsToQA(filename, records) {
        const qaData = [];
        const category = this.getCategoryFromFilename(filename);

        records.forEach((record, index) => {
            const data = record.data || {};
            
            // 파일 유형별 변환 로직
            if (category === '절차_안내') {
                qaData.push(...this.convertProcedureData(data, filename, index));
            } else if (category === 'IP_사용자_조회') {
                qaData.push(...this.convertIPUserData(data, filename, index));
            } else if (category === '대외계_연동') {
                qaData.push(...this.convertExternalSystemData(data, filename, index));
            } else if (category === '장애_문의') {
                qaData.push(...this.convertTroubleshootingData(data, filename, index));
            }
        });

        return qaData;
    }

    // 파일명에서 카테고리 추출
    getCategoryFromFilename(filename) {
        if (filename.includes('절차_안내')) return '절차_안내';
        if (filename.includes('IP_사용자_조회')) return 'IP_사용자_조회';
        if (filename.includes('대외계_연동')) return '대외계_연동';
        if (filename.includes('장애_문의')) return '장애_문의';
        return 'general';
    }

    // 절차 안내 데이터 변환
    convertProcedureData(data, filename, index) {
        const qaList = [];
        const category = data['질문 카테고리'] || '';
        const keyword = data['질문 키워드'] || '';
        const example = data['질문 예시'] || '';
        const summary = data['요약 응답'] || '';
        const detail = data['상세 안내'] || '';

        if (keyword && summary) {
            qaList.push({
                query: `${keyword} ${example}`.trim(),
                response: `${summary}\n\n${detail}`.trim(),
                category: category,
                source: filename,
                type: 'procedure'
            });
        }

        return qaList;
    }

    // IP 사용자 조회 데이터 변환
    convertIPUserData(data, filename, index) {
        const qaList = [];
        const ip = data['IP 주소'] || '';
        const user = data['사용자명'] || '';
        const dept = data['부서'] || '';
        const contact = data['연락처'] || '';
        const status = data['상태'] || '';

        if (ip) {
            qaList.push({
                query: `${ip} IP 주소 사용자 조회`,
                response: `IP 주소 ${ip}의 사용자 정보:\n- 사용자명: ${user}\n- 부서: ${dept}\n- 연락처: ${contact}\n- 상태: ${status}`,
                category: 'IP 조회',
                source: filename,
                type: 'ip_lookup'
            });
        }

        return qaList;
    }

    // 대외계 연동 데이터 변환
    convertExternalSystemData(data, filename, index) {
        const qaList = [];
        const institution = data['대외기관명'] || '';
        const service = data['서비스명'] || '';
        const opIP = data['IP(운영)'] || '';
        const devIP = data['IP(개발)'] || '';

        if (institution && service) {
            qaList.push({
                query: `${institution} ${service} 대외계 연동 정보`,
                response: `${institution} - ${service} 연동 정보:\n- 운영 IP: ${opIP}\n- 개발 IP: ${devIP}\n- 담당 부서: ${data['당행 부서'] || ''}\n- 담당자: ${data['당행 담당자'] || ''}`,
                category: '대외계 연동',
                source: filename,
                type: 'external_system'
            });
        }

        return qaList;
    }

    // 장애 문의 데이터 변환
    convertTroubleshootingData(data, filename, index) {
        const qaList = [];
        const category = data['질문 카테고리'] || '';
        const keyword = data['질문 키워드'] || '';
        const example = data['질문 예시'] || '';
        const summary = data['요약 응답'] || '';
        const detail = data['상세 안내'] || '';

        if (keyword && summary) {
            qaList.push({
                query: `${keyword} ${example}`.trim(),
                response: `${summary}\n\n${detail}`.trim(),
                category: category,
                source: filename,
                type: 'troubleshooting'
            });
        }

        return qaList;
    }

    // IndexedDB 데이터를 localStorage에 동기화
    async syncToLocalStorage() {
        try {
            const offlineData = await this.convertToOfflineFormat();
            if (offlineData && offlineData.length > 0) {
                localStorage.setItem('csvOfflineData', JSON.stringify(offlineData));
                localStorage.setItem('csvOfflineDataTimestamp', Date.now().toString());
                console.log(`IndexedDB 데이터를 localStorage에 동기화 완료: ${offlineData.length}개 항목`);
                return true;
            }
        } catch (error) {
            console.error('localStorage 동기화 오류:', error);
        }
        return false;
    }

    // 통합 초기화 함수
    async initialize() {
        try {
            // IndexedDB 초기화 대기
            if (window.indexedDBSync) {
                await window.indexedDBSync.initialize();
                
                // 동기화 완료 이벤트 리스너
                window.addEventListener('csvDataSynced', async () => {
                    console.log('IndexedDB 동기화 완료, localStorage 업데이트 중...');
                    await this.syncToLocalStorage();
                });

                // 초기 동기화
                setTimeout(async () => {
                    await this.syncToLocalStorage();
                }, 2000);
            }
        } catch (error) {
            console.error('IndexedDB 통합 초기화 오류:', error);
        }
    }
}

// 전역 인스턴스 생성
window.indexedDBIntegration = new IndexedDBIntegration();

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('IndexedDB 통합 모듈 초기화 중...');
    window.indexedDBIntegration.initialize();
});