/**
 * 오프라인 캐시 및 로컬 데이터 처리 모듈
 * - IndexedDB를 사용하여 CSV 데이터 및 자연어 변환 데이터 저장
 * - 네트워크 연결 감지 및 오프라인 모드 전환
 * - 로컬 데이터 기반 검색 기능 제공
 */

// 데이터베이스 설정
const DB_NAME = 'shinhan-netbot-cache';
const DB_VERSION = 1;
const STORES = {
    csv_data: 'csv_data',          // 원본 CSV 데이터
    narratives: 'narratives',      // 자연어 변환 데이터
    documents: 'documents',        // 문서 메타데이터
    settings: 'settings'           // 설정 정보
};

// 오프라인 상태 관리
let isOnline = navigator.onLine;
let db = null;

// IndexedDB 초기화
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        // 데이터베이스 생성/업그레이드
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // 오브젝트 스토어 생성
            if (!db.objectStoreNames.contains(STORES.csv_data)) {
                db.createObjectStore(STORES.csv_data, { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains(STORES.narratives)) {
                db.createObjectStore(STORES.narratives, { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains(STORES.documents)) {
                db.createObjectStore(STORES.documents, { keyPath: 'system_filename' });
            }
            
            if (!db.objectStoreNames.contains(STORES.settings)) {
                db.createObjectStore(STORES.settings, { keyPath: 'key' });
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB 초기화 완료");
            resolve(db);
        };
        
        request.onerror = (event) => {
            console.error("IndexedDB 초기화 오류:", event.target.error);
            reject(event.target.error);
        };
    });
}

// 데이터 저장
async function saveToStore(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("데이터베이스 연결이 없습니다."));
            return;
        }
        
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        // 배열 데이터인 경우
        if (Array.isArray(data)) {
            let completed = 0;
            let errors = [];
            
            data.forEach(item => {
                const request = store.put(item);
                request.onsuccess = () => {
                    completed++;
                    if (completed === data.length) {
                        if (errors.length > 0) {
                            reject(new Error(`${errors.length}개 항목 저장 실패`));
                        } else {
                            resolve(true);
                        }
                    }
                };
                request.onerror = (event) => {
                    errors.push(event.target.error);
                    completed++;
                    if (completed === data.length) {
                        reject(new Error(`${errors.length}개 항목 저장 실패`));
                    }
                };
            });
        } else {
            // 단일 객체인 경우
            const request = store.put(data);
            request.onsuccess = () => resolve(true);
            request.onerror = (event) => reject(event.target.error);
        }
    });
}

// 데이터 조회
async function getFromStore(storeName, key = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("데이터베이스 연결이 없습니다."));
            return;
        }
        
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        if (key) {
            // 특정 키로 조회
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        } else {
            // 전체 데이터 조회
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        }
    });
}

// IP 주소 패턴 검색 (정규식 기반)
async function searchByIpAddress(ipAddress) {
    // IP 주소 검색 패턴 검증
    const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    if (!ipPattern.test(ipAddress)) {
        return { found: false, message: "유효한 IP 주소 형식이 아닙니다." };
    }
    
    try {
        // 자연어 변환 데이터에서 검색
        const narratives = await getFromStore(STORES.narratives);
        
        const matchedNarratives = narratives.filter(narrative => {
            // 메타데이터에 IP 주소가 포함되어 있는지 확인
            if (narrative.metadata && narrative.metadata.ip_address) {
                return narrative.metadata.ip_address === ipAddress;
            }
            
            // 텍스트에 IP 주소가 포함되어 있는지 확인
            return narrative.text.includes(ipAddress);
        });
        
        if (matchedNarratives.length > 0) {
            return {
                found: true,
                results: matchedNarratives,
                searchType: 'ip_address'
            };
        }
        
        // CSV 데이터에서 직접 검색 (폴백)
        const csvData = await getFromStore(STORES.csv_data);
        
        const matchedCsvData = csvData.filter(item => {
            // 각 행의 모든 열에서 IP 주소를 검색
            for (const key in item.data) {
                if (item.data[key] === ipAddress) {
                    return true;
                }
            }
            return false;
        });
        
        if (matchedCsvData.length > 0) {
            return {
                found: true,
                results: matchedCsvData,
                searchType: 'csv_data'
            };
        }
        
        return { found: false, message: `IP 주소 ${ipAddress}에 대한 정보를 찾을 수 없습니다.` };
    } catch (error) {
        console.error("오프라인 IP 검색 중 오류:", error);
        return { 
            found: false, 
            error: true, 
            message: "오프라인 데이터 검색 중 오류가 발생했습니다."
        };
    }
}

