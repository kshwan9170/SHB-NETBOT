/**
 * IndexedDB 자동 동기화 모듈
 * 웹 페이지 로드 시 서버의 CSV 데이터를 IndexedDB와 자동 동기화
 */

class IndexedDBSync {
    constructor() {
        this.dbName = 'SHBNetBotDB';
        this.dbVersion = 1;
        this.db = null;
        this.storeName = 'csvData';
        this.metaStoreName = 'metadata';
        this.isInitialized = false;
    }

    // IndexedDB 초기화
    async initDB() {
        if (this.isInitialized) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB 열기 실패:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                console.log('IndexedDB 초기화 완료');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // CSV 데이터 저장소
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const csvStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    csvStore.createIndex('filename', 'filename', { unique: false });
                    csvStore.createIndex('category', 'category', { unique: false });
                    csvStore.createIndex('lastModified', 'lastModified', { unique: false });
                }

                // 메타데이터 저장소 (버전 관리용)
                if (!db.objectStoreNames.contains(this.metaStoreName)) {
                    const metaStore = db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
                }

                console.log('IndexedDB 스키마 업그레이드 완료');
            };
        });
    }

    // 서버에서 CSV 메타데이터 가져오기
    async fetchServerMetadata() {
        try {
            const response = await fetch('/api/documents', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`메타데이터 가져오기 실패: ${response.status}`);
            }

            const data = await response.json();
            const csvFiles = data.files?.filter(file => 
                file.filename.toLowerCase().endsWith('.csv') && 
                !file.filename.startsWith('test') &&
                file.size > 0
            ) || [];

            return csvFiles.map(file => ({
                filename: file.filename,
                systemFilename: file.system_filename,
                lastModified: file.uploaded_at,
                size: file.size
            }));
        } catch (error) {
            console.error('서버 메타데이터 가져오기 오류:', error);
            return [];
        }
    }

    // 로컬 메타데이터 가져오기
    async getLocalMetadata() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.metaStoreName], 'readonly');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.get('csvMetadata');

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : {});
            };

            request.onerror = () => {
                console.error('로컬 메타데이터 가져오기 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 로컬 메타데이터 저장
    async saveLocalMetadata(metadata) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.metaStoreName], 'readwrite');
            const store = transaction.objectStore(this.metaStoreName);
            const request = store.put({
                key: 'csvMetadata',
                data: metadata,
                lastSync: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('로컬 메타데이터 저장 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 변경된 파일 감지
    async detectChanges() {
        const [serverFiles, localMetadata] = await Promise.all([
            this.fetchServerMetadata(),
            this.getLocalMetadata()
        ]);

        const changedFiles = [];
        const newFiles = [];

        for (const serverFile of serverFiles) {
            const localFile = localMetadata[serverFile.filename];
            
            if (!localFile) {
                // 새 파일
                newFiles.push(serverFile);
            } else if (localFile.lastModified !== serverFile.lastModified || 
                      localFile.size !== serverFile.size) {
                // 변경된 파일
                changedFiles.push(serverFile);
            }
        }

        console.log(`변경 감지 완료: 새 파일 ${newFiles.length}개, 변경된 파일 ${changedFiles.length}개`);
        return { newFiles, changedFiles, allFiles: [...newFiles, ...changedFiles] };
    }

    // CSV 파일 내용 가져오기
    async fetchCSVContent(systemFilename) {
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
            console.error(`CSV 파일 ${systemFilename} 가져오기 오류:`, error);
            return null;
        }
    }

    // CSV 데이터를 구조화된 레코드로 변환
    parseCSVToRecords(content, filename) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const records = [];

        // 파일명에서 카테고리 추출
        const category = filename.split('(')[1]?.split(')')[0] || 'general';

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const record = {
                id: `${filename}_${i}`,
                filename: filename,
                category: category,
                rowIndex: i,
                lastModified: Date.now(),
                data: {}
            };

            // 헤더와 값 매핑
            headers.forEach((header, index) => {
                record.data[header] = values[index] || '';
            });

            // 검색 가능한 텍스트 생성
            record.searchText = Object.values(record.data).join(' ').toLowerCase();

            records.push(record);
        }

        return records;
    }

    // CSV 레코드를 IndexedDB에 저장
    async saveCsvRecords(records) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            let completed = 0;
            const total = records.length;

            if (total === 0) {
                resolve();
                return;
            }

            records.forEach(record => {
                const request = store.put(record);
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                };

                request.onerror = () => {
                    console.error('레코드 저장 실패:', request.error);
                    reject(request.error);
                };
            });
        });
    }

    // 파일의 기존 레코드 삭제
    async deleteFileRecords(filename) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
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

    // 단일 파일 동기화
    async syncFile(fileInfo) {
        try {
            console.log(`파일 동기화 시작: ${fileInfo.filename}`);
            
            // CSV 내용 가져오기
            const content = await this.fetchCSVContent(fileInfo.systemFilename);
            if (!content) {
                console.warn(`파일 내용을 가져올 수 없음: ${fileInfo.filename}`);
                return false;
            }

            // 기존 레코드 삭제
            await this.deleteFileRecords(fileInfo.filename);

            // 새 레코드 생성 및 저장
            const records = this.parseCSVToRecords(content, fileInfo.filename);
            await this.saveCsvRecords(records);

            console.log(`파일 동기화 완료: ${fileInfo.filename} (${records.length}개 레코드)`);
            return true;
        } catch (error) {
            console.error(`파일 동기화 실패: ${fileInfo.filename}`, error);
            return false;
        }
    }

    // 전체 동기화 실행
    async performSync() {
        try {
            console.log('CSV 데이터 동기화 시작...');
            
            await this.initDB();
            const changes = await this.detectChanges();
            
            if (changes.allFiles.length === 0) {
                console.log('동기화할 변경사항이 없습니다.');
                return { success: true, processed: 0 };
            }

            console.log(`${changes.allFiles.length}개 파일 동기화 진행중...`);
            
            let successCount = 0;
            for (const fileInfo of changes.allFiles) {
                const success = await this.syncFile(fileInfo);
                if (success) successCount++;
            }

            // 메타데이터 업데이트
            const serverFiles = await this.fetchServerMetadata();
            const newMetadata = {};
            serverFiles.forEach(file => {
                newMetadata[file.filename] = {
                    lastModified: file.lastModified,
                    size: file.size,
                    systemFilename: file.systemFilename
                };
            });
            
            await this.saveLocalMetadata(newMetadata);

            console.log(`동기화 완료: ${successCount}/${changes.allFiles.length}개 파일 성공`);
            return { success: true, processed: successCount, total: changes.allFiles.length };
        } catch (error) {
            console.error('동기화 중 오류 발생:', error);
            return { success: false, error: error.message };
        }
    }

    // 로컬 데이터 검색
    async searchLocal(query, limit = 10) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();

            const results = [];
            const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 1);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor && results.length < limit) {
                    const record = cursor.value;
                    let score = 0;

                    // 검색어 매칭 점수 계산
                    searchTerms.forEach(term => {
                        if (record.searchText.includes(term)) {
                            score += 1;
                        }
                        // 정확한 매칭에 더 높은 점수
                        if (record.searchText.indexOf(term) === 0) {
                            score += 2;
                        }
                    });

                    if (score > 0) {
                        results.push({ ...record, score });
                    }

                    cursor.continue();
                } else {
                    // 점수순으로 정렬
                    results.sort((a, b) => b.score - a.score);
                    resolve(results.slice(0, limit));
                }
            };

            request.onerror = () => {
                console.error('로컬 검색 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 백그라운드 동기화 (비동기)
    async backgroundSync() {
        try {
            // 백그라운드에서 실행하되 UI 블로킹 방지
            setTimeout(async () => {
                const result = await this.performSync();
                if (result.success && result.processed > 0) {
                    console.log(`백그라운드 동기화 완료: ${result.processed}개 파일 업데이트됨`);
                    
                    // 동기화 완료 이벤트 발생
                    window.dispatchEvent(new CustomEvent('csvDataSynced', {
                        detail: result
                    }));
                }
            }, 1000); // 1초 후 실행
        } catch (error) {
            console.error('백그라운드 동기화 오류:', error);
        }
    }

    // 초기화 및 자동 동기화 시작
    async initialize() {
        try {
            await this.initDB();
            
            // 즉시 로컬 데이터 사용 가능하도록 설정
            console.log('IndexedDB 동기화 모듈 초기화 완료');
            
            // 백그라운드에서 동기화 시작
            this.backgroundSync();
            
            return true;
        } catch (error) {
            console.error('IndexedDB 동기화 모듈 초기화 실패:', error);
            return false;
        }
    }

    // 수동 동기화 (사용자 요청 시)
    async manualSync() {
        const result = await this.performSync();
        
        // 사용자에게 결과 표시
        if (result.success) {
            const message = result.processed > 0 
                ? `${result.processed}개 파일이 업데이트되었습니다.`
                : '모든 데이터가 최신 상태입니다.';
            
            console.log('수동 동기화 완료:', message);
            return { success: true, message };
        } else {
            console.error('수동 동기화 실패:', result.error);
            return { success: false, message: '동기화 중 오류가 발생했습니다.' };
        }
    }

    // 데이터베이스 통계
    async getStats() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => {
                resolve({
                    totalRecords: request.result,
                    dbSize: this.db.name,
                    version: this.db.version
                });
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// 전역 인스턴스 생성
window.indexedDBSync = new IndexedDBSync();

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('IndexedDB 자동 동기화 시작...');
    window.indexedDBSync.initialize();
});

// 동기화 완료 이벤트 리스너 예시
window.addEventListener('csvDataSynced', function(event) {
    console.log('CSV 데이터 동기화 완료:', event.detail);
    // 필요시 UI 업데이트 또는 사용자 알림
});