/**
 * SHB-NetBot 간소화된 오프라인 모드 지원
 * 통합 오프라인 시스템과 연동하여 IndexedDB 및 localStorage 기반 오프라인 검색 제공
 */

// 전역 네임스페이스로 노출
window.offlineHelper = {
    // 저장소 키
    STORAGE_KEY: 'shb_netbot_offline_data',
    DOCUMENTS_CACHE_KEY: 'shb_netbot_documents_cache',
    isOfflineForced: false,  // 강제 오프라인 모드 플래그
    
    // 문서 데이터 가져오기
    fetchDocumentsData: async function() {
        try {
            console.log('업로드된 문서 데이터 불러오기 시작');
            
            // 문서 목록 가져오기
            const response = await fetch('/api/documents', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`문서 목록 가져오기 오류: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.files || data.files.length === 0) {
                console.log('업로드된 문서가 없습니다.');
                return [];
            }
            
            console.log(`${data.files.length}개 문서를 찾았습니다.`);
            
            // 각 문서의 내용 가져오기
            const documentData = [];
            
            for (const file of data.files) {
                try {
                    const viewResponse = await fetch(`/api/documents/view/${file.system_filename}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        cache: 'no-cache'
                    });
                    
                    if (!viewResponse.ok) {
                        console.warn(`${file.filename} 내용 가져오기 실패: ${viewResponse.status}`);
                        continue;
                    }
                    
                    const viewData = await viewResponse.json();
                    
                    if (viewData.content) {
                        // 문서 내용 요약 (최대 500자)
                        const summary = viewData.content.substring(0, 500) + (viewData.content.length > 500 ? '...' : '');
                        
                        documentData.push({
                            query: `${file.filename} 내용 알려줘`,
                            response: `[문서: ${file.filename}]\n\n${summary}`,
                            metadata: {
                                filename: file.filename,
                                file_type: file.file_type,
                                system_filename: file.system_filename
                            }
                        });
                        
                        // 문서 제목 관련 질문
                        documentData.push({
                            query: `${file.filename.split('.')[0]} 관련 정보`,
                            response: `[문서: ${file.filename}]\n\n${summary}`,
                            metadata: {
                                filename: file.filename,
                                file_type: file.file_type,
                                system_filename: file.system_filename
                            }
                        });
                        
                        console.log(`${file.filename} 문서 처리 완료`);
                    }
                } catch (err) {
                    console.error(`${file.filename} 처리 중 오류:`, err);
                }
            }
            
            console.log(`총 ${documentData.length}개 문서 데이터 처리 완료`);
            return documentData;
        } catch (error) {
            console.error('문서 데이터 가져오기 중 오류:', error);
            return [];
        }
    },
    
    // CSV 데이터 가져오기
    fetchCSVData: async function() {
        try {
            console.log('CSV 데이터 로컬 캐싱 시작');
            
            // 최근에 업데이트된 데이터가 있는지 확인
            const csvTimestamp = localStorage.getItem('shb_netbot_csv_timestamp');
            const now = Date.now();
            
            // 캐시 데이터가 있고, 12시간 이내에 업데이트된 경우 재사용
            if (csvTimestamp && (now - parseInt(csvTimestamp) < 12 * 60 * 60 * 1000)) {
                console.log('최근에 업데이트된 CSV 데이터가 있습니다. 재사용합니다.');
                const csvFiles = JSON.parse(localStorage.getItem('shb_netbot_csv_files') || '[]');
                console.log(`저장된 CSV 파일 ${csvFiles.length}개를 사용합니다.`);
                return this.processCSVData(csvFiles);
            }
            
            // 문서 목록 가져오기
            const response = await fetch('/api/documents', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`문서 목록 가져오기 오류: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.files || data.files.length === 0) {
                console.log('업로드된 문서가 없습니다.');
                return [];
            }
            
            // CSV 파일만 필터링
            const csvFiles = data.files.filter(file => 
                file.filename.toLowerCase().endsWith('.csv') && 
                !file.filename.startsWith('test') &&
                file.size > 0
            );
            
            if (csvFiles.length === 0) {
                console.log('CSV 파일이 없습니다.');
                return [];
            }
            
            console.log(`${csvFiles.length}개 CSV 파일을 처리합니다.`);
            
            // 각 CSV 파일의 내용 가져오기
            const processedFiles = [];
            
            for (const file of csvFiles) {
                try {
                    const viewResponse = await fetch(`/api/documents/view/${file.system_filename}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        cache: 'no-cache'
                    });
                    
                    if (!viewResponse.ok) {
                        console.warn(`${file.filename} 내용 가져오기 실패: ${viewResponse.status}`);
                        continue;
                    }
                    
                    const viewData = await viewResponse.json();
                    
                    if (viewData.content) {
                        // CSV 데이터 저장
                        processedFiles.push({
                            filename: file.filename,
                            system_filename: file.system_filename,
                            content: viewData.content,
                            metadata: {
                                file_type: 'csv',
                                uploaded_at: file.uploaded_at
                            }
                        });
                        
                        console.log(`${file.filename} CSV 파일 처리 완료`);
                    }
                } catch (err) {
                    console.error(`${file.filename} 처리 중 오류:`, err);
                }
            }
            
            // 처리된 CSV 파일 정보 저장
            if (processedFiles.length > 0) {
                localStorage.setItem('shb_netbot_csv_files', JSON.stringify(processedFiles));
                localStorage.setItem('shb_netbot_csv_timestamp', now.toString());
                console.log(`${processedFiles.length}개 CSV 파일 데이터가 오프라인 캐시에 저장되었습니다.`);
                return this.processCSVData(processedFiles);
            }
            
            return [];
        } catch (error) {
            console.error('CSV 데이터 가져오기 중 오류:', error);
            return [];
        }
    },
    
    // CSV 데이터를 오프라인 검색용 데이터로 변환
    processCSVData: function(csvFiles) {
        const result = [];
        
        for (const file of csvFiles) {
            try {
                // 파일명에서 카테고리 추출
                const fileCategory = file.filename.split('(')[1]?.split(')')[0] || '';
                const baseFilename = file.filename.split('(')[0].trim();
                
                // CSV 콘텐츠를 파싱
                const lines = file.content.split('\n');
                if (lines.length < 2) continue;  // 헤더만 있는 경우 스킵
                
                const headers = lines[0].split(',');
                
                // 각 행에 대해 처리
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;  // 빈 행 스킵
                    
                    const values = lines[i].split(',');
                    const rowData = {};
                    
                    // 헤더와 값 매핑
                    for (let j = 0; j < headers.length; j++) {
                        if (j < values.length) {
                            rowData[headers[j]] = values[j];
                        }
                    }
                    
                    // 카테고리별 질문-응답 생성
                    if (fileCategory === 'IP_사용자_조회') {
                        // IP 주소가 있으면 IP 관련 질문-응답 생성
                        if (values[0] && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(values[0])) {
                            const ip = values[0];
                            const dept = values[2] || '부서 정보 없음';
                            const user = values[1] || '사용자 정보 없음';
                            const contact = values[3] || '연락처 정보 없음';
                            const status = values[4] || '상태 정보 없음';
                            const lastAccess = values[5] || '접속 정보 없음';
                            
                            result.push({
                                query: `${ip} 정보`,
                                response: `## IP 주소 정보 조회 결과\n\n${ip}는 ${dept} ${user}님이 사용 중입니다. 연락처는 ${contact}이며, 현재 상태는 ${status}입니다. 최종 접속일은 ${lastAccess}입니다.\n\n`,
                                metadata: {
                                    category: 'IP_사용자_조회',
                                    ip: ip,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                            
                            result.push({
                                query: `${ip}`,
                                response: `## IP 주소 정보 조회 결과\n\n${ip}는 ${dept} ${user}님이 사용 중입니다. 연락처는 ${contact}이며, 현재 상태는 ${status}입니다. 최종 접속일은 ${lastAccess}입니다.\n\n`,
                                metadata: {
                                    category: 'IP_사용자_조회',
                                    ip: ip,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                        }
                    } else if (fileCategory === '대외계_연동') {
                        // 대외계 연동 정보
                        if (values[0]) {
                            const systemName = values[0];
                            const ip = values[1] || 'IP 정보 없음';
                            const port = values[2] || '포트 정보 없음';
                            const method = values[3] || '접속 방법 정보 없음';
                            
                            result.push({
                                query: `${systemName} 연동`,
                                response: `## 대외계 연동 정보\n\n${systemName}에 연결하려면 IP ${ip}, 포트 ${port}를 사용하세요. 접속 방법: ${method}\n\n`,
                                metadata: {
                                    category: '대외계_연동',
                                    system: systemName,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                            
                            result.push({
                                query: `${systemName} 접속`,
                                response: `## 대외계 연동 정보\n\n${systemName}에 연결하려면 IP ${ip}, 포트 ${port}를 사용하세요. 접속 방법: ${method}\n\n`,
                                metadata: {
                                    category: '대외계_연동',
                                    system: systemName,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                        }
                    } else if (fileCategory === '장애_문의') {
                        // 장애 유형별 대응 방법
                        if (values[0]) {
                            const issueType = values[0];
                            const symptoms = values[1] || '증상 정보 없음';
                            const solution = values[2] || '해결 방법 정보 없음';
                            const contact = values[3] || '담당자 정보 없음';
                            
                            result.push({
                                query: `${issueType} 장애`,
                                response: `## 장애 대응 방법\n\n${issueType} 장애 증상: ${symptoms}\n\n해결 방법: ${solution}\n\n담당자: ${contact}\n\n`,
                                metadata: {
                                    category: '장애_문의',
                                    issue: issueType,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                            
                            result.push({
                                query: `${issueType} 문제`,
                                response: `## 장애 대응 방법\n\n${issueType} 장애 증상: ${symptoms}\n\n해결 방법: ${solution}\n\n담당자: ${contact}\n\n`,
                                metadata: {
                                    category: '장애_문의',
                                    issue: issueType,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                        }
                    } else if (fileCategory === '절차_안내') {
                        // 업무 절차 안내
                        if (values[0]) {
                            const taskName = values[0];
                            const procedure = values[1] || '절차 정보 없음';
                            const requirements = values[2] || '필요 요건 정보 없음';
                            const notes = values[3] || '참고사항 없음';
                            
                            result.push({
                                query: `${taskName} 절차`,
                                response: `## 업무 절차 안내\n\n${taskName} 절차:\n${procedure}\n\n필요 요건: ${requirements}\n\n참고사항: ${notes}\n\n`,
                                metadata: {
                                    category: '절차_안내',
                                    task: taskName,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                            
                            result.push({
                                query: `${taskName} 방법`,
                                response: `## 업무 절차 안내\n\n${taskName} 절차:\n${procedure}\n\n필요 요건: ${requirements}\n\n참고사항: ${notes}\n\n`,
                                metadata: {
                                    category: '절차_안내',
                                    task: taskName,
                                    filename: file.filename,
                                    source: 'csv'
                                }
                            });
                        }
                    }
                }
                
                // 카테고리에 대한 일반적인 질문 추가
                if (fileCategory) {
                    let categoryDescription = '';
                    let categoryQuery = '';
                    
                    switch (fileCategory) {
                        case 'IP_사용자_조회':
                            categoryDescription = 'IP 주소로 사용자 정보를 조회할 수 있습니다. 조회하려는 IP 주소를 알려주세요.';
                            categoryQuery = 'IP 사용자 조회';
                            break;
                        case '대외계_연동':
                            categoryDescription = '대외 시스템 연동 정보를 제공합니다. 연결하려는 시스템 이름을 알려주세요.';
                            categoryQuery = '대외계 연동';
                            break;
                        case '장애_문의':
                            categoryDescription = '네트워크 장애 유형별 대응 방법을 안내합니다. 발생한 장애 유형을 알려주세요.';
                            categoryQuery = '장애 문의';
                            break;
                        case '절차_안내':
                            categoryDescription = '업무 절차에 대한 안내를 제공합니다. 알고 싶은 업무 절차를 알려주세요.';
                            categoryQuery = '절차 안내';
                            break;
                    }
                    
                    if (categoryDescription) {
                        result.push({
                            query: categoryQuery,
                            response: `## ${categoryQuery}\n\n${categoryDescription}`,
                            metadata: {
                                category: fileCategory,
                                filename: file.filename,
                                source: 'csv'
                            }
                        });
                    }
                }
                
            } catch (err) {
                console.error(`CSV 처리 중 오류 (${file.filename}):`, err);
            }
        }
        
        console.log(`CSV 파일로부터 ${result.length}개 질의응답 데이터 생성`);
        return result;
    },
    
    // 데이터 초기화
    initialize: async function() {
        console.log('오프라인 데이터 초기화 시작');
        
        try {
            // 최근에 업데이트된 문서 데이터가 있는지 확인
            const cachedTimestamp = localStorage.getItem(this.DOCUMENTS_CACHE_KEY + '_timestamp');
            const now = Date.now();
            
            // 캐시 데이터가 있고, 24시간 이내에 업데이트된 경우 재사용
            if (cachedTimestamp && (now - parseInt(cachedTimestamp) < 24 * 60 * 60 * 1000)) {
                console.log('최근에 업데이트된 문서 데이터를 사용합니다.');
                
                // CSV 데이터 처리
                await this.fetchCSVData();
                return;
            }
            
            // 업로드된 문서 데이터 가져오기
            const documentData = await this.fetchDocumentsData();
            
            // CSV 데이터 가져오기
            const csvData = await this.fetchCSVData();
            
            // 모든 데이터 합치기
            const allData = [...documentData, ...csvData];
            
            if (allData.length > 0) {
                // 문서 데이터 저장
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
                // 캐시 타임스탬프 업데이트
                localStorage.setItem(this.DOCUMENTS_CACHE_KEY + '_timestamp', now.toString());
                console.log(`${allData.length}개 문서 데이터가 오프라인 캐시에 저장되었습니다.`);
            } else {
                console.log('저장할 문서 데이터가 없습니다.');
                
                // 기존 데이터가 없는 경우 기본 메시지 설정
                if (!localStorage.getItem(this.STORAGE_KEY)) {
                    const defaultData = [{
                        query: "도움말",
                        response: "현재 오프라인 모드입니다. 업로드된 문서에 대한 질문만 응답 가능합니다."
                    }];
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(defaultData));
                }
            }
        } catch (error) {
            console.error('오프라인 데이터 초기화 중 오류:', error);
            
            // 오류 발생 시 기본 데이터 확인
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                const defaultData = [{
                    query: "도움말",
                    response: "현재 오프라인 모드입니다. 업로드된 문서에 대한 질문만 응답 가능합니다."
                }];
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(defaultData));
            }
        }
    },
    
    // 강화된 오프라인 검색 (IndexedDB + localStorage 통합)
    search: function(query) {
        // 1. 기본 localStorage 데이터 가져오기
        const baseData = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        
        // 2. IndexedDB 동기화 데이터 가져오기 (csvOfflineData)
        const csvData = JSON.parse(localStorage.getItem('csvOfflineData') || '[]');
        
        // 3. 모든 데이터 통합
        const allData = [...baseData, ...csvData];
        
        console.log(`오프라인 검색 - 총 ${allData.length}개 항목 (기본: ${baseData.length}, CSV: ${csvData.length})`);
        
        if (allData.length === 0) {
            return null;
        }
        
        // 정규화된 쿼리
        const normalizedQuery = query.toLowerCase().trim();
        
        // IP 주소 검색 우선 처리
        const ipMatch = normalizedQuery.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        if (ipMatch) {
            const ipAddress = ipMatch[0];
            console.log(`IP 주소 검색: ${ipAddress}`);
            
            // IP 주소 관련 데이터 검색
            const ipResults = allData.filter(item => {
                const content = [
                    item.query || '',
                    item.response || '',
                    JSON.stringify(item.metadata || {})
                ].join(' ').toLowerCase();
                
                return content.includes(ipAddress);
            });
            
            if (ipResults.length > 0) {
                console.log(`IP 주소 ${ipAddress} 검색 결과 발견: ${ipResults.length}개`);
                return this.formatOfflineResponse(ipResults[0].response);
            }
        }
        
        // 파일명 정확 매칭 검색
        for (const item of allData) {
            if (item.metadata && item.metadata.filename) {
                const filename = item.metadata.filename.toLowerCase();
                if (normalizedQuery.includes(filename.split('.')[0])) {
                    return this.formatOfflineResponse(item.response);
                }
            }
        }
        
        // 쿼리 단어 추출 (2글자 이상 단어만)
        const queryWords = normalizedQuery.split(/[\s,.?!]+/).filter(word => word.length >= 2);
        
        // 각 항목에 대한 점수 계산
        const scoredResults = allData.map(item => {
            const itemQuery = item.query ? item.query.toLowerCase() : '';
            const itemResponse = item.response ? item.response.toLowerCase() : '';
            let score = 0;
            
            // 전체 쿼리가 포함된 경우 높은 점수
            if (itemQuery.includes(normalizedQuery)) score += 5;
            if (itemResponse.includes(normalizedQuery)) score += 3;
            
            // 개별 단어 매칭
            for (const word of queryWords) {
                if (itemQuery.includes(word)) score += 2;
                if (itemResponse.includes(word)) score += 1;
            }
            
            // 메타데이터 매칭
            if (item.metadata) {
                const metaContent = JSON.stringify(item.metadata).toLowerCase();
                for (const word of queryWords) {
                    if (metaContent.includes(word)) score += 2;
                }
                
                // 카테고리 매칭
                if (item.metadata.category) {
                    const category = item.metadata.category.toLowerCase();
                    for (const word of queryWords) {
                        if (category.includes(word)) score += 3;
                    }
                }
            }
            
            return { item, score };
        });
        
        // 점수에 따라 정렬
        scoredResults.sort((a, b) => b.score - a.score);
        
        // 결과 로깅
        if (scoredResults.length > 0) {
            console.log(`검색 결과: 최고 점수 ${scoredResults[0].score}, 총 ${scoredResults.filter(r => r.score > 0).length}개 항목 매칭`);
        }
        
        // 가장 높은 점수의 결과 반환 (최소 점수 임계값 적용)
        if (scoredResults.length > 0 && scoredResults[0].score >= 1) {
            return this.formatOfflineResponse(scoredResults[0].item.response);
        }
        
        // 적절한 결과가 없으면 null 반환
        return null;
    },
    
    // 오프라인 응답 포맷
    formatOfflineResponse: function(response) {
        return "[🔴 서버 연결이 끊겼습니다. 업로드된 문서 데이터로 응답 중입니다]\n\n" + response;
    },
    
    // 오프라인 응답 확인 (디버깅용)
    getOfflineStatus: function() {
        return {
            mode: localStorage.getItem('offline_test_mode') === 'true' ? 'offline_test' : 'normal',
            dataCount: JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]').length,
            documentsCache: localStorage.getItem(this.DOCUMENTS_CACHE_KEY) !== null
        };
    },
    
    // 온라인 응답 저장
    saveResponse: function(query, response) {
        try {
            // 기존 데이터 가져오기
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            
            // 중복 제거 (동일한 쿼리가 있으면 제거)
            const filteredData = data.filter(item => !item.query || item.query.toLowerCase() !== query.toLowerCase());
            
            // 새 데이터 추가
            filteredData.push({ 
                query, 
                response,
                metadata: {
                    source: "온라인 응답 캐시",
                    timestamp: Date.now()
                }
            });
            
            // 데이터 저장 (최대 200개 항목으로 제한)
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredData.slice(-200)));
            
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