// 키워드 기반 검색
async function searchByKeywords(keywords) {
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return { found: false, message: "검색할 키워드가 없습니다." };
    }
    
    try {
        // 자연어 변환 데이터에서 검색
        const narratives = await getFromStore(STORES.narratives);
        
        // 각 키워드에 대한 매칭 결과 및 점수 계산
        const results = narratives.map(narrative => {
            let score = 0;
            
            // 텍스트에서 키워드 매칭
            keywords.forEach(keyword => {
                if (narrative.text.includes(keyword)) {
                    score += 1;
                }
            });
            
            // 메타데이터에서 키워드 매칭
            if (narrative.metadata) {
                for (const key in narrative.metadata) {
                    const value = narrative.metadata[key];
                    if (typeof value === 'string') {
                        keywords.forEach(keyword => {
                            if (value.includes(keyword)) {
                                score += 0.5;  // 메타데이터는 가중치를 낮게
                            }
                        });
                    }
                }
            }
            
            return { narrative, score };
        });
        
        // 매칭 점수가 있는 결과만 필터링하고 점수 기준 내림차순 정렬
        const matchedResults = results
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(result => ({ 
                ...result.narrative, 
                matchScore: result.score 
            }));
        
        if (matchedResults.length > 0) {
            return {
                found: true,
                results: matchedResults,
                searchType: 'keywords'
            };
        }
        
        return { found: false, message: "관련된 정보를 찾을 수 없습니다." };
    } catch (error) {
        console.error("오프라인 키워드 검색 중 오류:", error);
        return { 
            found: false, 
            error: true, 
            message: "오프라인 데이터 검색 중 오류가 발생했습니다."
        };
    }
}

// 연결 상태 확인 및 업데이트
function updateConnectionStatus() {
    const newStatus = navigator.onLine;
    
    // 연결 상태 변경 시 이벤트 발생
    if (isOnline !== newStatus) {
        isOnline = newStatus;
        
        // 이벤트 발생
        const event = new CustomEvent('connectionStatusChanged', { 
            detail: { isOnline } 
        });
        document.dispatchEvent(event);
        
        console.log(`연결 상태 업데이트: ${isOnline ? '온라인' : '오프라인'}`);
    }
    
    return isOnline;
}

// 현재 연결 상태 반환
function getConnectionStatus() {
    updateConnectionStatus();
    return isOnline;
}

