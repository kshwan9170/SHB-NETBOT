/**
 * 오프라인 저장소 관리 모듈
 * IndexedDB를 사용하여 CSV 데이터를 저장하고 검색합니다.
 */

const OfflineStorage = {
    // IndexedDB 데이터베이스 이름과 버전
    DB_NAME: 'shb-netbot-local-storage',
    DB_VERSION: 1,
    STORE_NAME: 'csv-data',
    
    /**
     * IndexedDB 데이터베이스 초기화
     * @returns {Promise<IDBDatabase>} 초기화된 데이터베이스 인스턴스
     */
    initDB: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = (event) => {
                console.error('IndexedDB 열기 실패:', event.target.error);
                reject(event.target.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 기존 스토어가 있으면 삭제
                if (db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.deleteObjectStore(this.STORE_NAME);
                }
                
                // 오브젝트 스토어 생성 (키는 자동 생성)
                const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                
                // 검색에 사용할 인덱스 생성
                store.createIndex('ip', 'metadata.ip', { unique: false });
                store.createIndex('user', 'metadata.user', { unique: false });
                store.createIndex('department', 'metadata.department', { unique: false });
                store.createIndex('source', 'metadata.source', { unique: false });
                
                console.log('IndexedDB 스토어 및 인덱스 생성 완료');
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                console.log('IndexedDB 연결 성공');
                resolve(db);
            };
        });
    },
    
    /**
     * 데이터 저장
     * @param {Array} data - 저장할 데이터 배열 (각 항목은 {text, metadata} 형식)
     * @returns {Promise<boolean>} 저장 성공 여부
     */
    saveData: async function(data) {
        try {
            const db = await this.initDB();
            const transaction = db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            // 기존 데이터 모두 삭제 (새로 저장을 위해)
            store.clear();
            
            // 새 데이터 저장
            let savedCount = 0;
            for (const item of data) {
                const request = store.add(item);
                request.onsuccess = () => {
                    savedCount++;
                };
                request.onerror = (e) => {
                    console.error('데이터 저장 중 오류:', e.target.error);
                };
            }
            
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`총 ${savedCount}개 항목 저장 완료`);
                    db.close();
                    resolve(true);
                };
                
                transaction.onerror = (event) => {
                    console.error('저장 트랜잭션 실패:', event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('데이터 저장 실패:', error);
            return false;
        }
    },
    
    /**
     * 검색어와 관련된 데이터 검색
     * @param {string} query - 검색 쿼리
     * @returns {Promise<Array>} 검색 결과 배열
     */
    searchData: async function(query) {
        try {
            const db = await this.initDB();
            
            // IP 주소 형식 확인
            const ipMatch = query.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
            const ipAddress = ipMatch ? ipMatch[0] : null;
            
            // 키워드 추출 (2글자 이상 단어)
            const keywords = query.split(/[\s,.?!]+/)
                                 .filter(word => word.length >= 2);
            
            const results = [];
            const processed = new Set(); // 중복 방지
            
            if (ipAddress) {
                // IP 주소로 먼저 검색
                const ipResults = await this.searchByIp(db, ipAddress);
                ipResults.forEach(item => {
                    if (!processed.has(item.id)) {
                        results.push(item);
                        processed.add(item.id);
                    }
                });
            }
            
            // 키워드로 검색
            const keywordResults = await this.searchByKeywords(db, keywords);
            keywordResults.forEach(item => {
                if (!processed.has(item.id)) {
                    results.push(item);
                    processed.add(item.id);
                }
            });
            
            db.close();
            return results;
        } catch (error) {
            console.error('데이터 검색 실패:', error);
            return [];
        }
    },
    
    /**
     * IP 주소로 검색
     * @param {IDBDatabase} db - 데이터베이스 인스턴스
     * @param {string} ip - 검색할 IP 주소
     * @returns {Promise<Array>} 검색 결과 배열
     */
    searchByIp: function(db, ip) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const index = store.index('ip');
            
            const request = index.getAll(ip);
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('IP 검색 실패:', event.target.error);
                reject(event.target.error);
            };
        });
    },
    
    /**
     * 키워드로 검색
     * @param {IDBDatabase} db - 데이터베이스 인스턴스
     * @param {Array} keywords - 검색할 키워드 배열
     * @returns {Promise<Array>} 검색 결과 배열
     */
    searchByKeywords: function(db, keywords) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                const allData = event.target.result;
                
                // 키워드 기반 필터링 및 관련성 점수 계산
                const results = allData.filter(item => {
                    // 각 키워드에 대해 텍스트와 메타데이터에서 검색
                    return keywords.some(keyword => {
                        const text = item.text.toLowerCase();
                        const userMatched = item.metadata.user && 
                                          item.metadata.user.toLowerCase().includes(keyword.toLowerCase());
                        const departmentMatched = item.metadata.department && 
                                               item.metadata.department.toLowerCase().includes(keyword.toLowerCase());
                        
                        return text.includes(keyword.toLowerCase()) || 
                               userMatched || departmentMatched;
                    });
                });
                
                // 관련성에 따라 정렬 (매칭된 키워드 수에 따라)
                results.sort((a, b) => {
                    const scoreA = this.calculateRelevanceScore(a, keywords);
                    const scoreB = this.calculateRelevanceScore(b, keywords);
                    return scoreB - scoreA; // 점수 높은 순
                });
                
                resolve(results);
            };
            
            request.onerror = (event) => {
                console.error('키워드 검색 실패:', event.target.error);
                reject(event.target.error);
            };
        });
    },
    
    /**
     * 관련성 점수 계산
     * @param {Object} item - 데이터 항목
     * @param {Array} keywords - 검색 키워드 배열
     * @returns {number} 관련성 점수
     */
    calculateRelevanceScore: function(item, keywords) {
        let score = 0;
        const text = item.text.toLowerCase();
        
        keywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            
            // 텍스트 내 키워드 매칭
            if (text.includes(keywordLower)) {
                score += 1;
            }
            
            // 메타데이터 내 키워드 매칭 (더 높은 가중치)
            if (item.metadata.user && 
                item.metadata.user.toLowerCase().includes(keywordLower)) {
                score += 2;
            }
            
            if (item.metadata.department && 
                item.metadata.department.toLowerCase().includes(keywordLower)) {
                score += 1.5;
            }
            
            // 정확히 일치하는 경우 추가 점수
            if (item.metadata.ip === keyword) {
                score += 3;
            }
        });
        
        return score;
    },
    
    /**
     * 모든 저장된 데이터 가져오기
     * @returns {Promise<Array>} 저장된 데이터 배열
     */
    getAllData: async function() {
        try {
            const db = await this.initDB();
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const result = event.target.result;
                    db.close();
                    resolve(result);
                };
                
                request.onerror = (event) => {
                    console.error('전체 데이터 조회 실패:', event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('전체 데이터 조회 실패:', error);
            return [];
        }
    },
    
    /**
     * 저장된 데이터 수 확인
     * @returns {Promise<number>} 저장된 항목 수
     */
    getCount: async function() {
        try {
            const db = await this.initDB();
            const transaction = db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            
            return new Promise((resolve, reject) => {
                const request = store.count();
                
                request.onsuccess = (event) => {
                    const count = event.target.result;
                    db.close();
                    resolve(count);
                };
                
                request.onerror = (event) => {
                    console.error('데이터 수 조회 실패:', event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('데이터 수 조회 실패:', error);
            return 0;
        }
    },
    
    /**
     * 데이터베이스 리셋 (모든 데이터 삭제)
     * @returns {Promise<boolean>} 성공 여부
     */
    resetDatabase: async function() {
        try {
            const db = await this.initDB();
            const transaction = db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            return new Promise((resolve, reject) => {
                const request = store.clear();
                
                request.onsuccess = () => {
                    console.log('데이터베이스 초기화 완료');
                    db.close();
                    resolve(true);
                };
                
                request.onerror = (event) => {
                    console.error('데이터베이스 초기화 실패:', event.target.error);
                    db.close();
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('데이터베이스 초기화 실패:', error);
            return false;
        }
    }
};

// 글로벌 객체에 등록
window.OfflineStorage = OfflineStorage;