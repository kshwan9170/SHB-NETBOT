/**
 * 통합 오프라인 시스템
 * IndexedDB를 사용하여 CSV 데이터를 안정적으로 동기화하고 오프라인 검색을 제공
 */

class UnifiedOfflineSystem {
    constructor() {
        this.dbName = 'SHBNetBot_Unified';
        this.dbVersion = 2;
        this.db = null;
        this.csvStoreName = 'csv_records';
        this.metaStoreName = 'sync_metadata';
        this.isInitialized = false;
        this.lastSyncTime = 0;
        this.syncInterval = 30000; // 30초마다 동기화 체크
    }

    // IndexedDB 초기화
    async initDB() {
        if (this.isInitialized && this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('통합 오프라인 시스템 - IndexedDB 열기 실패:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                console.log('통합 오프라인 시스템 - IndexedDB 초기화 완료');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 기존 스토어 삭제
                const existingStores = Array.from(db.objectStoreNames);
                existingStores.forEach(storeName => {
                    db.deleteObjectStore(storeName);
                });

                // CSV 레코드 스토어
                const csvStore = db.createObjectStore(this.csvStoreName, { keyPath: 'id' });
                csvStore.createIndex('filename', 'filename', { unique: false });
                csvStore.createIndex('category', 'category', { unique: false });
                csvStore.createIndex('searchText', 'searchText', { unique: false });

                // 동기화 메타데이터 스토어
                const metaStore = db.createObjectStore(this.metaStoreName, { keyPath: 'key' });

                console.log('통합 오프라인 시스템 - 스키마 업그레이드 완료');
            };
        });
    }

    // 서버에서 CSV 파일 목록 가져오기
    async fetchCsvFileList() {
        try {
            const response = await fetch('/api/documents', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`CSV 파일 목록 가져오기 실패: ${response.status}`);
            }

            const data = await response.json();
            const csvFiles = (data.files || []).filter(file => 
                file.filename.toLowerCase().endsWith('.csv') && 
                !file.filename.startsWith('test') &&
                file.size > 0
            );

            console.log(`서버에서 ${csvFiles.length}개 CSV 파일 발견:`, csvFiles.map(f => f.filename));
            return csvFiles;
        } catch (error) {
            console.error('CSV 파일 목록 가져오기 오류:', error);
            return [];
        }
    }

    // 단일 CSV 파일 내용 가져오기
    async fetchCsvContent(systemFilename) {
        try {
            const response = await fetch(`/api/documents/view/${encodeURIComponent(systemFilename)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`CSV 내용 가져오기 실패: ${response.status}`);
            }

            const data = await response.json();
            return data.content || '';
        } catch (error) {
            console.error(`CSV 파일 ${systemFilename} 내용 가져오기 오류:`, error);
            return null;
        }
    }

    // CSV 내용을 구조화된 레코드로 파싱
    parseCsvToRecords(content, filename) {
        try {
            const lines = content.trim().split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                console.warn(`CSV 파일 ${filename}이 비어있거나 헤더만 있습니다.`);
                return [];
            }

            // CSV 파싱 (간단한 구현)
            const headers = this.parseCsvLine(lines[0]);
            const records = [];
            const category = this.extractCategoryFromFilename(filename);

            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCsvLine(lines[i]);
                
                if (values.length === 0) continue; // 빈 행 스킵

                const record = {
                    id: `${filename}_row_${i}`,
                    filename: filename,
                    category: category,
                    rowIndex: i,
                    timestamp: Date.now(),
                    data: {},
                    searchText: ''
                };

                // 헤더와 값 매핑
                headers.forEach((header, index) => {
                    const value = values[index] || '';
                    record.data[header.trim()] = value.trim();
                });

                // 검색 가능한 텍스트 생성
                record.searchText = Object.values(record.data).join(' ').toLowerCase();
                
                // 질의응답 형식으로 변환
                const qaData = this.convertToQAFormat(record.data, category);
                if (qaData.query && qaData.response) {
                    record.query = qaData.query;
                    record.response = qaData.response;
                    record.searchText += ' ' + qaData.query.toLowerCase() + ' ' + qaData.response.toLowerCase();
                }

                records.push(record);
            }

            console.log(`CSV 파일 ${filename}: ${records.length}개 레코드 파싱 완료`);
            return records;
        } catch (error) {
            console.error(`CSV 파싱 오류 (${filename}):`, error);
            return [];
        }
    }

    // 간단한 CSV 라인 파싱
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"' && (i === 0 || line[i-1] === ',')) {
                inQuotes = true;
            } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === ',')) {
                inQuotes = false;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result.map(item => item.replace(/^"|"$/g, '')); // 따옴표 제거
    }

    // 파일명에서 카테고리 추출
    extractCategoryFromFilename(filename) {
        if (filename.includes('절차_안내') || filename.includes('procedure')) return '절차_안내';
        if (filename.includes('IP_사용자_조회') || filename.includes('ip_user')) return 'IP_사용자_조회';
        if (filename.includes('대외계_연동') || filename.includes('external')) return '대외계_연동';
        if (filename.includes('장애_문의') || filename.includes('troubleshooting')) return '장애_문의';
        return 'general';
    }

    // 데이터를 질의응답 형식으로 변환
    convertToQAFormat(data, category) {
        const result = { query: '', response: '' };

        try {
            switch (category) {
                case '절차_안내':
                    const keyword = data['질문 키워드'] || data['키워드'] || '';
                    const example = data['질문 예시'] || data['예시'] || '';
                    const summary = data['요약 응답'] || data['응답'] || '';
                    const detail = data['상세 안내'] || data['상세'] || '';
                    
                    if (keyword) {
                        result.query = `${keyword} ${example}`.trim();
                        result.response = summary + (detail ? '\n\n' + detail : '');
                    }
                    break;

                case 'IP_사용자_조회':
                    const ip = data['IP 주소'] || data['IP'] || '';
                    const user = data['사용자명'] || data['사용자'] || '';
                    const dept = data['부서'] || '';
                    const contact = data['연락처'] || '';
                    const status = data['상태'] || '';
                    const lastAccess = data['최종 접속일'] || '';
                    
                    if (ip) {
                        result.query = `${ip} IP 주소 사용자 조회`;
                        result.response = `${ip}는 ${dept} ${user}님이 사용 중입니다. 연락처는 ${contact}이며, 현재 상태는 ${status}입니다. 최종 접속일은 ${lastAccess}입니다.`;
                    }
                    break;

                case '대외계_연동':
                    const institution = data['대외기관명'] || data['기관명'] || '';
                    const service = data['서비스명'] || data['서비스'] || '';
                    const opIP = data['IP(운영)'] || data['운영IP'] || '';
                    const devIP = data['IP(개발)'] || data['개발IP'] || '';
                    
                    if (institution && service) {
                        result.query = `${institution} ${service} 대외계 연동`;
                        result.response = `${institution} - ${service} 연동 정보:\n- 운영 IP: ${opIP}\n- 개발 IP: ${devIP}`;
                    }
                    break;

                case '장애_문의':
                    const category_name = data['질문 카테고리'] || data['카테고리'] || '';
                    const issue_keyword = data['질문 키워드'] || data['키워드'] || '';
                    const issue_example = data['질문 예시'] || data['예시'] || '';
                    const issue_summary = data['요약 응답'] || data['응답'] || '';
                    
                    if (issue_keyword) {
                        result.query = `${issue_keyword} ${issue_example}`.trim();
                        result.response = issue_summary;
                    }
                    break;
            }
        } catch (error) {
            console.error('QA 형식 변환 오류:', error);
        }

        return result;
    }

    // IndexedDB에 레코드 저장 (강화된 버전)
    async saveRecords(records) {
        if (!this.db) await this.initDB();
        if (records.length === 0) return true;

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.csvStoreName], 'readwrite');
                const store = transaction.objectStore(this.csvStoreName);

                let completed = 0;
                let failed = 0;

                // 트랜잭션 완료 시
                transaction.oncomplete = () => {
                    console.log(`IndexedDB 트랜잭션 완료: ${completed}개 성공, ${failed}개 실패`);
                    resolve(completed > 0);
                };

                // 트랜잭션 오류 시
                transaction.onerror = () => {
                    console.error('IndexedDB 트랜잭션 오류:', transaction.error);
                    resolve(false);
                };

                // 각 레코드 저장
                records.forEach((record, index) => {
                    try {
                        const request = store.put(record);
                        
                        request.onsuccess = () => {
                            completed++;
                        };

                        request.onerror = () => {
                            failed++;
                            console.error(`레코드 ${index} 저장 실패:`, request.error);
                        };
                    } catch (error) {
                        failed++;
                        console.error(`레코드 ${index} 처리 오류:`, error);
                    }
                });

            } catch (error) {
                console.error('IndexedDB 저장 중 오류:', error);
                resolve(false);
            }
        });
    }

    // 파일의 기존 레코드 삭제
    async deleteFileRecords(filename) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.csvStoreName], 'readwrite');
            const store = transaction.objectStore(this.csvStoreName);
            const index = store.index('filename');
            const request = index.openCursor(IDBKeyRange.only(filename));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };

            request.onerror = () => {
                console.error('기존 레코드 삭제 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 전체 동기화 실행
    async performFullSync() {
        try {
            console.log('통합 오프라인 시스템 - 전체 동기화 시작');
            
            await this.initDB();
            const csvFiles = await this.fetchCsvFileList();
            
            if (csvFiles.length === 0) {
                console.log('동기화할 CSV 파일이 없습니다.');
                return { success: true, processed: 0, total: 0 };
            }

            let totalProcessed = 0;
            let totalRecords = 0;

            for (const fileInfo of csvFiles) {
                try {
                    console.log(`파일 동기화 중: ${fileInfo.filename}`);
                    
                    // 기존 레코드 삭제
                    await this.deleteFileRecords(fileInfo.filename);
                    
                    // 새 내용 가져오기
                    const content = await this.fetchCsvContent(fileInfo.system_filename);
                    if (!content) {
                        console.warn(`파일 내용 없음: ${fileInfo.filename}`);
                        continue;
                    }

                    // 레코드 파싱 및 저장
                    const records = this.parseCsvToRecords(content, fileInfo.filename);
                    if (records.length > 0) {
                        const saved = await this.saveRecords(records);
                        if (saved) {
                            totalProcessed++;
                            totalRecords += records.length;
                            console.log(`파일 동기화 완료: ${fileInfo.filename} (${records.length}개 레코드)`);
                        }
                    }
                } catch (error) {
                    console.error(`파일 동기화 실패: ${fileInfo.filename}`, error);
                }
            }

            // 동기화 메타데이터 업데이트
            await this.updateSyncMetadata(csvFiles);
            
            // localStorage에도 데이터 복사 (호환성)
            await this.syncToLocalStorage();

            console.log(`통합 오프라인 시스템 - 동기화 완료: ${totalProcessed}/${csvFiles.length}개 파일, 총 ${totalRecords}개 레코드`);
            return { success: true, processed: totalProcessed, total: csvFiles.length, records: totalRecords };

        } catch (error) {
            console.error('통합 오프라인 시스템 - 동기화 오류:', error);
            return { success: false, error: error.message };
        }
    }

    // 동기화 메타데이터 업데이트
    async updateSyncMetadata(csvFiles) {
        if (!this.db) return;

        const metadata = {
            key: 'sync_info',
            lastSync: Date.now(),
            fileCount: csvFiles.length,
            files: csvFiles.map(f => ({
                filename: f.filename,
                systemFilename: f.system_filename,
                size: f.size,
                uploadedAt: f.uploaded_at
            }))
        };

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put(metadata);
            
            request.onsuccess = () => {
                this.lastSyncTime = Date.now();
                resolve();
            };
            request.onerror = () => resolve(); // 실패해도 계속 진행
        });
    }

    // localStorage와 동기화 (기존 시스템 호환성)
    async syncToLocalStorage() {
        try {
            const allRecords = await this.getAllRecords();
            if (allRecords.length === 0) return;

            // 기존 오프라인 형식으로 변환
            const offlineData = allRecords.map(record => ({
                query: record.query || record.searchText,
                response: record.response || Object.values(record.data).join(' '),
                category: record.category,
                source: record.filename,
                metadata: record.data
            })).filter(item => item.query && item.response);

            if (offlineData.length > 0) {
                localStorage.setItem('csvOfflineData', JSON.stringify(offlineData));
                localStorage.setItem('csvOfflineDataTimestamp', Date.now().toString());
                console.log(`localStorage 동기화 완료: ${offlineData.length}개 항목`);
            }
        } catch (error) {
            console.error('localStorage 동기화 오류:', error);
        }
    }

    // 모든 레코드 가져오기
    async getAllRecords() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.csvStoreName], 'readonly');
            const store = transaction.objectStore(this.csvStoreName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('모든 레코드 가져오기 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 오프라인 검색
    async searchOffline(query, limit = 5) {
        try {
            const allRecords = await this.getAllRecords();
            if (allRecords.length === 0) {
                console.log('검색할 오프라인 데이터가 없습니다.');
                return [];
            }

            const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
            const results = [];

            // IP 주소 패턴 확인
            const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
            const hasIP = ipPattern.test(query);

            for (const record of allRecords) {
                let score = 0;
                const searchText = record.searchText.toLowerCase();
                const recordQuery = (record.query || '').toLowerCase();
                const recordResponse = (record.response || '').toLowerCase();

                // IP 주소 정확 매칭 (최고 우선순위)
                if (hasIP) {
                    const queryIP = query.match(ipPattern)?.[0];
                    if (queryIP && (searchText.includes(queryIP) || recordQuery.includes(queryIP))) {
                        score += 100;
                    }
                }

                // 키워드 매칭
                searchTerms.forEach(term => {
                    if (recordQuery.includes(term)) score += 10; // 질문에서 매칭 시 높은 점수
                    else if (searchText.includes(term)) score += 3;
                    else if (recordResponse.includes(term)) score += 2;
                    
                    // 정확한 단어 매칭
                    if (recordQuery.split(/\s+/).includes(term)) score += 5;
                });

                // 전체 쿼리 포함 여부
                if (recordQuery.includes(query.toLowerCase())) score += 20;
                if (searchText.includes(query.toLowerCase())) score += 10;

                if (score > 0) {
                    results.push({ ...record, score });
                }
            }

            // 점수순 정렬 및 상위 결과 반환
            results.sort((a, b) => b.score - a.score);
            const topResults = results.slice(0, limit);

            console.log(`오프라인 검색 완료: "${query}" -> ${topResults.length}개 결과`);
            return topResults;
        } catch (error) {
            console.error('오프라인 검색 오류:', error);
            return [];
        }
    }

    // 통계 정보
    async getStats() {
        try {
            if (!this.db) await this.initDB();

            const allRecords = await this.getAllRecords();
            const categories = {};
            
            allRecords.forEach(record => {
                categories[record.category] = (categories[record.category] || 0) + 1;
            });

            return {
                totalRecords: allRecords.length,
                categories: categories,
                lastSync: this.lastSyncTime,
                isOnline: navigator.onLine
            };
        } catch (error) {
            console.error('통계 정보 가져오기 오류:', error);
            return {
                totalRecords: 0,
                categories: {},
                lastSync: 0,
                isOnline: navigator.onLine
            };
        }
    }

    // 시스템 초기화
    async initialize() {
        try {
            console.log('통합 오프라인 시스템 초기화 시작');
            
            await this.initDB();
            
            // 백그라운드에서 동기화 실행
            setTimeout(async () => {
                const result = await this.performFullSync();
                if (result.success) {
                    console.log(`백그라운드 동기화 완료: ${result.records}개 레코드 동기화됨`);
                    
                    // 동기화 완료 이벤트 발생
                    window.dispatchEvent(new CustomEvent('offlineDataSynced', {
                        detail: result
                    }));
                }
            }, 1000);

            // 주기적 동기화 설정
            setInterval(async () => {
                if (navigator.onLine) {
                    await this.performFullSync();
                }
            }, this.syncInterval);

            console.log('통합 오프라인 시스템 초기화 완료');
            return true;
        } catch (error) {
            console.error('통합 오프라인 시스템 초기화 실패:', error);
            return false;
        }
    }

    // 수동 동기화
    async manualSync() {
        console.log('수동 동기화 시작');
        const result = await this.performFullSync();
        
        if (result.success) {
            const message = `동기화 완료: ${result.records}개 레코드 업데이트됨`;
            console.log(message);
            return { success: true, message };
        } else {
            const message = '동기화 실패: ' + (result.error || '알 수 없는 오류');
            console.error(message);
            return { success: false, message };
        }
    }
}

// 전역 인스턴스 생성
window.unifiedOfflineSystem = new UnifiedOfflineSystem();

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('통합 오프라인 시스템 자동 시작');
    window.unifiedOfflineSystem.initialize();
});

// 동기화 완료 이벤트 리스너
window.addEventListener('offlineDataSynced', function(event) {
    console.log('오프라인 데이터 동기화 완료:', event.detail);
});

// 네트워크 상태 변경 시 동기화
window.addEventListener('online', function() {
    console.log('온라인 상태로 변경됨 - 동기화 시작');
    setTimeout(() => {
        window.unifiedOfflineSystem.performFullSync();
    }, 2000);
});