// 로컬 데이터 기반 챗봇 응답 생성
async function getOfflineResponse(query) {
    // 챗봇 쿼리 분석 (자체 처리)
    const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    const ipMatch = query.match(ipPattern);
    
    if (ipMatch) {
        // IP 주소 검색
        const ipAddress = ipMatch[0];
        const searchResult = await searchByIpAddress(ipAddress);
        
        if (searchResult.found) {
            // 결과 포맷팅
            const firstResult = searchResult.results[0];
            let response = `## IP 주소 정보 조회 결과\n\n`;
            
            if (searchResult.searchType === 'ip_address') {
                // 자연어 변환 데이터에서 찾은 경우
                response += firstResult.text;
                
                // 추가 정보가 있으면 표시
                if (searchResult.results.length > 1) {
                    response += `\n\n추가로 ${searchResult.results.length - 1}개의 관련 정보가 있습니다.`;
                }
            } else {
                // CSV 데이터에서 직접 찾은 경우
                const row = firstResult.data;
                const rowHtml = Object.entries(row)
                    .map(([key, value]) => `**${key}:** ${value}`)
                    .join('\n');
                
                response += rowHtml;
            }
            
            // 오프라인 모드 표시
            response += `\n\n[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 로컬 데이터베이스에서 정보를 제공합니다.`;
            
            return {
                text: response,
                source: 'offline',
                found: true
            };
        } else {
            return {
                text: `## IP 주소 정보 조회 결과\n\nIP 주소 **${ipMatch[0]}**에 대한 정보를 찾을 수 없습니다. 😊\n\n다른 IP 주소로 검색하거나 네트워크 관리자에게 문의해 주세요.\n\n[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 로컬 데이터베이스에서 정보를 제공합니다.`,
                source: 'offline',
                found: false
            };
        }
    }
    
    // 키워드 기반 검색 (단어 단위로 분리)
    const keywords = query.split(/\s+/).filter(word => word.length >= 2);
    
    if (keywords.length > 0) {
        const searchResult = await searchByKeywords(keywords);
        
        if (searchResult.found) {
            // 결과 포맷팅 (상위 3개만)
            const topResults = searchResult.results.slice(0, 3);
            let response = `## 검색 결과\n\n`;
            
            // 결과 목록 형식으로 표시
            topResults.forEach((result, index) => {
                response += `### 결과 ${index + 1}\n${result.text}\n\n`;
            });
            
            // 추가 결과가 있으면 표시
            if (searchResult.results.length > 3) {
                response += `⭐ 추가로 ${searchResult.results.length - 3}개의 관련 정보가 있습니다.\n\n`;
            }
            
            // 오프라인 모드 표시
            response += `[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 로컬 데이터베이스에서 정보를 제공합니다.`;
            
            return {
                text: response,
                source: 'offline',
                found: true
            };
        }
    }
    
    // 일치하는 결과가 없는 경우
    return {
        text: `[🔴 오프라인 모드] 현재 인터넷 연결이 제한되어 있어 AI 응답 생성이 불가능합니다.\n\n질문에 관련된 정보를 로컬 데이터베이스에서 찾지 못했습니다. 다음과 같이 시도해 보세요:\n\n1. 질문을 더 구체적으로 작성해 보세요\n2. IP 주소와 같은 특정 정보를 포함해 보세요\n3. 인터넷 연결이 복구된 후 다시 시도하세요`,
        source: 'offline',
        found: false
    };
}

// 서버 연결 가능 여부 확인
async function checkServerConnection() {
    if (!navigator.onLine) {
        return false;
    }
    
    try {
        // 서버 연결 테스트 (타임아웃 1초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        const response = await fetch('/api/connection_status', {
            method: 'GET',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        return response.ok;
    } catch (error) {
        console.log("서버 연결 확인 실패:", error.message);
        return false;
    }
}

// 업로드된 문서 목록을 로컬 캐시에 저장
async function cacheDocuments() {
    try {
        const response = await fetch('/api/documents');
        if (response.ok) {
            const data = await response.json();
            
            if (data.files && Array.isArray(data.files)) {
                // 각 문서를 저장
                await saveToStore(STORES.documents, data.files);
                
                console.log(`${data.files.length}개 문서 메타데이터 캐싱 완료`);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("문서 캐싱 중 오류:", error);
        return false;
    }
}

// CSV 파일 다운로드 및 로컬 저장
async function cacheCsvFiles() {
    try {
        // 저장된 문서 목록 가져오기
        const documents = await getFromStore(STORES.documents);
        
        // CSV 파일만 필터링
        const csvFiles = documents.filter(doc => 
            doc.filename.toLowerCase().endsWith('.csv')
        );
        
        let success = 0;
        let failed = 0;
        
        // 각 CSV 파일 다운로드 및 저장
        for (const file of csvFiles) {
            try {
                const response = await fetch(`/api/documents/view/${file.system_filename}`);
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.content && data.content_type === 'csv') {
                        // CSV 데이터 파싱 및 저장
                        const csvRows = parseCsvContent(data.content, file.system_filename);
                        
                        if (csvRows && csvRows.length > 0) {
                            await saveToStore(STORES.csv_data, csvRows);
                            
                            // 자연어 문장으로 변환하여 저장
                            await convertAndSaveNarratives(csvRows, file.system_filename, file.filename);
                            
                            success++;
                        }
                    }
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`CSV 파일 캐싱 중 오류 (${file.filename}):`, error);
                failed++;
            }
        }
        
        console.log(`CSV 파일 캐싱 완료: 성공 ${success}개, 실패 ${failed}개`);
        return success > 0;
    } catch (error) {
        console.error("CSV 파일 캐싱 중 오류:", error);
        return false;
    }
}

