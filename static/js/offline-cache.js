/**
 * 오프라인 모드를 위한 CSV 데이터 캐싱 및 검색 기능 (v2)
 * 
 * 1. CSV 파일을 자연어 문장으로 변환하여 로컬에 저장
 * 2. 오프라인 상태에서 로컬 데이터 검색
 * 3. IP 주소 및 키워드 기반 검색 지원
 * 4. 더 자연스러운 응답 생성
 */

// 로컬 캐시 관리 객체
const OfflineCache = {
    // 최근 캐시 업데이트 시간 (24시간마다 갱신)
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24시간
    LAST_UPDATE_KEY: 'shb-netbot-last-update-v2', // 버전 업데이트로 캐시 초기화 강제화
    CSV_FILES_KEY: 'shb-netbot-csv-files-v2',     // 버전 업데이트로 캐시 초기화 강제화
    
    /**
     * CSV 파일을 자연어 문장과 메타데이터로 변환
     * @param {Object} csvData - CSV 데이터 객체
     * @returns {Array} 변환된 객체 배열
     */
    convertCsvToNarratives: function(csvData) {
        const narratives = [];
        
        try {
            // CSV 유형 감지 (헤더에 따라 다른 처리)
            const type = this.detectCsvType(csvData);
            
            Object.keys(csvData).forEach(filename => {
                const fileData = csvData[filename];
                if (!fileData || !fileData.data || !Array.isArray(fileData.data)) {
                    console.error('유효하지 않은 CSV 데이터 형식:', filename);
                    return;
                }
                
                // 파일 메타데이터 추출
                const fileMeta = {
                    source: filename.replace(/\.[^/.]+$/, "") // 확장자 제거
                };
                
                // 데이터 행마다 자연어 문장 생성
                fileData.data.forEach((row, rowIndex) => {
                    if (!row || rowIndex === 0) return; // 헤더나 빈 행 건너뛰기
                    
                    // 행 데이터 객체화
                    const rowData = {};
                    fileData.headers.forEach((header, colIndex) => {
                        rowData[header] = row[colIndex] || '';
                    });
                    
                    // 유형별 변환 처리
                    const narrative = this.createNarrativeByType(type, rowData, fileMeta);
                    if (narrative) {
                        narratives.push(narrative);
                    }
                });
            });
            
            console.log(`${narratives.length}개 레코드 처리됨`);
            return narratives;
        } catch (error) {
            console.error('CSV 변환 중 오류 발생:', error);
            return [];
        }
    },
    
    /**
     * CSV 유형 감지 (헤더 분석)
     * @param {Object} csvData - CSV 데이터 객체
     * @returns {string} CSV 유형
     */
    detectCsvType: function(csvData) {
        const firstFile = Object.values(csvData)[0];
        if (!firstFile || !firstFile.headers) return 'unknown';
        
        const headers = firstFile.headers.map(h => h.toLowerCase());
        
        if (headers.includes('ip 주소') || headers.includes('ip주소') || headers.includes('ip')) {
            return 'ip_user';
        }
        
        if (headers.includes('질문 키워드') || headers.includes('질문 예시')) {
            return 'qa';
        }
        
        if (headers.includes('대외기관명') || headers.includes('서비스명')) {
            return 'external';
        }
        
        if (headers.includes('장애 유형') || headers.includes('증상')) {
            return 'error';
        }
        
        return 'general';
    },
    
    /**
     * 유형별 자연어 문장 생성
     * @param {string} type - CSV 유형
     * @param {Object} rowData - 행 데이터
     * @param {Object} fileMeta - 파일 메타데이터
     * @returns {Object} 자연어 문장과 메타데이터
     */
    createNarrativeByType: function(type, rowData, fileMeta) {
        let text = '';
        let metadata = { ...fileMeta };
        
        switch (type) {
            case 'ip_user':
                // IP 사용자 정보 유형
                const ip = rowData['IP 주소'] || rowData['IP주소'] || rowData['IP'] || '';
                const user = rowData['사용자명'] || rowData['사용자'] || '';
                const dept = rowData['부서'] || rowData['소속'] || '';
                const status = rowData['상태'] || '사용 중';
                const contact = rowData['연락처'] || rowData['전화번호'] || '';
                const lastAccess = rowData['최종 접속일'] || '';
                
                // 완전히 자연스러운 응답 생성 (통일된 포맷)
                if (dept && user) {
                    text = `IP ${ip}는 ${dept}의 ${user} 담당자가 ${status}입니다.`;
                } else if (user) {
                    text = `IP ${ip}는 ${user} 담당자가 ${status}입니다.`;
                } else {
                    text = `IP ${ip} 정보를 찾았습니다.`;
                }
                
                if (contact) {
                    text += ` 연락처는 ${contact}입니다.`;
                }
                
                if (lastAccess) {
                    text += ` 최근 접속일은 ${lastAccess}입니다.`;
                }
                
                metadata = {
                    ...metadata,
                    ip: ip,
                    user: user,
                    department: dept,
                    status: status,
                    contact: contact,
                    last_access: lastAccess
                };
                break;
                
            case 'qa':
                // 질문-답변 유형
                const keyword = rowData['질문 키워드'] || '';
                const question = rowData['질문 예시'] || '';
                const answer = rowData['요약 응답'] || rowData['상세 안내'] || '';
                const category = rowData['절차 구분'] || rowData['카테고리'] || '';
                const department = rowData['담당 부서'] || '';
                const relatedDoc = rowData['관련 문서/링크'] || '';
                
                // 기본적으로 답변을 그대로 사용
                text = answer;
                
                // 추가 정보가 있으면 응답에 보강
                if (department) {
                    text += ` 해당 업무는 ${department}에서 담당하고 있습니다.`;
                }
                
                if (relatedDoc) {
                    text += ` 자세한 내용은 ${relatedDoc} 문서를 참고하시기 바랍니다.`;
                }
                
                metadata = {
                    ...metadata,
                    keyword: keyword,
                    question: question,
                    category: category,
                    department: department,
                    related_doc: relatedDoc
                };
                break;
                
            case 'external':
                // 대외계 연동 정보 유형
                const orgName = rowData['대외기관명'] || '';
                const service = rowData['서비스명'] || '';
                const ipInfo = rowData['IP(운영)'] || rowData['IP'] || '';
                const devIp = rowData['IP(개발)'] || '';
                const extContact = rowData['기관 담당자'] || '';
                const extContactInfo = rowData['기관 연락처'] || '';
                const teamContact = rowData['당행 담당자'] || '';
                const extDept = rowData['당행 부서'] || '';
                
                // 보다 상세한 자연어 응답 생성
                text = `${orgName}의 ${service} 서비스는 운영 IP ${ipInfo}`;
                if (devIp) {
                    text += `, 개발 IP ${devIp}`;
                }
                text += `로 연결됩니다.`;
                
                if (extContact) {
                    text += ` 기관 측 담당자는 ${extContact}`;
                    if (extContactInfo) {
                        text += `(연락처: ${extContactInfo})`;
                    }
                    text += `입니다.`;
                }
                
                if (extDept) {
                    text += ` 당행 담당 부서는 ${extDept}`;
                    if (teamContact) {
                        text += `, 담당자는 ${teamContact}`;
                    }
                    text += `입니다.`;
                }
                
                metadata = {
                    ...metadata,
                    organization: orgName,
                    service: service,
                    ip: ipInfo,
                    ip_dev: devIp,
                    contact: extContact,
                    contact_info: extContactInfo,
                    department: extDept,
                    team_contact: teamContact
                };
                break;
                
            case 'error':
                // 장애/오류 정보 유형
                const errorType = rowData['장애 유형'] || rowData['오류 유형'] || '';
                const symptom = rowData['증상'] || '';
                const solution = rowData['조치 방법'] || '';
                const errorDept = rowData['담당 부서'] || '';
                const errorDoc = rowData['관련 문서/링크'] || '';
                
                // 더 자연스러운 장애 안내 생성
                text = `"${errorType}" 장애가 발생했습니다.`;
                
                if (symptom) {
                    text += ` 주요 증상은 "${symptom}"입니다.`;
                }
                
                if (solution) {
                    text += ` 조치 방법: ${solution}`;
                }
                
                if (errorDept) {
                    text += ` 담당 부서는 ${errorDept}입니다.`;
                }
                
                if (errorDoc) {
                    text += ` 자세한 내용은 ${errorDoc} 문서를 참고하세요.`;
                }
                
                metadata = {
                    ...metadata,
                    error_type: errorType,
                    symptom: symptom,
                    solution: solution,
                    department: errorDept,
                    related_doc: errorDoc
                };
                break;
                
            default:
                // 일반 유형 (키-값 쌍으로 변환)
                text = Object.entries(rowData)
                    .filter(([k, v]) => v && v.trim() !== '')
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('. ');
                    
                // 일반적인 메타데이터 추출 시도
                if (rowData['이름']) metadata.user = rowData['이름'];
                if (rowData['부서']) metadata.department = rowData['부서'];
                if (rowData['IP']) metadata.ip = rowData['IP'];
        }
        
        // 생성된 자연어 문장과 메타데이터 반환
        return { text, metadata, id: this.generateId() };
    },
    
    /**
     * 고유 ID 생성
     * @returns {string} 고유 ID
     */
    generateId: function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },
    
    /**
     * 로컬 저장소에 저장된 CSV 파일 목록 가져오기
     * @returns {Object} 저장된 CSV 파일 데이터
     */
    getSavedCsvFiles: function() {
        try {
            const saved = localStorage.getItem(this.CSV_FILES_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('저장된 CSV 파일 로드 실패:', error);
            return {};
        }
    },
    
    /**
     * CSV 파일 데이터 로컬 저장소에 저장
     * @param {Object} csvData - 저장할 CSV 데이터
     */
    saveCsvFiles: function(csvData) {
        try {
            localStorage.setItem(this.CSV_FILES_KEY, JSON.stringify(csvData));
            localStorage.setItem(this.LAST_UPDATE_KEY, Date.now().toString());
            console.log('CSV 파일 데이터 로컬 저장소에 저장 완료');
        } catch (error) {
            console.error('CSV 파일 데이터 저장 실패:', error);
        }
    },
    
    /**
     * 캐시 만료 여부 확인
     * @returns {boolean} 캐시 만료 여부
     */
    isCacheExpired: function() {
        const lastUpdate = localStorage.getItem(this.LAST_UPDATE_KEY);
        if (!lastUpdate) return true;
        
        const elapsed = Date.now() - parseInt(lastUpdate);
        return elapsed > this.CACHE_EXPIRY;
    },
    
    /**
     * CSV 데이터 캐싱 및 IndexedDB 저장
     * @param {Object} csvData - CSV 데이터
     * @returns {Promise<boolean>} 성공 여부
     */
    cacheCSVData: async function(csvData) {
        try {
            // 자연어 문장으로 변환
            const narratives = this.convertCsvToNarratives(csvData);
            
            // 로컬 저장소에 CSV 파일 메타데이터 저장
            this.saveCsvFiles(csvData);
            
            // IndexedDB에 자연어 문장 저장
            await OfflineStorage.saveData(narratives);
            
            return true;
        } catch (error) {
            console.error('CSV 데이터 캐싱 실패:', error);
            return false;
        }
    },
    
    /**
     * 오프라인 상태에서 쿼리 처리
     * @param {string} query - 사용자 질문
     * @returns {Promise<Object>} 검색 결과 및 응답
     */
    handleOfflineQuery: async function(query) {
        try {
            // IndexedDB에서 관련 데이터 검색
            const results = await OfflineStorage.searchData(query);
            
            if (results.length === 0) {
                return {
                    success: false,
                    message: "로컬 데이터에서 정보를 찾을 수 없습니다.",
                    data: null
                };
            }
            
            // 가장 관련성 높은 결과 사용
            const bestMatch = results[0];
            
            // IP 주소 쿼리인지 확인
            const ipRegex = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
            const containsIp = ipRegex.test(query);
            
            // 관련 결과 추출 (최대 3개)
            const relatedResults = results.slice(1, 4).map(item => item.text);
            
            // 응답 형식 구성
            let enhancedText = bestMatch.text;
            
            // 메타데이터 활용하여 응답 보강
            if (containsIp && bestMatch.metadata.ip) {
                // IP 쿼리에 대해 더 풍부한 정보 제공
                const meta = bestMatch.metadata;
                if (meta.user && meta.department) {
                    enhancedText = `IP ${meta.ip}는 ${meta.department}의 ${meta.user} 담당자가 사용 중입니다.`;
                    
                    if (meta.contact) {
                        enhancedText += ` 연락처는 ${meta.contact}입니다.`;
                    }
                    
                    if (meta.last_access) {
                        enhancedText += ` 최근 접속일은 ${meta.last_access}입니다.`;
                    }
                    
                    if (meta.status) {
                        enhancedText += ` 현재 상태는 '${meta.status}'입니다.`;
                    }
                }
            }
            
            return {
                success: true,
                message: "로컬 데이터에서 정보를 찾았습니다.",
                data: {
                    text: enhancedText,
                    source: bestMatch.metadata.source || "로컬 데이터",
                    additionalResults: relatedResults,
                    metadata: bestMatch.metadata,
                    relatedCount: results.length > 1 ? results.length - 1 : 0
                }
            };
        } catch (error) {
            console.error('오프라인 쿼리 처리 실패:', error);
            return {
                success: false,
                message: "로컬 데이터 검색 중 오류가 발생했습니다.",
                data: null
            };
        }
    },
    
    /**
     * CSV 파일 형식 파싱 및 처리
     * @param {Object} files - 파일 목록 데이터
     * @returns {Promise<Object>} 처리된 CSV 데이터
     */
    processCSVFiles: async function(files) {
        const csvFiles = {};
        let processed = 0;
        
        // CSV 파일만 필터링
        const csvOnly = files.filter(file => 
            file.filename.toLowerCase().endsWith('.csv'));
        
        console.log(`${csvOnly.length}개의 CSV 파일을 찾았습니다.`);
        
        // 각 CSV 파일 처리
        for (const file of csvOnly) {
            try {
                // 서버에서 파일 내용 가져오기
                const response = await fetch(`/api/documents/view/${encodeURIComponent(file.system_filename)}`);
                if (!response.ok) {
                    console.error(`파일 가져오기 실패: ${file.filename}`);
                    continue;
                }
                
                const data = await response.json();
                if (data.status === 'success' && data.content) {
                    // HTML 테이블에서 데이터 추출
                    const tableData = this.extractTableData(data.content);
                    csvFiles[file.filename] = tableData;
                    processed++;
                    
                    console.log(`${file.filename}: ${tableData.data.length}개 레코드 처리됨`);
                }
            } catch (error) {
                console.error(`파일 처리 중 오류: ${file.filename}`, error);
            }
        }
        
        return { csvFiles, processed };
    },
    
    /**
     * HTML 테이블에서 CSV 데이터 추출
     * @param {string} html - HTML 테이블 문자열
     * @returns {Object} 추출된 헤더와 데이터
     */
    extractTableData: function(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const table = doc.querySelector('table');
            
            if (!table) {
                console.error('테이블을 찾을 수 없음');
                return { headers: [], data: [] };
            }
            
            // 헤더 추출
            const headerRow = table.querySelector('thead tr');
            const headers = Array.from(headerRow.querySelectorAll('th'))
                .map(th => th.textContent.trim());
            
            // 데이터 행 추출
            const data = Array.from(table.querySelectorAll('tbody tr'))
                .map(row => {
                    return Array.from(row.querySelectorAll('td'))
                        .map(td => td.textContent.trim());
                });
            
            return { headers, data };
        } catch (error) {
            console.error('HTML 테이블 데이터 추출 실패:', error);
            return { headers: [], data: [] };
        }
    },
    
    /**
     * 최신 CSV 파일 데이터 수집 및 캐싱
     * @returns {Promise<Object>} 캐싱 결과
     */
    refreshCSVCache: async function() {
        try {
            // 이미 최근에 업데이트된 캐시가 있는지 확인
            if (!this.isCacheExpired()) {
                const savedFiles = this.getSavedCsvFiles();
                if (Object.keys(savedFiles).length > 0) {
                    console.log("최근에 업데이트된 CSV 데이터가 있습니다. 재사용합니다.");
                    return { 
                        success: true, 
                        cached: true,
                        fileCount: Object.keys(savedFiles).length 
                    };
                }
            }
            
            // 서버에서 파일 목록 가져오기
            const response = await fetch('/api/documents');
            if (!response.ok) {
                throw new Error('파일 목록을 가져올 수 없습니다.');
            }
            
            const fileList = await response.json();
            const { csvFiles, processed } = await this.processCSVFiles(fileList.files);
            
            // 데이터 캐싱
            if (processed > 0) {
                await this.cacheCSVData(csvFiles);
                const narrativeCount = await OfflineStorage.getCount();
                
                return {
                    success: true,
                    cached: false,
                    fileCount: processed,
                    narrativeCount
                };
            } else {
                return {
                    success: false,
                    message: 'CSV 파일을 찾을 수 없습니다.'
                };
            }
        } catch (error) {
            console.error('CSV 캐시 갱신 실패:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// 페이지 로드 시 CSV 캐시 갱신
document.addEventListener('DOMContentLoaded', async function() {
    // 5초 후 캐시 갱신 시작 (페이지 로드 완료 후)
    setTimeout(async function() {
        console.log("CSV 데이터 로컬 캐싱 시작");
        try {
            const result = await OfflineCache.refreshCSVCache();
            if (result.success) {
                if (result.cached) {
                    console.log(`저장된 CSV 파일 ${result.fileCount}개를 사용합니다.`);
                } else {
                    console.log(`${result.fileCount}개의 CSV 파일을 로컬에 저장했습니다. (${result.narrativeCount} 바이트)`);
                }
            } else {
                console.error("CSV 캐싱 실패:", result.message || result.error);
            }
        } catch (error) {
            console.error("CSV 캐싱 중 오류 발생:", error);
        }
    }, 5000);
});

// 전역 객체에 등록
window.OfflineCache = OfflineCache;