/**
 * SHB-NetBot 오프라인 데이터베이스 관리
 * IndexedDB를 사용하여 CSV 데이터를 브라우저에 저장합니다.
 */

(function() {
    // IndexedDB 데이터베이스 설정
    const DB_NAME = 'shb-netbot-storage';
    const DB_VERSION = 1;
    const STORE_NAME = 'csv-data';
    
    // 전역 객체에 노출
    window.netbotLocalDB = {
        /**
         * 데이터베이스 초기화
         * @returns {Promise<IDBDatabase>} 초기화된 데이터베이스
         */
        initDB: function() {
            return new Promise((resolve, reject) => {
                // IndexedDB 지원 확인
                if (!window.indexedDB) {
                    console.error('이 브라우저는 IndexedDB를 지원하지 않습니다.');
                    reject(new Error('IndexedDB 지원 없음'));
                    return;
                }
                
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                
                request.onerror = (event) => {
                    console.error('IndexedDB 열기 실패:', event.target.error);
                    reject(event.target.error);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // 기존 스토어가 있으면 삭제
                    if (db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    
                    // 오브젝트 스토어 생성 (키는 자동 생성)
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    
                    // 검색에 사용할 인덱스 생성
                    store.createIndex('ip', 'metadata.ip', { unique: false });
                    store.createIndex('user', 'metadata.user', { unique: false });
                    store.createIndex('department', 'metadata.department', { unique: false });
                    store.createIndex('source', 'metadata.source', { unique: false });
                    store.createIndex('record_type', 'metadata.record_type', { unique: false });
                    
                    console.log('IndexedDB 스토어 및 인덱스 생성 완료');
                    
                    // 기본 샘플 데이터 추가
                    this.initializeWithSampleData(store);
                };
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    console.log('IndexedDB 연결 성공');
                    
                    // DB 데이터 유무 확인
                    this.getDataCount().then(count => {
                        if (count === 0) {
                            // 데이터가 없으면 샘플 데이터 추가
                            this.saveData(this.createSampleData())
                                .then(() => console.log('기본 샘플 데이터 저장 완료'))
                                .catch(err => console.error('샘플 데이터 저장 실패:', err));
                        } else {
                            console.log(`DB에 ${count}개의 기존 데이터가 있습니다.`);
                        }
                    });
                    
                    resolve(db);
                };
            }.bind(this));
        },
        
        /**
         * 데이터 저장
         * @param {Array} data - 저장할 데이터 배열 (각 항목은 {text, metadata} 형식)
         * @returns {Promise<boolean>} 저장 성공 여부
         */
        saveData: async function(data) {
            try {
                const db = await this.initDB();
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                // 새 데이터 저장
                const promises = data.map(item => {
                    return new Promise((resolve, reject) => {
                        const request = store.add(item);
                        request.onsuccess = () => resolve(true);
                        request.onerror = (e) => reject(e.target.error);
                    });
                });
                
                // 트랜잭션 완료 대기
                return new Promise((resolve, reject) => {
                    transaction.oncomplete = () => {
                        console.log(`${data.length}개 항목 저장 완료`);
                        db.close();
                        resolve(true);
                    };
                    
                    transaction.onerror = (event) => {
                        console.error('저장 트랜잭션 오류:', event.target.error);
                        db.close();
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('데이터 저장 중 오류:', error);
                return false;
            }
        },
        
        /**
         * IP 주소로 데이터 검색
         * @param {string} ipAddress - 검색할 IP 주소
         * @returns {Promise<Array>} 검색 결과 배열
         */
        searchByIp: async function(ipAddress) {
            try {
                const db = await this.initDB();
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const ipIndex = store.index('ip');
                
                return new Promise((resolve, reject) => {
                    const request = ipIndex.getAll(ipAddress);
                    
                    request.onsuccess = () => {
                        const results = request.result || [];
                        db.close();
                        resolve(results);
                    };
                    
                    request.onerror = (event) => {
                        console.error('IP 검색 오류:', event.target.error);
                        db.close();
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('IP 검색 중 오류:', error);
                return [];
            }
        },
        
        /**
         * 유사도 기반 텍스트 검색
         * @param {string} query - 검색 쿼리
         * @param {Array} keywords - 검색 키워드 배열 (선택 사항)
         * @returns {Promise<Array>} 유사도 점수가 포함된 결과 배열
         */
        searchSimilarText: async function(query, keywords = []) {
            try {
                // 검색 쿼리 정규화
                const normalizedQuery = query.toLowerCase().trim();
                
                // 키워드가 제공되지 않은 경우 검색어에서 추출
                if (!keywords || keywords.length === 0) {
                    keywords = normalizedQuery
                        .split(/[\s,.?!]+/)
                        .filter(word => word.length >= 2);
                }
                
                const db = await this.initDB();
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                
                return new Promise((resolve, reject) => {
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        const allItems = request.result || [];
                        db.close();
                        
                        if (allItems.length === 0) {
                            resolve([]);
                            return;
                        }
                        
                        // 각 항목에 대해 유사도 계산
                        const results = [];
                        
                        allItems.forEach(item => {
                            // 텍스트와 메타데이터 추출
                            const itemText = item.text ? item.text.toLowerCase() : '';
                            const questionText = item.metadata && item.metadata.question ? 
                                item.metadata.question.toLowerCase() : '';
                            
                            // 텍스트 유사도 계산
                            const textSimilarity = this.calculateTextSimilarity(normalizedQuery, itemText);
                            
                            // 질문 필드가 있는 경우 질문과의 유사도도 계산
                            const questionSimilarity = questionText ? 
                                this.calculateTextSimilarity(normalizedQuery, questionText) : 0;
                            
                            // 키워드 매칭 점수 계산
                            const keywordScore = this.calculateRelevanceScore(item, keywords) / 10; // 0~1 사이 값으로 정규화
                            
                            // 최종 유사도 점수 계산 (텍스트 유사도, 질문 유사도, 키워드 점수의 가중 평균)
                            // 질문 필드 유사도에 더 높은 가중치 부여
                            const finalSimilarity = questionText ?
                                (textSimilarity * 0.3) + (questionSimilarity * 0.5) + (keywordScore * 0.2) :
                                (textSimilarity * 0.7) + (keywordScore * 0.3);
                            
                            // 유사도 점수를 항목에 추가
                            item.similarity = finalSimilarity;
                            
                            // 최소 유사도 이상인 경우에만 결과에 추가
                            if (finalSimilarity > 0.1) {
                                results.push(item);
                            }
                        });
                        
                        // 유사도에 따라 결과 정렬 (내림차순)
                        results.sort((a, b) => b.similarity - a.similarity);
                        
                        resolve(results);
                    };
                    
                    request.onerror = (event) => {
                        console.error('유사도 기반 검색 실패:', event.target.error);
                        db.close();
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('텍스트 검색 중 오류:', error);
                return [];
            }
        },
        
        /**
         * 텍스트 유사도 계산 (자카드 유사도 + 부분 문자열 매칭)
         * @param {string} query - 검색 쿼리
         * @param {string} text - 비교할 텍스트
         * @returns {number} 유사도 점수 (0~1)
         */
        calculateTextSimilarity: function(query, text) {
            // 빈 문자열 체크
            if (!query || !text) return 0;
            
            // 1. 부분 문자열 포함 여부 확인 (정확한 매칭에 높은 점수)
            let containsScore = 0;
            if (text.includes(query)) {
                containsScore = 0.8; // 전체 쿼리가 포함된 경우 높은 점수
            } else {
                // 단어 단위로 포함 여부 확인
                const queryWords = query.split(/\s+/);
                let matchedWords = 0;
                
                for (const word of queryWords) {
                    if (word.length >= 2 && text.includes(word)) {
                        matchedWords++;
                    }
                }
                
                containsScore = queryWords.length > 0 ? 
                    (matchedWords / queryWords.length) * 0.6 : 0;
            }
            
            // 2. 자카드 유사도 계산 (단어 집합 기반)
            const querySet = new Set(query.split(/\s+/).filter(word => word.length >= 2));
            const textSet = new Set(text.split(/\s+/).filter(word => word.length >= 2));
            
            // 교집합 크기
            let intersection = 0;
            for (const word of querySet) {
                if (textSet.has(word)) {
                    intersection++;
                }
            }
            
            // 합집합 크기
            const union = querySet.size + textSet.size - intersection;
            
            // 자카드 유사도
            const jaccardSimilarity = union > 0 ? intersection / union : 0;
            
            // 두 점수 결합 (높은 점수에 더 가중치)
            return Math.max(containsScore, jaccardSimilarity);
        },
        
        /**
         * 키워드 관련성 점수 계산
         * @param {Object} item - 검색할 항목
         * @param {Array} keywords - 키워드 배열
         * @returns {number} 관련성 점수 (0~10)
         */
        calculateRelevanceScore: function(item, keywords) {
            let score = 0;
            
            // 텍스트 필드 검색
            for (const keyword of keywords) {
                if (item.text && item.text.toLowerCase().includes(keyword.toLowerCase())) {
                    score += 2; // 본문 텍스트 일치: 2점
                }
            }
            
            // 메타데이터 필드 검색
            if (item.metadata) {
                for (const keyword of keywords) {
                    for (const [key, value] of Object.entries(item.metadata)) {
                        if (typeof value === 'string' && 
                            value.toLowerCase().includes(keyword.toLowerCase())) {
                            
                            // 질문 필드는 가중치 높게
                            if (key === 'question') {
                                score += 3; // 질문 필드 일치: 3점
                            } else {
                                score += 1; // 일반 메타데이터 일치: 1점
                            }
                        }
                    }
                }
            }
            
            return Math.min(score, 10); // 최대 10점
        },
        
        /**
         * 저장된 데이터 수 확인
         * @returns {Promise<number>} 저장된 항목 수
         */
        getDataCount: async function() {
            try {
                const db = await this.initDB();
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                
                return new Promise((resolve, reject) => {
                    const countRequest = store.count();
                    
                    countRequest.onsuccess = () => {
                        const count = countRequest.result;
                        db.close();
                        resolve(count);
                    };
                    
                    countRequest.onerror = (event) => {
                        console.error('데이터 수 확인 실패:', event.target.error);
                        db.close();
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('데이터 수 확인 중 오류:', error);
                return 0;
            }
        },
        
        /**
         * 모든 데이터 가져오기
         * @returns {Promise<Array>} 모든 저장된 데이터 배열
         */
        getAllData: async function() {
            try {
                const db = await this.initDB();
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                
                return new Promise((resolve, reject) => {
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        const allData = request.result || [];
                        db.close();
                        resolve(allData);
                    };
                    
                    request.onerror = (event) => {
                        console.error('전체 데이터 가져오기 실패:', event.target.error);
                        db.close();
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('전체 데이터 가져오기 중 오류:', error);
                return [];
            }
        },
        
        /**
         * CSV 데이터를 IndexedDB에 저장
         * @param {Array} csvData - CSV 파일 데이터 배열
         * @returns {Promise<boolean>} 성공 여부
         */
        storeCSVData: async function(csvData) {
            try {
                // CSV 데이터를 자연어 텍스트와 메타데이터로 변환
                const narratives = [];
                
                for (const file of csvData) {
                    for (const record of file.records) {
                        // 레코드 유형 판별
                        const isIpRecord = Object.entries(record).some(([key, value]) => 
                            key.toLowerCase().includes('ip') || 
                            (typeof value === 'string' && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value))
                        );
                        
                        // 파일명 기반 레코드 유형 결정
                        const recordType = file.filename.toLowerCase().includes('ip') ? 'ip' : 
                                       file.filename.toLowerCase().includes('장애') ? 'issue' :
                                       file.filename.toLowerCase().includes('대외계') ? 'external' : 'general';
                        
                        // 자연어 텍스트 생성 및 메타데이터 구성
                        let text = '';
                        const metadata = {
                            source: file.filename,
                            record_type: recordType
                        };
                        
                        // IP 주소 레코드 처리
                        if (isIpRecord) {
                            const ipAddr = this.findValueByKeyPattern(record, 'ip') || '';
                            const user = this.findValueByKeyPattern(record, '사용자|담당자|이름') || '';
                            const dept = this.findValueByKeyPattern(record, '부서|팀') || '';
                            const contact = this.findValueByKeyPattern(record, '연락처|전화') || '';
                            const status = this.findValueByKeyPattern(record, '상태') || '사용 중';
                            
                            text = `IP ${ipAddr}는 ${dept}의 ${user} 담당자가 ${status}입니다. 연락처는 ${contact}입니다.`;
                            
                            Object.assign(metadata, {
                                ip: ipAddr,
                                user: user,
                                department: dept,
                                contact: contact,
                                status: status,
                                question: `${ipAddr} 정보 알려줘`
                            });
                        } else {
                            // 일반 레코드 처리
                            const entries = Object.entries(record);
                            
                            if (entries.length > 0) {
                                // 첫 필드를 기본 텍스트로 사용
                                text = entries[0][1];
                                
                                // 주요 메타데이터 추출
                                for (const [key, value] of entries) {
                                    if (value && typeof value === 'string' && value.length > 0) {
                                        metadata[key.toLowerCase().replace(/\s+/g, '_')] = value;
                                    }
                                }
                                
                                // 질문 필드 추가
                                metadata.question = entries[0][0] + ' ' + entries[0][1];
                            }
                        }
                        
                        if (text) {
                            narratives.push({
                                text,
                                metadata
                            });
                        }
                    }
                }
                
                // IndexedDB에 저장
                return await this.saveData(narratives);
            } catch (error) {
                console.error('CSV 데이터 저장 중 오류:', error);
                return false;
            }
        },
        
        /**
         * 키 패턴에 매칭되는 값 찾기
         * @param {Object} record - 레코드 객체
         * @param {string} pattern - 찾을 키 패턴
         * @returns {string} 찾은 값 또는 빈 문자열
         */
        findValueByKeyPattern: function(record, pattern) {
            const regex = new RegExp(pattern, 'i');
            
            for (const [key, value] of Object.entries(record)) {
                if (regex.test(key) && value) {
                    return value;
                }
            }
            
            return '';
        },
        
        /**
         * 데이터베이스 초기화 시 기본 샘플 데이터 추가
         * @param {IDBObjectStore} store - 저장할 스토어 객체
         */
        initializeWithSampleData: function(store) {
            const sampleData = this.createSampleData();
            
            for (const item of sampleData) {
                store.add(item);
            }
            
            console.log(`${sampleData.length}개의 샘플 데이터가 초기화 중 저장되었습니다.`);
        },
        
        /**
         * 샘플 데이터 생성
         * @returns {Array} 샘플 데이터 배열
         */
        createSampleData: function() {
            return [
                {
                    text: "IP 192.168.0.1은 네트워크관리팀의 김철수 담당자가 사용 중입니다. 연락처는 02-123-4567입니다.",
                    metadata: {
                        ip: "192.168.0.1",
                        user: "김철수",
                        department: "네트워크관리팀",
                        contact: "02-123-4567",
                        last_access: "2025-05-20",
                        status: "사용 중",
                        source: "업무 안내 가이드(IP_사용자_조회).csv",
                        record_type: "ip",
                        question: "192.168.0.1 정보 알려줘"
                    }
                },
                {
                    text: "IP 10.10.1.5는 IT보안팀의 이영희 담당자가 정상 상태입니다. 연락처는 02-123-5678입니다.",
                    metadata: {
                        ip: "10.10.1.5",
                        user: "이영희",
                        department: "IT보안팀",
                        contact: "02-123-5678",
                        last_access: "2025-05-21",
                        status: "정상",
                        source: "업무 안내 가이드(IP_사용자_조회).csv",
                        record_type: "ip",
                        question: "10.10.1.5 IP 담당자는 누구?"
                    }
                },
                {
                    text: "네트워크 연결 오류의 증상은 \"인터넷 연결이 끊어지거나 불안정함\"입니다. 조치 방법은 다음과 같습니다: 1. 네트워크 케이블 연결 확인\n2. 공유기 재시작\n3. IP 설정 확인",
                    metadata: {
                        issue_type: "네트워크 연결 오류",
                        symptom: "인터넷 연결이 끊어지거나 불안정함",
                        solution: "1. 네트워크 케이블 연결 확인\n2. 공유기 재시작\n3. IP 설정 확인",
                        department: "네트워크관리팀",
                        contact: "02-123-4567",
                        source: "업무 안내 가이드(장애_문의).csv",
                        record_type: "issue",
                        question: "네트워크 연결 오류 해결 방법"
                    }
                },
                {
                    text: "서버 접속 불가의 증상은 \"특정 서버에 연결할 수 없음\"입니다. 조치 방법은 다음과 같습니다: 1. 서버 IP 주소 확인\n2. 방화벽 설정 확인\n3. VPN 연결 상태 확인",
                    metadata: {
                        issue_type: "서버 접속 불가",
                        symptom: "특정 서버에 연결할 수 없음",
                        solution: "1. 서버 IP 주소 확인\n2. 방화벽 설정 확인\n3. VPN 연결 상태 확인",
                        department: "서버운영팀",
                        contact: "02-123-8901",
                        source: "업무 안내 가이드(장애_문의).csv",
                        record_type: "issue",
                        question: "서버 접속 안됨"
                    }
                },
                {
                    text: "금융결제원 시스템(10.10.20.5)에 접속하려면 VPN 연결 후 전용 클라이언트 사용이(가) 필요합니다.",
                    metadata: {
                        system_name: "금융결제원 시스템",
                        ip: "10.10.20.5",
                        access_method: "VPN 연결 후 전용 클라이언트 사용",
                        required_permission: "금결원 접속권한",
                        contact_person: "박지민 (02-345-6789)",
                        source: "업무 안내 가이드(대외계_연동).csv",
                        record_type: "external",
                        question: "금융결제원 시스템 접속 방법"
                    }
                },
                {
                    text: "신한금융지주 시스템(10.10.30.8)에 접속하려면 전용 VPN 연결이(가) 필요합니다.",
                    metadata: {
                        system_name: "신한금융지주 시스템",
                        ip: "10.10.30.8",
                        access_method: "전용 VPN 연결",
                        required_permission: "지주사 시스템 접근권한",
                        contact_person: "최준호 (02-456-7890)",
                        source: "업무 안내 가이드(대외계_연동).csv",
                        record_type: "external",
                        question: "신한금융지주 시스템 연결 방법"
                    }
                }
            ];
        }
    };
    
    // 페이지 로드 시 자동 초기화
    document.addEventListener('DOMContentLoaded', function() {
        window.netbotLocalDB.initDB()
            .then(() => console.log('IndexedDB 초기화 완료'))
            .catch(err => console.error('IndexedDB 초기화 실패:', err));
    });
})();