// CSV 컨텐츠 파싱 (HTML 또는 텍스트 형식)
function parseCsvContent(content, fileId) {
    // HTML 테이블 형식일 경우
    if (content.includes('<table')) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        
        const table = tempDiv.querySelector('table');
        if (!table) return [];
        
        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.trim());
        
        const rows = [];
        const bodyRows = table.querySelectorAll('tbody tr');
        
        bodyRows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td');
            const rowData = {};
            
            // 각 셀의 데이터 추출
            cells.forEach((cell, colIndex) => {
                if (colIndex < headers.length) {
                    rowData[headers[colIndex]] = cell.textContent.trim();
                }
            });
            
            // CSV 행 ID 생성 (파일ID + 행번호)
            const id = `${fileId}_row_${rowIndex}`;
            
            rows.push({
                id,
                fileId,
                rowIndex,
                headers,
                data: rowData
            });
        });
        
        return rows;
    }
    
    // 일반 텍스트 형식인 경우
    const lines = content.split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',');
        const rowData = {};
        
        // 각 값을 헤더와 매핑
        values.forEach((value, index) => {
            if (index < headers.length) {
                rowData[headers[index]] = value.trim();
            }
        });
        
        // CSV 행 ID 생성 (파일ID + 행번호)
        const id = `${fileId}_row_${i - 1}`;
        
        rows.push({
            id,
            fileId,
            rowIndex: i - 1,
            headers,
            data: rowData
        });
    }
    
    return rows;
}

// CSV 데이터를 자연어 문장으로 변환
async function convertAndSaveNarratives(csvRows, fileId, fileName) {
    if (!csvRows || csvRows.length === 0) return false;
    
    const narratives = [];
    const fileType = detectCsvType(csvRows, fileName);
    
    csvRows.forEach(row => {
        const narrative = createNarrative(row, fileType);
        if (narrative) {
            narratives.push(narrative);
        }
    });
    
    if (narratives.length > 0) {
        await saveToStore(STORES.narratives, narratives);
        console.log(`${narratives.length}개 자연어 문장 저장 완료 (${fileName})`);
        return true;
    }
    
    return false;
}

// CSV 파일 유형 감지
function detectCsvType(csvRows, fileName) {
    if (!csvRows || csvRows.length === 0) return 'UNKNOWN';
    
    const firstRow = csvRows[0];
    const headers = firstRow.headers;
    
    // IP 사용자 정보 파일
    if (headers.includes('IP 주소') || headers.includes('IP주소') || 
        headers.some(h => h.includes('IP') && (h.includes('사용자') || h.includes('담당')))) {
        return 'IP_사용자_조회';
    }
    
    // 절차 안내 파일
    if (headers.includes('절차 구분') || headers.includes('절차구분') || 
        headers.includes('안내 사항') || headers.includes('절차 설명')) {
        return '절차_안내';
    }
    
    // 대외계 연동 파일
    if (headers.includes('연동 시스템') || headers.includes('연동시스템') || 
        headers.includes('외부 시스템') || headers.includes('대외계')) {
        return 'EXTERNAL_SYSTEM';
    }
    
    // 파일명 기반 유형 추정
    if (fileName.includes('IP') || fileName.includes('주소')) {
        return 'IP_사용자_조회';
    } else if (fileName.includes('절차') || fileName.includes('안내')) {
        return '절차_안내';
    } else if (fileName.includes('연동') || fileName.includes('대외계')) {
        return 'EXTERNAL_SYSTEM';
    }
    
    return 'UNKNOWN';
}

// 자연어 문장 생성
function createNarrative(csvRow, fileType) {
    if (!csvRow || !csvRow.data) return null;
    
    const data = csvRow.data;
    let text = '';
    let metadata = {
        source: 'csv',
        file_id: csvRow.fileId,
        row_idx: csvRow.rowIndex,
        csv_type: fileType
    };
    
    // IP 사용자 조회 유형
    if (fileType === 'IP_사용자_조회') {
        const ipAddress = data['IP 주소'] || data['IP주소'] || Object.values(data).find(v => /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(v));
        const user = data['사용자명'] || data['사용자'] || data['담당자'];
        const department = data['부서'] || data['부서명'] || data['팀'];
        const status = data['상태'] || data['사용상태'] || '';
        
        if (ipAddress) {
            metadata.ip_address = ipAddress;
            
            if (user && department) {
                text = `IP ${ipAddress}은(는) ${department} ${user}님이 사용 중입니다.`;
                
                if (status && status !== '사용중') {
                    text += ` (상태: ${status})`;
                }
            } else if (user) {
                text = `IP ${ipAddress}은(는) ${user}님이 사용 중입니다.`;
            } else {
                // 관련 정보가 없는 경우 데이터 그대로 표시
                text = `IP ${ipAddress} 정보: `;
                
                // 모든 필드 추가
                Object.entries(data).forEach(([key, value]) => {
                    if (value && key !== 'IP 주소' && key !== 'IP주소') {
                        text += `${key}: ${value}, `;
                    }
                });
                
                // 마지막 콤마 제거
                text = text.replace(/, $/, '');
            }
        }
    } 
    // 절차 안내 유형
    else if (fileType === '절차_안내') {
        const procedureType = data['절차 구분'] || data['절차구분'] || data['구분'];
        const description = data['설명'] || data['절차 설명'] || data['안내 사항'] || '';
        const department = data['담당 부서'] || data['담당부서'] || data['담당팀'] || '';
        
        if (procedureType) {
            metadata.procedure_type = procedureType;
            
            text = `${procedureType} 절차: ${description}`;
            
            if (department) {
                text += ` (담당: ${department})`;
            }
        }
    }
    // 대외계 연동 유형
    else if (fileType === 'EXTERNAL_SYSTEM') {
        const system = data['시스템명'] || data['시스템'] || data['연동 시스템'] || '';
        const connectionType = data['연결 방식'] || data['연결방식'] || data['연동 방식'] || '';
        const ipAddress = data['IP 주소'] || data['IP주소'] || data['서버 주소'] || '';
        
        if (system) {
            metadata.system_name = system;
            
            if (connectionType && ipAddress) {
                text = `${system}은(는) ${connectionType} 방식으로 ${ipAddress}에 연결됩니다.`;
            } else if (connectionType) {
                text = `${system}은(는) ${connectionType} 방식으로 연결됩니다.`;
            } else if (ipAddress) {
                text = `${system}은(는) ${ipAddress}에 연결됩니다.`;
            } else {
                text = `${system} 연동 정보: `;
                
                // 모든 필드 추가
                Object.entries(data).forEach(([key, value]) => {
                    if (value && key !== '시스템명' && key !== '시스템') {
                        text += `${key}: ${value}, `;
                    }
                });
                
                // 마지막 콤마 제거
                text = text.replace(/, $/, '');
            }
        }
    }
    // 기타 유형 (자동 감지)
    else {
        // 어떤 필드가 있는지 확인하고 자동으로 문장 생성 시도
        if (Object.keys(data).length > 0) {
            const firstKey = Object.keys(data)[0];
            const firstValue = data[firstKey];
            
            text = `${firstKey}: ${firstValue}`;
            
            // 다른 주요 필드 추가
            const otherFields = Object.entries(data)
                .filter(([key]) => key !== firstKey)
                .slice(0, 3); // 최대 3개 필드만 추가
                
            if (otherFields.length > 0) {
                text += ` (${otherFields.map(([key, value]) => `${key}: ${value}`).join(', ')})`;
            }
        }
    }
    
    // 텍스트가 생성되지 않은 경우 null 반환
    if (!text) return null;
    
    // 고유 ID 생성
    const id = `narrative_${csvRow.fileId}_${csvRow.rowIndex}`;
    
    return {
        id,
        text,
        metadata
    };
}

// 인터페이스 초기화
async function initOfflineMode() {
    try {
        // 데이터베이스 초기화
        await initDatabase();
        
        // 연결 상태 모니터링 설정
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);
        
        // 초기 연결 상태 확인
        const isOnline = updateConnectionStatus();
        
        // 온라인 상태인 경우, 데이터 캐싱
        if (isOnline) {
            // 서버 연결 가능 여부 확인
            const serverConnected = await checkServerConnection();
            
            if (serverConnected) {
                // 문서 메타데이터 캐싱
                await cacheDocuments();
                
                // CSV 파일 캐싱
                await cacheCsvFiles();
            }
        }
        
        console.log('오프라인 모드 초기화 완료');
        return true;
    } catch (error) {
        console.error('오프라인 모드 초기화 실패:', error);
        return false;
    }
}

// 전역 함수로 노출
window.OfflineCache = {
    init: initOfflineMode,
    getConnectionStatus,
    updateConnectionStatus,
    searchByIpAddress,
    searchByKeywords,
    getOfflineResponse
};