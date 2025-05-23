document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 참조
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatContainer = document.getElementById('chatContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const sendButton = document.getElementById('sendButton');
    const themeToggle = document.getElementById('theme-toggle');
    const navbar = document.querySelector('.navbar');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navLinkItems = document.querySelectorAll('.nav-link');
    const minimizeChat = document.querySelector('.minimize-chat');
    const connectionStatus = document.getElementById('connection-status');
    
    // AOS(Animate On Scroll) 초기화
    AOS.init({
        duration: 800,
        easing: 'ease',
        once: false,
        mirror: false
    });
    
    // 연결 상태 확인 및 표시 함수
    function checkConnectionStatus() {
        // 먼저 브라우저의 navigator.onLine 속성으로 연결 상태 확인
        const isOnline = navigator.onLine;
        
        // 오프라인 테스트 모드인 경우 강제로 오프라인 상태로 처리
        if (localStorage.getItem('offline_test_mode') === 'true') {
            console.log('오프라인 테스트 모드 활성화됨');
            updateConnectionUI(false);
            return;
        }
        
        // 서버에 연결 상태 확인 API 호출 (더 정확한 확인을 위해)
        fetch('/api/connection_status', { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-cache'
        })
        .then(response => response.json())
        .then(data => {
            console.log('서버 연결 상태:', data);
            updateConnectionUI(data.status === 'online');
        })
        .catch(error => {
            // API 호출 실패하면 브라우저의 navigator.onLine을 사용
            updateConnectionUI(isOnline);
        });
    }
    
    // CSV 데이터 로컬 스토리지 키
    const LOCAL_CSV_DATA_KEY = 'shb_netbot_csv_data';
    const LOCAL_CSV_LAST_UPDATE = 'shb_netbot_csv_last_update';
    
    // CSV 데이터 가져와서 로컬 스토리지에 저장
    async function fetchAndCacheCSVData() {
        console.log('CSV 데이터 로컬 캐싱 시작');
        
        try {
            // 마지막 업데이트 시간 확인 (1시간마다 갱신)
            const lastUpdate = localStorage.getItem(LOCAL_CSV_LAST_UPDATE);
            const now = new Date().getTime();
            
            // 이미 저장된 데이터가 있는지 확인
            const existingData = localStorage.getItem(LOCAL_CSV_DATA_KEY);
            
            // 업데이트가 필요한 경우 - 저장된 데이터가 없거나 1시간 지난 경우
            if (!existingData || !lastUpdate || (now - parseInt(lastUpdate) >= 3600000)) {
                // 서버에서 문서 목록 가져오기
                try {
                    const response = await fetch('/api/documents', {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        cache: 'no-cache',
                        timeout: 5000 // 5초 타임아웃
                    });
                    
                    if (!response.ok) {
                        throw new Error(`서버 응답 오류: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.files && data.files.length > 0) {
                        // CSV 파일만 필터링
                        const csvFiles = data.files.filter(file => 
                            file.filename.toLowerCase().endsWith('.csv')
                        );
                        
                        console.log(`${csvFiles.length}개의 CSV 파일을 찾았습니다.`);
                        
                        if (csvFiles.length === 0) {
                            console.log('CSV 파일이 없습니다.');
                            return;
                        }
                        
                        // 각 CSV 파일의 내용 가져오기
                        const csvDataPromises = csvFiles.map(async file => {
                            try {
                                const viewResponse = await fetch(`/api/documents/view/${file.system_filename}`, {
                                    method: 'GET',
                                    headers: { 'Content-Type': 'application/json' },
                                    cache: 'no-cache',
                                    timeout: 5000 // 5초 타임아웃
                                });
                                
                                if (!viewResponse.ok) {
                                    throw new Error(`파일 조회 오류: ${viewResponse.status}`);
                                }
                                
                                const viewData = await viewResponse.json();
                                
                                if (viewData.content) {
                                    // CSV 데이터 처리 및 반환
                                    const records = processCSVContent(viewData.content);
                                    console.log(`${file.filename}: ${records.length}개 레코드 처리됨`);
                                    
                                    return {
                                        filename: file.filename,
                                        system_filename: file.system_filename,
                                        content: viewData.content,
                                        records: records
                                    };
                                }
                                return null;
                            } catch (error) {
                                console.error(`파일 가져오기 오류: ${file.filename}`, error);
                                return null;
                            }
                        });
                        
                        // 모든 CSV 파일 데이터 기다리기
                        const csvDataResults = await Promise.all(csvDataPromises);
                        const csvData = csvDataResults.filter(item => item !== null);
                        
                        if (csvData.length > 0) {
                            // 로컬 스토리지에 저장
                            try {
                                const jsonData = JSON.stringify(csvData);
                                localStorage.setItem(LOCAL_CSV_DATA_KEY, jsonData);
                                localStorage.setItem(LOCAL_CSV_LAST_UPDATE, now.toString());
                                
                                // 저장 확인
                                const savedData = localStorage.getItem(LOCAL_CSV_DATA_KEY);
                                if (savedData) {
                                    console.log(`${csvData.length}개의 CSV 파일을 로컬에 저장했습니다. (${jsonData.length} 바이트)`);
                                    
                                    // 테스트 목적으로 첫 번째 파일 데이터 출력
                                    if (csvData[0] && csvData[0].records) {
                                        console.log(`첫 번째 파일 샘플 레코드: ${csvData[0].records.length}개`);
                                    }
                                } else {
                                    console.error('로컬 스토리지 저장 실패');
                                }
                            } catch (storageError) {
                                console.error('로컬 스토리지 저장 중 오류:', storageError);
                                
                                // 스토리지 용량 초과 가능성이 있으므로 일부 데이터만 저장
                                if (storageError.name === 'QuotaExceededError') {
                                    // 처음 2개 파일만 저장 시도
                                    const reducedData = csvData.slice(0, 2);
                                    try {
                                        localStorage.setItem(LOCAL_CSV_DATA_KEY, JSON.stringify(reducedData));
                                        localStorage.setItem(LOCAL_CSV_LAST_UPDATE, now.toString());
                                        console.log('용량 제한으로 일부 CSV 파일만 저장했습니다.');
                                    } catch (e) {
                                        console.error('축소된 데이터도 저장 실패:', e);
                                    }
                                }
                            }
                        } else {
                            console.log('저장할 유효한 CSV 데이터가 없습니다.');
                        }
                    } else {
                        console.log('서버에 문서가 없거나 응답이 비어있습니다.');
                    }
                } catch (fetchError) {
                    console.error('서버에서 문서 가져오기 실패:', fetchError);
                    
                    // 오프라인 상태로 판단하고 기존 캐시 데이터 유지
                    if (existingData) {
                        console.log('오프라인 상태입니다. 기존 캐시 데이터를 사용합니다.');
                    }
                }
            } else {
                console.log('최근에 업데이트된 CSV 데이터가 있습니다. 재사용합니다.');
                
                // 저장된 데이터 확인
                try {
                    const savedData = JSON.parse(localStorage.getItem(LOCAL_CSV_DATA_KEY));
                    console.log(`저장된 CSV 파일 ${savedData.length}개를 사용합니다.`);
                } catch (e) {
                    console.error('저장된 데이터 확인 중 오류:', e);
                }
            }
        } catch (error) {
            console.error('CSV 데이터 캐싱 중 오류:', error);
        }
    }
    
    // CSV 문자열을 레코드 배열로 변환
    function processCSVContent(csvContent) {
        if (!csvContent) return [];
        
        const lines = csvContent.split('\n');
        if (lines.length < 2) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const records = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',').map(v => v.trim());
            const record = {};
            
            headers.forEach((header, index) => {
                record[header] = index < values.length ? values[index] : '';
            });
            
            records.push(record);
        }
        
        return records;
    }
    
    // 로컬 데이터에서 쿼리에 맞는 응답 찾기
    function getLocalResponse(query) {
        // 로컬 데이터 확인
        const csvDataString = localStorage.getItem(LOCAL_CSV_DATA_KEY);
        if (!csvDataString) {
            console.error('로컬에 저장된 CSV 데이터가 없습니다. 강제로 데이터 로드를 시도합니다.');
            // 강제로 로컬 데이터 로드 시도 (비동기 함수지만 바로 호출)
            fetchAndCacheCSVData();
            return '로컬 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.';
        }
        
        // IP 주소 패턴 검색
        const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
        const ipMatch = query.match(ipPattern);
        
        if (ipMatch) {
            const targetIp = ipMatch[0];
            console.log(`IP 주소 ${targetIp}에 대한 로컬 검색 시작`);
            const ipResponse = searchIpInLocalData(targetIp);
            if (ipResponse) {
                return ipResponse;
            }
        }
        
        // 키워드 검색 (2글자 이상 단어만)
        const keywords = query.split(/\s+/).filter(word => word.length >= 2);
        if (keywords.length > 0) {
            console.log(`키워드 검색 시작: ${keywords.join(', ')}`);
            const keywordResponse = searchKeywordsInLocalData(keywords);
            if (keywordResponse) {
                return keywordResponse;
            }
        }
        
        return null;
    }
    
    // 로컬 CSV 데이터에서 IP 주소 검색 - 자연어 응답 생성
    function searchIpInLocalData(ipAddress) {
        try {
            const csvDataString = localStorage.getItem(LOCAL_CSV_DATA_KEY);
            if (!csvDataString) return null;
            
            const csvData = JSON.parse(csvDataString);
            
            // 디버깅용 로그
            console.log(`IP 주소 ${ipAddress} 검색 시작, 로컬 CSV 파일 ${csvData.length}개 대상`);
            
            // 결과를 직접 문자열로 생성 (formatIpRecord 함수 대신)
            let foundRecord = null;
            let sourceFilename = "";
            
            // 모든 CSV 파일 검색
            for (const file of csvData) {
                // IP 주소 관련 파일 우선 검색
                const isIpFile = file.filename.includes('IP') || 
                                file.filename.includes('ip') || 
                                file.filename.includes('사용자');
                
                if (isIpFile) {
                    for (const record of file.records) {
                        // 각 레코드의 모든 필드 검색 - 정확한 필드명 매칭 추가
                        for (const [key, value] of Object.entries(record)) {
                            if (typeof value === 'string' && value === ipAddress) {
                                // 정확한 IP 주소 일치
                                foundRecord = record;
                                sourceFilename = file.filename;
                                console.log(`IP 주소 ${ipAddress} 레코드 찾음:`, record);
                                break;
                            } else if (typeof value === 'string' && value.includes(ipAddress)) {
                                // IP 주소가 포함된 경우
                                foundRecord = record;
                                sourceFilename = file.filename;
                                console.log(`IP 주소 ${ipAddress} 포함 레코드 찾음:`, record);
                                break;
                            }
                        }
                        if (foundRecord) break;
                    }
                }
                if (foundRecord) break;
            }
            
            // IP 파일에서 찾지 못한 경우 다른 모든 파일 검색
            if (!foundRecord) {
                for (const file of csvData) {
                    for (const record of file.records) {
                        for (const [key, value] of Object.entries(record)) {
                            if (typeof value === 'string' && (value === ipAddress || value.includes(ipAddress))) {
                                foundRecord = record;
                                sourceFilename = file.filename;
                                console.log(`다른 파일에서 IP 주소 ${ipAddress} 레코드 찾음:`, record);
                                break;
                            }
                        }
                        if (foundRecord) break;
                    }
                    if (foundRecord) break;
                }
            }
            
            // 레코드를 찾았으면 자연어 응답 생성
            if (foundRecord) {
                // IP 보관은 특수 케이스 처리
                const rawIpAddr = ipAddress || foundRecord['IP 주소'] || foundRecord['IP주소'] || foundRecord['IP'] || '';
                
                // A:, B: 형식 매핑 (주의: 대소문자 구분)
                const fieldMap = {
                    'A': '사용자명', 'B': '부서', 'C': '연락처', 'D': '상태', 
                    'E': '최종 접속일', 'F': '비고', 'G': '최종 수정일'
                };
                
                // 모든 필드에서 정보 추출 시도
                let extractedData = {};
                
                // 원본 필드명이나 A,B,C 매핑으로 데이터 추출
                for (const [key, value] of Object.entries(foundRecord)) {
                    if (!value) continue;
                    
                    // 대소문자 구분 없이 필드명 매칭
                    const lowerKey = key.toLowerCase();
                    
                    // 원래 필드명으로 매핑
                    if (lowerKey.includes('사용자') || lowerKey.includes('이름') || lowerKey.includes('담당자')) {
                        extractedData['사용자명'] = value;
                    } else if (lowerKey.includes('부서') || lowerKey.includes('팀') || lowerKey.includes('소속')) {
                        extractedData['부서'] = value;
                    } else if (lowerKey.includes('연락처') || lowerKey.includes('전화')) {
                        extractedData['연락처'] = value;
                    } else if (lowerKey.includes('상태')) {
                        extractedData['상태'] = value;
                    } else if (lowerKey.includes('접속일') || lowerKey.includes('날짜') || lowerKey.includes('일시')) {
                        extractedData['최종 접속일'] = value;
                    } else if (lowerKey.includes('비고') || lowerKey.includes('메모') || lowerKey.includes('참고')) {
                        extractedData['비고'] = value;
                    } else if (lowerKey.includes('수정일')) {
                        extractedData['최종 수정일'] = value;
                    }
                    
                    // A, B, C 매핑으로 추가 시도
                    if (key.length === 1 && fieldMap[key]) {
                        extractedData[fieldMap[key]] = value;
                    }
                }
                
                // 추출한 데이터로 자연어 문장 생성
                const user = extractedData['사용자명'] || '';
                const dept = extractedData['부서'] || '';
                const contact = extractedData['연락처'] || '';
                const status = extractedData['상태'] || '사용 중';
                const date = extractedData['최종 접속일'] || '';
                const notes = extractedData['비고'] || '';
                const updatedDate = extractedData['최종 수정일'] || '';
                
                // 자연어 응답 구성
                let response = '';
                
                if (dept && user) {
                    if (status === '사용 중' || status === '정상') {
                        response = `IP 주소 정보 조회 결과\n${rawIpAddr}는 ${dept} ${user}님이 사용 중입니다.`;
                    } else {
                        response = `IP 주소 정보 조회 결과\n${rawIpAddr}는 ${dept} ${user}님이 ${status} 상태입니다.`;
                    }
                } else if (user) {
                    if (status === '사용 중' || status === '정상') {
                        response = `IP 주소 정보 조회 결과\n${rawIpAddr}는 ${user}님이 사용 중입니다.`;
                    } else {
                        response = `IP 주소 정보 조회 결과\n${rawIpAddr}는 ${user}님이 ${status} 상태입니다.`;
                    }
                } else if (dept) {
                    response = `IP 주소 정보 조회 결과\n${rawIpAddr}는 ${dept}에서 관리하는 IP입니다.`;
                    if (status !== '사용 중' && status !== '정상') {
                        response += ` 현재 ${status} 상태입니다.`;
                    }
                } else {
                    response = `IP 주소 정보 조회 결과\n${rawIpAddr}에 대한 정보를 찾았습니다.`;
                }
                
                // 추가 정보를 필요에 따라 순서대로 추가
                if (contact && !response.includes(contact)) {
                    response += ` 연락처는 ${contact}입니다.`;
                }
                
                if (date && !response.includes(date)) {
                    response += ` 최근 접속일은 ${date}입니다.`;
                }
                
                if (notes && notes !== '없음' && !response.includes(notes)) {
                    if (notes.includes('차단') || notes.includes('만료') || notes.includes('경고')) {
                        response += ` 주의: ${notes}`;
                    } else {
                        response += ` 참고사항: ${notes}`;
                    }
                }
                
                // 마지막 수정일 정보 추가 (보통 생략)
                if (updatedDate && sourceFilename.includes('관리') && !response.includes(updatedDate)) {
                    response += ` (${updatedDate} 기준)`;
                }
                
                console.log('최종 생성된 자연어 응답:', response);
                return response;
            }
            
        } catch (error) {
            console.error('로컬 데이터 IP 검색 중 오류:', error);
        }
        
        return null;
    }
    
    // 로컬 CSV 데이터에서 키워드 검색
    function searchKeywordsInLocalData(keywords) {
        try {
            const csvDataString = localStorage.getItem(LOCAL_CSV_DATA_KEY);
            if (!csvDataString) return null;
            
            const csvData = JSON.parse(csvDataString);
            const matchedRecords = [];
            
            // 모든 CSV 파일과 레코드 검색
            for (const file of csvData) {
                for (const record of file.records) {
                    let matchScore = 0;
                    
                    // 각 레코드의 모든 필드를 각 키워드로 검색
                    for (const keyword of keywords) {
                        for (const [key, value] of Object.entries(record)) {
                            if (value && value.includes(keyword)) {
                                matchScore++;
                                break; // 해당 키워드는 이미 매치됨
                            }
                        }
                    }
                    
                    if (matchScore > 0) {
                        matchedRecords.push({
                            record,
                            filename: file.filename,
                            score: matchScore
                        });
                    }
                }
            }
            
            // 점수순으로 정렬하고 상위 3개 결과만 반환
            if (matchedRecords.length > 0) {
                matchedRecords.sort((a, b) => b.score - a.score);
                const topResults = matchedRecords.slice(0, 3);
                
                return formatKeywordResults(topResults, keywords);
            }
        } catch (error) {
            console.error('로컬 데이터 키워드 검색 중 오류:', error);
        }
        
        return null;
    }
    
    // IP 주소 관련 레코드 포맷팅 (자연어 응답)
    function formatIpRecord(record, filename) {
        // 직접 필요한 정보 추출 - 변수명 충돌 제거
        let ipValue = record['IP 주소'] || record['IP'] || '';
        let userName = record['사용자명'] || record['사용자'] || record['이름'] || record['담당자'] || '';
        let deptName = record['부서'] || record['팀'] || record['소속'] || '';
        let contactNumber = record['연락처'] || record['전화번호'] || '';
        let statusValue = record['상태'] || '사용 중';
        let accessDate = record['최종 접속일'] || record['접속일'] || record['날짜'] || '';
        let notesText = record['비고'] || record['메모'] || '';
        
        // A: B: 형식 매핑 (주의: 대소문자 구분)
        const fieldMap = {
            'A': '사용자명', 'B': '부서', 'C': '연락처', 'D': '상태', 
            'E': '최종 접속일', 'F': '비고', 'G': '최종 수정일'
        };
                
        // A, B, C 매핑으로 추가 데이터 추출
        for (const [key, value] of Object.entries(record)) {
            if (!value) continue;
            
            if (key.length === 1 && fieldMap[key]) {
                const mappedField = fieldMap[key];
                
                if (mappedField === '사용자명' && !userName) userName = value;
                if (mappedField === '부서' && !deptName) deptName = value;
                if (mappedField === '연락처' && !contactNumber) contactNumber = value;
                if (mappedField === '상태' && !statusValue) statusValue = value;
                if (mappedField === '최종 접속일' && !accessDate) accessDate = value;
                if (mappedField === '비고' && !notesText) notesText = value;
            }
        }
        
        // 다른 키에서 IP 주소 찾기 (위에서 찾지 못한 경우)
        if (!ipValue) {
            for (const [key, value] of Object.entries(record)) {
                if (typeof value === 'string' && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) {
                    ipValue = value;
                    break;
                }
            }
        }
        
        // 자연어 응답 메시지 생성
        let response = '';
        
        // 정보 기반으로 자연스러운 문장 생성
        if (ipValue) {
            if (deptName && userName) {
                if (statusValue === '사용 중' || statusValue === '정상') {
                    response = `IP ${ipValue}는 ${deptName}의 ${userName} 담당자가 사용 중입니다.`;
                } else {
                    response = `IP ${ipValue}는 ${deptName}의 ${userName} 담당자가 ${statusValue} 상태입니다.`;
                }
            } else if (userName) {
                if (statusValue === '사용 중' || statusValue === '정상') {
                    response = `IP ${ipValue}는 ${userName} 담당자가 사용 중입니다.`;
                } else {
                    response = `IP ${ipValue}는 ${userName} 담당자가 ${statusValue} 상태입니다.`;
                }
            } else if (deptName) {
                response = `IP ${ipValue}는 ${deptName}에서 관리하는 IP입니다.`;
                if (statusValue !== '사용 중' && statusValue !== '정상') {
                    response = `IP ${ipValue}는 ${deptName}에서 관리하며 현재 ${statusValue} 상태입니다.`;
                }
            } else {
                response = `IP ${ipValue}에 대한 정보를 찾았습니다.`;
            }
            
            // 추가 정보를 필요에 따라 순서대로 추가
            if (contactNumber && !response.includes(contactNumber)) {
                response += ` 연락처는 ${contactNumber}입니다.`;
            }
            
            if (accessDate && !response.includes(accessDate)) {
                response += ` 최근 접속일은 ${accessDate}입니다.`;
            }
            
            if (notesText && notesText !== '없음' && !response.includes(notesText)) {
                if (notesText.includes('차단') || notesText.includes('만료') || notesText.includes('경고')) {
                    response += ` 주의: ${notesText}`;
                } else {
                    response += ` 참고사항: ${notesText}`;
                }
            }
        } else {
            // IP 주소가 없는 경우 일반적인 정보 제공
            if (userName && deptName) {
                response = `${deptName}의 ${userName} 담당자`;
                if (statusValue !== '사용 중' && statusValue !== '정상') {
                    response += `는 현재 ${statusValue} 상태입니다.`;
                } else {
                    response += '의 정보입니다.';
                }
                
                // 추가 정보 연결
                if (contactNumber) {
                    response += ` 연락처는 ${contactNumber}입니다.`;
                }
                
                if (accessDate) {
                    response += ` 최근 접속일은 ${accessDate}입니다.`;
                }
            } else {
                // 값이 많이 없는 경우 직접 형식 구성
                const foundValues = [];
                if (userName) foundValues.push(`사용자: ${userName}`);
                if (deptName) foundValues.push(`부서: ${deptName}`);
                if (contactNumber) foundValues.push(`연락처: ${contactNumber}`);
                if (statusValue !== '사용 중') foundValues.push(`상태: ${statusValue}`);
                if (accessDate) foundValues.push(`접속일: ${accessDate}`);
                if (notesText) foundValues.push(`참고: ${notesText}`);
                
                if (foundValues.length > 0) {
                    response = `다음 정보를 찾았습니다: ${foundValues.join(', ')}`;
                } else {
                    response = "요청하신 정보를 찾지 못했습니다.";
                }
            }
        }
        
        // 출처 정보 추가 (마지막에 괄호로)
        if (filename) {
            // 파일명에서 UUID 제거
            const displayName = filename.replace(/^[a-f0-9-]+_/, '').replace(/\.[^.]+$/, '');
            // 너무 긴 파일명은 줄임
            const shortName = displayName.length > 20 ? displayName.substring(0, 17) + '...' : displayName;
            response += ` (출처: ${shortName})`;
        }
        
        return response;
    }
    
    // 일반 레코드 포맷팅 (자연어 응답)
    function formatRecord(record, filename) {
        // IP 주소가 포함된 레코드라면 formatIpRecord 함수로 처리
        for (const [key, value] of Object.entries(record)) {
            if (typeof value === 'string' && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) {
                return formatIpRecord(record, filename);
            }
        }
        
        let response = '';
        
        // 주요 정보 수집
        const entries = Object.entries(record);
        const keyField = entries.length > 0 ? entries[0][0] : '';
        const valueField = entries.length > 0 ? entries[0][1] : '';
        
        // 자연어 문장 시작
        if (valueField) {
            response = `검색하신 "${valueField}"에 대한 정보입니다.`;
        } else {
            response = "요청하신 정보를 찾았습니다.";
        }
        
        // 주요 필드 먼저 처리 (보다 자연스러운 순서로)
        const priorityFields = ['사용자명', '부서', '연락처', '상태', '최종 접속일'];
        let usedKeys = [keyField]; // 첫 번째 필드는 이미 사용
        
        // 우선순위 필드 먼저 처리
        for (const field of priorityFields) {
            for (const [key, value] of entries) {
                if (key.includes(field) && value && !usedKeys.includes(key)) {
                    if (field.includes('사용자')) {
                        response += ` 담당자는 ${value}입니다.`;
                    } else if (field.includes('부서')) {
                        response += ` ${value} 부서 소속입니다.`;
                    } else if (field.includes('연락처')) {
                        response += ` 연락처는 ${value}입니다.`;
                    } else if (field.includes('접속일') || field.includes('날짜')) {
                        response += ` 최근 접속일은 ${value}입니다.`;
                    } else {
                        response += ` ${key}은(는) ${value}입니다.`;
                    }
                    usedKeys.push(key);
                }
            }
        }
        
        // 나머지 필드 처리
        let additionalInfo = [];
        
        for (const [key, value] of entries) {
            if (value && !usedKeys.includes(key)) {
                if (key.includes('비고') || key.includes('메모')) {
                    additionalInfo.push(`참고 사항: ${value}`);
                } else {
                    additionalInfo.push(`${key}은(는) ${value}입니다`);
                }
                usedKeys.push(key);
            }
        }
        
        if (additionalInfo.length > 0) {
            response += ` ${additionalInfo.join('. ')}.`;
        }
        
        if (filename) {
            response += `\n\n출처: ${filename}`;
        }
        
        return response;
    }
    
    // 키워드 검색 결과 포맷팅 (자연어 응답)
    function formatKeywordResults(results, keywords) {
        let response = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다]\n\n';
        response += `"${keywords.join(', ')}" 키워드와 관련된 정보를 찾았습니다.\n\n`;
        
        results.forEach((result, index) => {
            const entries = Object.entries(result.record);
            
            // IP 주소 정보가 포함된 경우 특별 처리
            const hasIpInfo = entries.some(([key, value]) => 
                (typeof value === 'string' && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) || 
                key.toLowerCase().includes('ip')
            );
            
            if (hasIpInfo) {
                // IP 정보를 포함하는 레코드는 전용 포맷터로 처리
                response += formatIpRecord(result.record, result.filename) + '\n\n';
                return;
            }
            
            // A: B: 형식 매핑 (주의: 대소문자 구분)
            const fieldMap = {
                'A': '사용자명', 'B': '부서', 'C': '연락처', 'D': '상태', 
                'E': '최종 접속일', 'F': '비고', 'G': '최종 수정일'
            };
            
            // 일반적인 레코드 처리 - 자연어 문장 생성
            // 주요 필드 추출
            let userName = '', deptName = '', statusValue = '', contactInfo = '', dateInfo = '', noteInfo = '';
            
            // 원본 필드명이나 A/B/C 매핑으로 데이터 추출
            for (const [key, value] of entries) {
                if (!value) continue;
                
                // 대소문자 구분 없이 필드명 매칭
                const lowerKey = key.toLowerCase();
                
                // 원래 필드명으로 매핑
                if (lowerKey.includes('사용자') || lowerKey.includes('이름') || lowerKey.includes('담당자')) {
                    userName = value;
                } else if (lowerKey.includes('부서') || lowerKey.includes('팀') || lowerKey.includes('소속')) {
                    deptName = value;
                } else if (lowerKey.includes('연락처') || lowerKey.includes('전화')) {
                    contactInfo = value;
                } else if (lowerKey.includes('상태')) {
                    statusValue = value;
                } else if (lowerKey.includes('접속일') || lowerKey.includes('날짜') || lowerKey.includes('일시')) {
                    dateInfo = value;
                } else if (lowerKey.includes('비고') || lowerKey.includes('메모') || lowerKey.includes('참고')) {
                    noteInfo = value;
                }
                
                // A, B, C 매핑으로 추가 시도
                if (key.length === 1 && fieldMap[key]) {
                    const mappedField = fieldMap[key];
                    
                    if (mappedField === '사용자명' && !userName) userName = value;
                    if (mappedField === '부서' && !deptName) deptName = value;
                    if (mappedField === '연락처' && !contactInfo) contactInfo = value;
                    if (mappedField === '상태' && !statusValue) statusValue = value;
                    if (mappedField === '최종 접속일' && !dateInfo) dateInfo = value;
                    if (mappedField === '비고' && !noteInfo) noteInfo = value;
                }
            }
            
            // 자연어 문장 구성
            let resultText = '';
            
            // 첫 번째 필드를 제목으로 사용
            const keyField = entries.length > 0 ? entries[0][0] : '';
            const valueField = entries.length > 0 ? entries[0][1] : '';
            
            // 기본 시작 문장
            if (userName && deptName) {
                resultText = `${deptName}의 ${userName} 담당자`;
                if (statusValue && statusValue !== '사용 중' && statusValue !== '정상') {
                    resultText += `는 현재 ${statusValue} 상태입니다.`;
                } else {
                    resultText += '의 정보입니다.';
                }
            } else if (userName) {
                resultText = `${userName} 담당자`;
                if (statusValue && statusValue !== '사용 중' && statusValue !== '정상') {
                    resultText += `는 현재 ${statusValue} 상태입니다.`;
                } else {
                    resultText += '의 정보입니다.';
                }
            } else if (valueField) {
                // 가장 중요한 값으로 시작
                resultText = `"${valueField}"에 대한 정보입니다.`;
            } else {
                resultText = `${index + 1}번째 검색 결과입니다.`;
            }
            
            // 추가 정보
            if (contactInfo && !resultText.includes(contactInfo)) {
                resultText += ` 연락처는 ${contactInfo}입니다.`;
            }
            
            if (dateInfo && !resultText.includes(dateInfo)) {
                resultText += ` 최근 접속일은 ${dateInfo}입니다.`;
            }
            
            if (noteInfo && !resultText.includes(noteInfo)) {
                if (noteInfo.includes('차단') || noteInfo.includes('만료') || noteInfo.includes('경고')) {
                    resultText += ` 주의: ${noteInfo}`;
                } else {
                    resultText += ` 참고사항: ${noteInfo}`;
                }
            }
            
            // 출처 정보 추가
            if (result.filename) {
                // 파일명에서 UUID 제거
                const displayName = result.filename.replace(/^[a-f0-9-]+_/, '').replace(/\.[^.]+$/, '');
                // 너무 긴 파일명은 줄임
                const shortName = displayName.length > 20 ? displayName.substring(0, 17) + '...' : displayName;
                resultText += ` (출처: ${shortName})`;
            }
            
            response += resultText + '\n\n';
        });
        
        return response;
    }
    
    // 연결 상태 UI 업데이트 함수
    function updateConnectionUI(isOnline) {
        console.log('연결 상태 업데이트:', isOnline ? '온라인' : '오프라인');
        
        // 페이지 로드 시 즉시 CSV 데이터 캐싱 시도
        if (!localStorage.getItem(LOCAL_CSV_DATA_KEY)) {
            console.log('최초 실행: CSV 데이터 즉시 캐싱 시도');
            fetchAndCacheCSVData();
        }
        
        // 상태 배지 업데이트
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            if (isOnline) {
                statusBadge.textContent = '온라인';
                statusBadge.className = 'status-badge online';
                
                // 온라인 상태일 때 데이터 캐싱 (시간 간격 체크는 함수 내부에서 수행)
                fetchAndCacheCSVData();
            } else {
                statusBadge.textContent = '오프라인';
                statusBadge.className = 'status-badge offline';
            }
        }
        
        // 네비게이션 바의 로고와 텍스트 관리
        function updateNavLogo() {
            // 로고는 온라인/오프라인 상관없이 일관된 브랜딩 유지
            const logoWrapper = document.querySelector('.logo');
            if (logoWrapper) {
                // 오프라인 클래스 제거하여 일관된 스타일 유지
                logoWrapper.classList.remove('offline');
                
                // SHB-NetBot 텍스트는 항상 기본 색상 유지
                const titleSpan = logoWrapper.querySelector('span');
                if (titleSpan) {
                    titleSpan.style.color = '';
                }
            }
        }
        
        // 즉시 업데이트 실행
        updateNavLogo();
        
        // 오프라인 상태 전체 클래스 토글
        if (isOnline) {
            document.body.classList.remove('offline-mode');
            
            // 모든 로고 이미지 원래대로 복원
            document.querySelectorAll('.logo img').forEach(img => {
                img.style.filter = '';
                // 이미지 소스가 이미 설정되어 있는 경우에는 변경하지 않음
                if (!img.getAttribute('src') || img.getAttribute('src') === '') {
                    img.src = '/static/images/shinhan_logo_refined.svg';
                }
            });
            
            // 모든 SHB-NetBot 텍스트 색상 원래대로 복원
            document.querySelectorAll('.logo span').forEach(span => {
                span.style.color = '';
            });
            
        } else {
            // 오프라인 모드에서도 모든 스타일을 온라인과 동일하게 유지
            document.body.classList.remove('offline-mode');
            
            // 모든 로고 이미지 원래 상태로 유지
            document.querySelectorAll('.logo img').forEach(img => {
                img.style.filter = '';
            });
            
            // 모든 텍스트 색상도 원래 상태로 유지
            document.querySelectorAll('.logo span').forEach(span => {
                span.style.color = '';
            });
        }
    }
    
    // 페이지 로드 완료 시 연결 상태 확인 - 로고는 건드리지 않음
    document.addEventListener('DOMContentLoaded', function() {
        // 연결 상태만 확인하고, 로고 이미지는 건드리지 않음
        checkConnectionStatus();
        
        // 로고 이미지가 로드되는 것을 감시하지 않음 - 이미지는 그대로 유지
        const logoElements = document.querySelectorAll('.logo img');
        logoElements.forEach(img => {
            // 이미지 로드 에러 시 백업 처리
            img.addEventListener('error', function() {
                if (!this.src.includes('shinhan_logo_refined.svg')) {
                    this.src = '/static/images/shinhan_logo_refined.svg';
                }
            });
        });
    });
    
    // 연결 상태 체크 시간 간격 설정 (30초)
    // 로고는 건드리지 않고 상태 정보만 업데이트하는 함수
    function checkConnectionStatusOnly() {
        // 브라우저의 navigator.onLine 속성으로 연결 상태 확인
        const isOnline = navigator.onLine;
        
        // 오프라인 테스트 모드인 경우 강제로 오프라인 상태로 처리
        if (localStorage.getItem('offline_test_mode') === 'true') {
            console.log('오프라인 테스트 모드 활성화됨');
            updateStatusBadge(false);
            return;
        }
        
        // 서버에 연결 상태 확인 API 호출 (더 정확한 확인을 위해)
        fetch('/api/connection_status', { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-cache'
        })
        .then(response => response.json())
        .then(data => {
            console.log('서버 연결 상태:', data);
            updateStatusBadge(data.status === 'online');
        })
        .catch(error => {
            // API 호출 실패하면 브라우저의 navigator.onLine을 사용
            updateStatusBadge(isOnline);
        });
    }
    
    // 상태 배지만 업데이트 (로고 이미지는 건드리지 않음)
    function updateStatusBadge(isOnline) {
        // 상태 배지 업데이트
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            if (isOnline) {
                statusBadge.textContent = '온라인';
                statusBadge.className = 'status-badge online';
                
                // 온라인 상태일 때 데이터 캐싱 (시간 간격 체크는 함수 내부에서 수행)
                fetchAndCacheCSVData();
            } else {
                statusBadge.textContent = '오프라인';
                statusBadge.className = 'status-badge offline';
            }
        }
    }
    
    // 30초마다 연결 상태 체크 (로고는 건드리지 않는 함수 사용)
    setInterval(checkConnectionStatusOnly, 30000);
    
    // 오프라인 모드 테스트 버튼 이벤트 처리
    document.addEventListener('DOMContentLoaded', function() {
        const forceOfflineBtn = document.getElementById('force-offline');
        if (forceOfflineBtn) {
            forceOfflineBtn.addEventListener('click', function() {
                this.classList.toggle('active');
                if (this.classList.contains('active')) {
                    this.textContent = '온라인 모드로 전환';
                    this.style.background = '#00b37e22';
                    this.style.color = '#00b37e';
                    this.style.borderColor = '#00b37e';
                    document.body.classList.add('offline-mode');
                    
                    // 상태 배지 업데이트
                    const statusBadge = document.getElementById('connection-status');
                    if (statusBadge) {
                        statusBadge.textContent = '오프라인 (테스트)';
                        statusBadge.className = 'status-badge offline';
                    }
                } else {
                    this.textContent = '오프라인 모드 테스트';
                    this.style.background = '#ff333322';
                    this.style.color = '#ff3333';
                    this.style.borderColor = '#ff3333';
                    document.body.classList.remove('offline-mode');
                    
                    // 연결 상태 다시 확인하여 배지 업데이트
                    checkConnectionStatus();
                }
            });
        }
    });
    
    // 온라인/오프라인 이벤트 리스너
    window.addEventListener('online', () => updateConnectionUI(true));
    window.addEventListener('offline', () => updateConnectionUI(false));
    
    // 테마 감지 및 다크모드 토글
    function initTheme() {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (darkModeMediaQuery.matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // 테마 변경 애니메이션
            document.documentElement.style.transition = 'background 0.5s ease, color 0.5s ease';
            setTimeout(() => {
                document.documentElement.style.transition = '';
            }, 500);
        });
        
        // 시스템 테마 변경 시 자동 감지
        darkModeMediaQuery.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }
    
    // 네비게이션 스크롤 효과
    function initScrollEffects() {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 10) {
                navbar.classList.add('navbar-scrolled');
            } else {
                navbar.classList.remove('navbar-scrolled');
            }
            
            // 네비게이션 링크 활성화
            const sections = document.querySelectorAll('section');
            const scrollPosition = window.scrollY + 300;
            const currentPath = window.location.pathname;
            
            // 현재 경로가 루트가 아닌 경우 (특정 페이지인 경우)
            if (currentPath !== '/' && currentPath !== '/index') {
                // "/inquiry", "/feedback", "/report" 등의 게시판 경로인 경우 Support 메뉴를 활성화
                if (['/inquiry', '/feedback', '/report', '/inquiry/write', '/feedback/write', '/report/write', 
                     '/inquiry/view', '/feedback/view', '/report/view',
                     '/inquiry/edit', '/feedback/edit', '/report/edit'].some(path => currentPath.startsWith(path))) {
                    navLinkItems.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === '/#support') {
                            link.classList.add('active');
                        }
                    });
                // "/file-manager" 경로인 경우 Documents 메뉴를 활성화
                } else if (currentPath === '/file-manager') {
                    navLinkItems.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === '/#documents') {
                            link.classList.add('active');
                        }
                    });
                } else {
                    // 다른 페이지의 경우 해당 링크 활성화 (예: #documents)
                    navLinkItems.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href').includes(currentPath.substring(1))) {
                            link.classList.add('active');
                        }
                    });
                }
            } else {
                // 메인 페이지에서는 스크롤 위치에 따라 메뉴 활성화
                // 모든 활성 클래스 초기화
                navLinkItems.forEach(link => {
                    link.classList.remove('active');
                });
                
                // 현재 화면에 가장 많이 표시되는 섹션을 찾아 해당 메뉴만 활성화
                let maxVisibleSection = null;
                let maxVisibleHeight = 0;
                
                sections.forEach(section => {
                    const rect = section.getBoundingClientRect();
                    const sectionId = section.getAttribute('id');
                    
                    // 화면에 보이는 섹션의 높이 계산
                    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
                    
                    if (visibleHeight > maxVisibleHeight && visibleHeight > 0) {
                        maxVisibleHeight = visibleHeight;
                        maxVisibleSection = sectionId;
                    }
                });
                
                // 가장 많이 보이는 섹션의 메뉴만 활성화
                if (maxVisibleSection) {
                    navLinkItems.forEach(link => {
                        if (link.getAttribute('href') === `#${maxVisibleSection}`) {
                            link.classList.add('active');
                        }
                    });
                }
            }
        });
    }
    
    // 모바일 메뉴 토글
    function initMobileMenu() {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            
            // 햄버거 메뉴 애니메이션
            const bars = mobileMenuBtn.querySelectorAll('.bar');
            if (navLinks.classList.contains('active')) {
                bars[0].style.transform = 'rotate(45deg) translate(6px, 6px)';
                bars[1].style.opacity = '0';
                bars[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
            } else {
                bars.forEach(bar => {
                    bar.style.transform = '';
                    bar.style.opacity = '1';
                });
            }
        });
        
        // 모바일 메뉴 항목 클릭 시 메뉴 닫기
        navLinkItems.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    navLinks.classList.remove('active');
                    
                    const bars = mobileMenuBtn.querySelectorAll('.bar');
                    bars.forEach(bar => {
                        bar.style.transform = '';
                        bar.style.opacity = '1';
                    });
                }
            });
        });
    }
    
    // 채팅 기능
    function initChat() {
        // 채팅 최소화 기능
        let isChatMinimized = false;
        
        if (minimizeChat) {
            minimizeChat.addEventListener('click', () => {
                const chatCard = document.querySelector('.chat-card');
                const chatMessages = document.querySelector('.chat-messages');
                const chatInput = document.querySelector('.chat-input');
                
                if (isChatMinimized) {
                    chatCard.style.height = '60rem';
                    chatMessages.style.display = 'flex';
                    chatInput.style.display = 'flex';
                    minimizeChat.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    `;
                } else {
                    chatCard.style.height = 'auto';
                    chatMessages.style.display = 'none';
                    chatInput.style.display = 'none';
                    minimizeChat.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    `;
                }
                
                isChatMinimized = !isChatMinimized;
            });
        }
        
        // 채팅 폼 제출 이벤트 처리
        if (chatForm) {
            chatForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const message = userInput.value.trim();
                if (!message) {
                    userInput.classList.add('shake');
                    setTimeout(() => {
                        userInput.classList.remove('shake');
                    }, 500);
                    return;
                }
                
                // 버튼 비활성화 및 시각적 피드백
                sendButton.style.pointerEvents = 'none';
                sendButton.style.opacity = '0.7';
                
                // 사용자 메시지 UI에 추가
                addMessage(message, 'user');
                
                // 입력창 초기화
                userInput.value = '';
                
                // 로딩 인디케이터 표시
                loadingIndicator.classList.add('active');
                
                try {
                    // 현재 질문 저장 (피드백 기능용)
                    lastUserQuestion = message;
                    
                    // 온라인/오프라인 상태 확인
                    const isOfflineMode = document.body.classList.contains('offline-mode');
                    console.log('현재 모드:', isOfflineMode ? '오프라인' : '온라인');
                    
                    // 이미 오프라인 모드이거나 네트워크 연결이 없는 경우 로컬 데이터 검색 시도
                    const offlineTestMode = localStorage.getItem('offline_test_mode') === 'true';
                    if (isOfflineMode || !navigator.onLine || offlineTestMode) {
                        console.log('오프라인 모드에서 로컬 데이터 검색 시작', { isOfflineMode, onlineStatus: navigator.onLine, offlineTestMode });
                        
                        try {
                            // 간단한 오프라인 헬퍼 사용
                            if (window.offlineHelper && typeof window.offlineHelper.search === 'function') {
                                console.log('오프라인 헬퍼로 검색 시도 중...', window.offlineHelper.getOfflineStatus());
                                
                                try {
                                    // 검색 실행 및 응답
                                    const offlineResponse = window.offlineHelper.search(message);
                                    console.log('오프라인 응답 결과:', offlineResponse ? '결과 있음' : '결과 없음');
                                    
                                    if (offlineResponse) {
                                        // 응답 표시 (지연 효과 적용)
                                        addMessageWithTypingEffect(offlineResponse, 'bot');
                                        
                                        // 로딩 인디케이터 제거 및 버튼 다시 활성화
                                        loadingIndicator.classList.remove('active');
                                        sendButton.style.pointerEvents = '';
                                        sendButton.style.opacity = '';
                                        return;
                                    } else {
                                        // 결과가 없는 경우 기본 메시지
                                        const noResultMsg = '[🔴 서버 연결이 끊겼습니다. 업로드된 문서 데이터로 응답 중입니다]\n\n현재 오프라인 상태입니다. 저장된 문서에 대한 질문만 응답 가능합니다.';
                                        addMessageWithTypingEffect(noResultMsg, 'bot');
                                        
                                        // 로딩 인디케이터 제거 및 버튼 다시 활성화
                                        loadingIndicator.classList.remove('active');
                                        sendButton.style.pointerEvents = '';
                                        sendButton.style.opacity = '';
                                        return;
                                    }
                                } catch (searchError) {
                                    console.error('오프라인 검색 오류:', searchError);
                                    addMessageWithTypingEffect('[🔴 오프라인 모드 오류]\n\n오프라인 데이터 검색 중 오류가 발생했습니다.', 'bot');
                                    
                                    // 로딩 인디케이터 제거 및 버튼 다시 활성화
                                    loadingIndicator.classList.remove('active');
                                    sendButton.style.pointerEvents = '';
                                    sendButton.style.opacity = '';
                                    return;
                                }
                            } else {
                                console.error('오프라인 헬퍼 모듈을 찾을 수 없습니다.');
                                addMessageWithTypingEffect('현재 오프라인 상태입니다. 저장된 문서에 대한 질문만 응답 가능합니다.', 'bot');
                                
                                // 로딩 인디케이터 제거 및 버튼 다시 활성화
                                loadingIndicator.classList.remove('active');
                                sendButton.style.pointerEvents = '';
                                sendButton.style.opacity = '';
                                return;
                            }
                        } catch (offlineError) {
                            console.error('오프라인 응답 생성 중 오류:', offlineError);
                            addMessageWithTypingEffect('현재 오프라인 상태입니다. 로컬 데이터 처리 중 오류가 발생했습니다.', 'bot');
                            
                            // 로딩 인디케이터 제거 및 버튼 다시 활성화
                            loadingIndicator.classList.remove('active');
                            sendButton.style.pointerEvents = '';
                            sendButton.style.opacity = '';
                            return;
                        }
                    }
                    
                    // 서버에 메시지 전송 및 응답 받기 (오프라인 대응 실패 또는 온라인 모드)
                    const response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            message,
                            offline_mode: isOfflineMode 
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        // 챗봇 응답 UI에 추가 (타이핑 효과)
                        addMessageWithTypingEffect(data.reply, 'bot');
                        
                        // 오프라인 모드 응답인 경우 상태 업데이트
                        if (data.mode === 'offline') {
                            document.body.classList.add('offline-mode');
                            
                            // 상태 배지 업데이트
                            const statusBadge = document.getElementById('connection-status');
                            if (statusBadge) {
                                statusBadge.textContent = '오프라인';
                                statusBadge.className = 'status-badge offline';
                            }
                        }
                    } else {
                        // 오류 처리
                        addMessage(`오류가 발생했습니다: ${data.error || '알 수 없는 오류'}`, 'bot');
                    }
                } catch (error) {
                    console.error('API 호출 중 오류 발생:', error);
                    
                    // 오프라인 모드 설정 및 로컬 데이터로 응답 시도
                    document.body.classList.add('offline-mode');
                    
                    // 상태 배지 업데이트
                    const statusBadge = document.getElementById('connection-status');
                    if (statusBadge) {
                        statusBadge.textContent = '오프라인';
                        statusBadge.className = 'status-badge offline';
                    }
                    
                    // IndexedDB에서 검색 시도
                    if (window.OfflineStorage && window.OfflineCache) {
                        try {
                            console.log('API 호출 실패 후 IndexedDB 검색 시도');
                            const offlineResult = await OfflineCache.handleOfflineQuery(message);
                            
                            if (offlineResult && offlineResult.success) {
                                let offlineResponse = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + 
                                                    offlineResult.data.text;
                                
                                // 추가 관련 정보가 있으면 표시
                                if (offlineResult.data.additionalResults && 
                                    offlineResult.data.additionalResults.length > 0) {
                                    offlineResponse += '\n\n관련 정보:';
                                    offlineResult.data.additionalResults.forEach((item, index) => {
                                        offlineResponse += `\n${index + 1}. ${item}`;
                                    });
                                }
                                
                                addMessageWithTypingEffect(offlineResponse, 'bot');
                                return;
                            }
                        } catch (offlineError) {
                            console.error('오프라인 응답 생성 중 오류:', offlineError);
                        }
                    }
                    
                    // IndexedDB 실패 시 localStorage 검색
                    const localResponse = getLocalResponse(message);
                    if (localResponse) {
                        // A:, B:, C: 형식을 완전히 제거하고 자연어 변환
                        let processedResponse = localResponse;
                        
                        // IP 주소를 포함하는 응답 - 특화된 처리
                        if (message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)) {
                            const ipMatch = message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
                            const ipAddress = ipMatch ? ipMatch[0] : '';
                            
                            console.log('IP 주소 검색 응답 변환 시작:', localResponse);
                            
                            // 알파벳 단일문자 레이블 패턴(A:, B:) 및 한글 패턴(사용자:, 부서:) 모두 처리
                            const formatPattern = /(?:^|\s|[.])([A-G]|사용자명?|부서|연락처|상태|최종[ _]?접속일|날짜|비고)\s*[:]\s*([^.,:]+)(?=[,.]|\s|$)/gi;
                            
                            // 정보 추출
                            let userData = '';
                            let deptData = '';
                            let contactData = '';
                            let dateData = '';
                            let statusData = '';
                            let notesData = '';
                            
                            // 모든 매칭 찾기
                            let match;
                            while ((match = formatPattern.exec(localResponse)) !== null) {
                                const key = match[1].trim().toLowerCase();
                                const value = match[2].trim();
                                
                                console.log('매칭 찾음:', key, '=', value);
                                
                                // 키 패턴에 따라 데이터 분류
                                if (key === 'a' || key.includes('사용자')) {
                                    userData = value;
                                } else if (key === 'b' || key.includes('부서')) {
                                    deptData = value;
                                } else if (key === 'c' || key.includes('연락처')) {
                                    contactData = value;
                                } else if (key === 'd' || key.includes('상태')) {
                                    statusData = value;
                                } else if (key === 'e' || key === 'f' || key.includes('접속일') || key.includes('날짜')) {
                                    dateData = value;
                                } else if (key === 'g' || key.includes('비고')) {
                                    notesData = value;
                                }
                            }
                            
                            // 자연어 문장 조합
                            if (!statusData) statusData = '사용 중';
                            
                            if (ipAddress) {
                                if (deptData && userData) {
                                    processedResponse = `IP ${ipAddress}는 ${deptData}의 ${userData} 담당자가 ${statusData}입니다.`;
                                } else if (userData) {
                                    processedResponse = `IP ${ipAddress}는 ${userData} 담당자가 ${statusData}입니다.`;
                                } else {
                                    processedResponse = `IP ${ipAddress} 정보를 찾았습니다.`;
                                }
                                
                                if (contactData) {
                                    processedResponse += ` 연락처는 ${contactData}입니다.`;
                                }
                                
                                if (dateData) {
                                    processedResponse += ` 최근 접속일은 ${dateData}입니다.`;
                                }
                                
                                if (notesData) {
                                    processedResponse += ` 참고사항: ${notesData}`;
                                }
                            }
                            
                            // 백업 처리: 알파벳 패턴 직접 찾기
                            if (processedResponse === localResponse && localResponse.includes(': ')) {
                                const alphaPattern = /([A-G])\s*:\s*([^.,]+)(?=[,.]|\s|$)/g;
                                const extractedData = {};
                                
                                while ((match = alphaPattern.exec(localResponse)) !== null) {
                                    const label = match[1];
                                    const value = match[2].trim();
                                    extractedData[label] = value;
                                }
                                
                                console.log('백업 처리로 추출된 데이터:', extractedData);
                                
                                // 백업 데이터로 자연어 생성
                                if (Object.keys(extractedData).length > 0) {
                                    if (ipAddress) {
                                        processedResponse = `IP ${ipAddress}에 대한 정보입니다: `;
                                        if (extractedData['A']) processedResponse += `사용자는 ${extractedData['A']}`;
                                        if (extractedData['B']) processedResponse += `, 부서는 ${extractedData['B']}`;
                                        if (extractedData['C']) processedResponse += `, 연락처는 ${extractedData['C']}`;
                                        if (extractedData['D']) processedResponse += `, 상태는 ${extractedData['D']}`;
                                        if (extractedData['E']) processedResponse += `, 날짜는 ${extractedData['E']}`;
                                        if (extractedData['F']) processedResponse += `, ${extractedData['F']}`;
                                        if (extractedData['G']) processedResponse += `, ${extractedData['G']}`;
                                        
                                        // 쉼표 정리
                                        processedResponse = processedResponse.replace(/,\s*$/, '');
                                        processedResponse = processedResponse.replace(/:\s*,/, ':');
                                    }
                                }
                            }
                            
                            console.log('최종 변환된 응답:', processedResponse);
                        }
                        
                        addMessage('[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + processedResponse, 'bot');
                    } else {
                        addMessage('[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n현재 오프라인 상태입니다. 로컬 데이터에서 관련 정보를 찾을 수 없습니다.', 'bot');
                    }
                } finally {
                    // 로딩 인디케이터 숨기기
                    loadingIndicator.classList.remove('active');
                    
                    // 버튼 재활성화
                    sendButton.style.pointerEvents = 'auto';
                    sendButton.style.opacity = '1';
                    
                    // 입력창에 포커스
                    userInput.focus();
                }
            });
        }
        
        // 입력창 이벤트 핸들러
        if (userInput) {
            // 포커스 효과
            userInput.addEventListener('focus', () => {
                userInput.placeholder = '무엇이든 물어보세요!';
            });
            
            userInput.addEventListener('blur', () => {
                userInput.placeholder = '메시지를 입력하세요...';
            });
            
            // 키 입력 효과 - 엔터 키 누르면 전송
            userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (userInput.value.trim()) {
                        chatForm.dispatchEvent(new Event('submit'));
                    } else {
                        userInput.classList.add('shake');
                        setTimeout(() => {
                            userInput.classList.remove('shake');
                        }, 500);
                    }
                }
            });
        }
        
        // 초기 포커스 설정
        if (userInput && window.location.hash === '#chat') {
            setTimeout(() => {
                userInput.focus();
            }, 1000);
        }
    }
    
    // 마크다운을 HTML로 변환하는 함수
    function convertMarkdownToHtml(markdown) {
        try {
            // marked.js로 마크다운을 HTML로 변환
            const rawHtml = marked.parse(markdown);
            
            // DOMPurify로 XSS 방지를 위한 HTML 정제
            return DOMPurify.sanitize(rawHtml);
        } catch (error) {
            console.error('Markdown 변환 중 오류 발생:', error);
            return markdown; // 오류 발생 시 원본 텍스트 반환
        }
    }
    
    // 메시지 추가 함수
    function addMessage(content, sender, questionText = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // 봇 메시지는 마크다운으로 처리, 사용자 메시지는 일반 텍스트
        if (sender === 'bot') {
            messageContent.innerHTML = convertMarkdownToHtml(content);
            
            // 봇 메시지에만 피드백 UI 추가
            const feedbackContainer = document.createElement('div');
            feedbackContainer.className = 'message-feedback';
            
            // 피드백 질문 
            const feedbackQuestion = document.createElement('div');
            feedbackQuestion.className = 'feedback-question';
            feedbackQuestion.textContent = '응답이 도움이 되었나요?';
            
            // 피드백 버튼 컨테이너
            const feedbackButtons = document.createElement('div');
            feedbackButtons.className = 'feedback-buttons';
            
            // 좋아요 버튼
            const likeButton = document.createElement('button');
            likeButton.className = 'feedback-button like-button';
            likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i> 만족해요';
            likeButton.setAttribute('title', '이 응답에 만족합니다');
            likeButton.onclick = function() {
                submitFeedback(questionText, content, '만족', feedbackContainer);
                showThankYouMessage(feedbackContainer, '피드백 감사합니다!');
            };
            
            // 싫어요 버튼
            const dislikeButton = document.createElement('button');
            dislikeButton.className = 'feedback-button dislike-button';
            dislikeButton.innerHTML = '<i class="fas fa-thumbs-down"></i> 개선 필요';
            dislikeButton.setAttribute('title', '이 응답이 개선이 필요합니다');
            dislikeButton.onclick = function() {
                // 부족함 피드백일 때는 추가 코멘트 입력 UI 표시
                showDislikeFeedbackForm(questionText, content, feedbackContainer);
            };
            
            // 정보추가 버튼
            const moreInfoButton = document.createElement('button');
            moreInfoButton.className = 'feedback-button more-info-button';
            moreInfoButton.innerHTML = '<i class="fas fa-info-circle"></i> 더 자세히';
            moreInfoButton.setAttribute('title', '더 자세한 정보가 필요합니다');
            moreInfoButton.onclick = function() {
                // "더 자세히" 버튼 클릭 시, 같은 질문에 "더 자세히 설명해 주세요"를 추가하여 새 질문 생성
                userInput.value = questionText + " 더 자세히 설명해 주세요.";
                
                // 폼 직접 제출 (submitQuestion 대신)
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
                
                // 피드백 UI 감사 메시지로 교체
                feedbackContainer.innerHTML = '<div class="feedback-success">자세한 정보를 가져올게요</div>';
                
                // 5초 후 피드백 UI 흐리게 처리
                setTimeout(() => {
                    feedbackContainer.style.opacity = '0.6';
                }, 5000);
            };
            
            // 버튼 추가
            feedbackButtons.appendChild(likeButton);
            feedbackButtons.appendChild(dislikeButton);
            feedbackButtons.appendChild(moreInfoButton);
            
            // 피드백 UI 구성
            feedbackContainer.appendChild(feedbackQuestion);
            feedbackContainer.appendChild(feedbackButtons);
            
            // 피드백 감사 메시지 함수 정의
            function showThankYouMessage(container, message = '피드백을 주셔서 감사합니다!') {
                container.innerHTML = `<div class="feedback-success">${message}</div>`;
                
                // 5초 후 피드백 UI 흐리게 처리
                setTimeout(() => {
                    container.style.opacity = '0.6';
                }, 5000);
            }
            
            // 메시지 아래에 피드백 UI 추가
            messageDiv.appendChild(messageContent);
            messageDiv.appendChild(feedbackContainer);
        } else {
            messageContent.textContent = content;
            messageDiv.appendChild(messageContent);
        }
        
        chatContainer.appendChild(messageDiv);
        
        // 스크롤을 최신 메시지로 이동
        scrollToBottom();
    }
    
    // 부족함 피드백 폼 표시
    function showDislikeFeedbackForm(question, answer, container) {
        // 기존 버튼 제거
        container.innerHTML = '';
        
        // 피드백 입력 폼 생성
        const feedbackForm = document.createElement('div');
        feedbackForm.className = 'feedback-form';
        
        // 안내 메시지
        const formLabel = document.createElement('div');
        formLabel.className = 'feedback-form-label';
        formLabel.textContent = '어떤 부분이 부족했나요? (선택 사항)';
        
        // 코멘트 텍스트 영역
        const commentInput = document.createElement('textarea');
        commentInput.className = 'feedback-comment';
        commentInput.placeholder = '의견을 남겨주세요...';
        
        // 제출 버튼
        const submitButton = document.createElement('button');
        submitButton.className = 'feedback-submit';
        submitButton.textContent = '제출';
        submitButton.onclick = function() {
            submitFeedback(question, answer, '👎 부족함', container, commentInput.value);
        };
        
        // 폼 구성
        feedbackForm.appendChild(formLabel);
        feedbackForm.appendChild(commentInput);
        feedbackForm.appendChild(submitButton);
        
        // 컨테이너에 폼 추가
        container.appendChild(feedbackForm);
    }
    
    // 피드백 서버 제출
    async function submitFeedback(question, answer, feedbackType, container, comment = '') {
        try {
            // 서버에 피드백 전송
            const response = await fetch('/api/chat/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: question, 
                    answer: answer,
                    feedback_type: feedbackType,
                    feedback_comment: comment
                })
            });
            
            const data = await response.json();
            
            // 피드백 UI 감사 메시지로 교체
            container.innerHTML = '';
            const thankYouMessage = document.createElement('div');
            thankYouMessage.className = 'feedback-thanks';
            thankYouMessage.textContent = '피드백 감사합니다!';
            container.appendChild(thankYouMessage);
            
        } catch (error) {
            console.error('피드백 제출 중 오류 발생:', error);
            
            // 오류 메시지 표시
            container.innerHTML = '';
            const errorMessage = document.createElement('div');
            errorMessage.className = 'feedback-error';
            errorMessage.textContent = '피드백 제출 중 오류가 발생했습니다.';
            container.appendChild(errorMessage);
        }
    }
    
    // 전역 변수로 마지막 사용자 질문 저장
    let lastUserQuestion = '';
    
    // 봇 메시지는 마크다운으로 즉시 표시 (타이핑 효과 없음)
    function addMessageWithTypingEffect(content, sender) {
        if (sender === 'bot') {
            // 봇 메시지는 마크다운으로 렌더링
            // 피드백을 위해 저장된 마지막 사용자 질문 전달
            addMessage(content, sender, lastUserQuestion);
        } else {
            // 사용자 메시지는 타이핑 효과 사용 (원래 함수)
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}-message`;
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageDiv.appendChild(messageContent);
            chatContainer.appendChild(messageDiv);
            
            // 타이핑 효과
            let i = 0;
            const typingSpeed = 20; // 타이핑 속도 조절 (ms)
            
            // 응답 길이가 매우 긴 경우 타이핑 속도 최적화
            const adjustedSpeed = content.length > 300 ? 5 : typingSpeed;
            
            function typeNextChar() {
                if (i < content.length) {
                    messageContent.textContent += content.charAt(i);
                    i++;
                    scrollToBottom();
                    setTimeout(typeNextChar, adjustedSpeed);
                }
            }
            
            setTimeout(typeNextChar, 200); // 약간의 지연 후 타이핑 시작
        }
    }
    
    // 스크롤을 최신 메시지로 이동하는 함수 (부드러운 스크롤 효과)
    function scrollToBottom() {
        if (chatContainer) {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
    
    // 스무스 스크롤 구현 (메뉴 클릭시)
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
    
    // 문서 업로드 기능 초기화
    function initDocumentUpload() {
        const uploadForm = document.getElementById('uploadForm');
        const fileInput = document.getElementById('fileInput');
        const uploadDropzone = document.getElementById('uploadDropzone');
        const uploadBrowse = document.querySelector('.upload-browse');
        const documentsList = document.getElementById('documentsList');
        
        // 진행률 표시 관련 요소
        const progressContainer = document.getElementById('uploadProgressContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressText');
        const progressChunks = document.getElementById('uploadProgressChunks');
        const progressFilename = document.getElementById('uploadFileName');
        
        // 청크 크기 (5MB)
        const CHUNK_SIZE = 5 * 1024 * 1024;
        
        if (!uploadForm || !fileInput || !uploadDropzone || !documentsList) return;
        
        // 업로드 완료 상태 추적
        let isUploadCompleted = false;
        
        // 드래그 앤 드롭 기능 개선
        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!isUploadCompleted) {
                uploadDropzone.classList.add('dragover');
                // 아이콘 회전 효과
                const icon = uploadDropzone.querySelector('svg');
                if (icon) {
                    icon.style.transform = 'scale(1.1) rotate(10deg)';
                }
            }
        });
        
        uploadDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // 드롭존을 완전히 벗어났을 때만 스타일 제거
            if (!uploadDropzone.contains(e.relatedTarget)) {
                uploadDropzone.classList.remove('dragover');
                const icon = uploadDropzone.querySelector('svg');
                if (icon) {
                    icon.style.transform = '';
                }
            }
        });
        
        uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropzone.classList.remove('dragover');
            const icon = uploadDropzone.querySelector('svg');
            if (icon) {
                icon.style.transform = '';
            }
            
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                // 파일 이름 표시
                const fileNames = Array.from(fileInput.files).map(file => file.name).join(', ');
                uploadDropzone.querySelector('p').textContent = fileNames;
            }
        });
        
        // 클릭으로 파일 선택
        uploadDropzone.addEventListener('click', () => {
            fileInput.click();
        });
        
        uploadBrowse.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                const fileNames = Array.from(fileInput.files).map(file => file.name).join(', ');
                uploadDropzone.querySelector('p').textContent = fileNames;
            } else {
                uploadDropzone.querySelector('p').textContent = 'Drag and drop files here or browse';
            }
        });
        
        // 파일을 청크로 분할하는 함수
        function sliceFile(file, chunkSize) {
            const chunks = [];
            let startByte = 0;
            
            while (startByte < file.size) {
                const endByte = Math.min(startByte + chunkSize, file.size);
                const chunk = file.slice(startByte, endByte);
                chunks.push(chunk);
                startByte = endByte;
            }
            
            return chunks;
        }
        
        // 청크 업로드 함수
        async function uploadChunks(file) {
            // 진행 상태 초기화
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            progressFilename.textContent = file.name;
            
            // 파일을 청크로 분할
            const chunks = sliceFile(file, CHUNK_SIZE);
            progressChunks.textContent = `0/${chunks.length} 청크`;
            console.log(`Uploading ${file.name} in ${chunks.length} chunks`);
            
            let sessionId = null;
            let uploadedChunks = 0;
            
            // 각 청크 업로드
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const formData = new FormData();
                
                // 청크 데이터 설정
                formData.append('chunkData', chunk, file.name);
                formData.append('filename', file.name);
                formData.append('chunkIndex', i);
                formData.append('totalChunks', chunks.length);
                
                // 세션 ID가 있으면 포함
                if (sessionId) {
                    formData.append('sessionId', sessionId);
                }
                
                try {
                    console.log(`Uploading chunk ${i+1}/${chunks.length}`);
                    
                    // 청크 업로드 요청
                    const response = await fetch('/api/upload-chunk', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Server responded with ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    if (!data.success) {
                        throw new Error(data.error || 'Unknown error');
                    }
                    
                    // 첫 번째 청크 응답에서 세션 ID 저장
                    if (i === 0) {
                        sessionId = data.sessionId;
                        console.log(`Session ID: ${sessionId}`);
                    }
                    
                    // 업로드 진행률 업데이트
                    uploadedChunks++;
                    const progress = Math.round((uploadedChunks / chunks.length) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;
                    progressChunks.textContent = `${uploadedChunks}/${chunks.length} 청크`;
                    
                } catch (error) {
                    console.error(`Error uploading chunk ${i}:`, error);
                    progressContainer.style.display = 'none';
                    alert(`Error uploading file: ${error.message}`);
                    return false;
                }
            }
            
            // 모든 청크 업로드 완료
            console.log(`File ${file.name} upload complete`);
            progressContainer.style.display = 'none';
            return true;
        }
        
        // 폼 제출
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (fileInput.files.length === 0) {
                alert('Please select a file to upload');
                return;
            }
            
            try {
                // 업로드 시작 상태 표시
                showUploadStarted();
                
                // 업로드 버튼 비활성화
                const uploadButton = document.getElementById('uploadButton');
                uploadButton.disabled = true;
                uploadButton.textContent = '업로드 중...';
                
                let allUploadsSuccessful = true;
                const files = Array.from(fileInput.files);
                
                // 🎯 업로드 시작 피드백 이벤트 발생
                files.forEach((file, index) => {
                    const uploadId = `upload_${Date.now()}_${index}`;
                    const uploadStartEvent = new CustomEvent('uploadStarted', {
                        detail: { filename: file.name, uploadId: uploadId }
                    });
                    document.dispatchEvent(uploadStartEvent);
                });
                
                for (const file of files) {
                    console.log(`Processing file: ${file.name}, size: ${file.size} bytes`);
                    
                    // 크기가 5MB 이상인 파일은 청크 업로드 사용
                    if (file.size > CHUNK_SIZE) {
                        console.log(`Using chunked upload for ${file.name}`);
                        // 청크 업로드 실행
                        const success = await uploadChunks(file);
                        if (!success) {
                            allUploadsSuccessful = false;
                        }
                    } else {
                        console.log(`Using regular upload for ${file.name}`);
                        // 작은 파일은 기존 방식으로 업로드
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        const response = await fetch('/api/upload', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        
                        if (!response.ok) {
                            console.error('Upload error:', data);
                            alert(`Upload failed: ${data.error || 'Unknown error'}`);
                            allUploadsSuccessful = false;
                        }
                    }
                }
                
                if (allUploadsSuccessful) {
                    // 업로드 완료 상태 표시
                    showUploadComplete(files.length);
                    
                    // 🎯 업로드 완료 피드백 이벤트 발생
                    files.forEach((file, index) => {
                        const uploadId = `upload_${Date.now()}_${index}`;
                        const uploadCompleteEvent = new CustomEvent('uploadCompleted', {
                            detail: { 
                                uploadId: uploadId,
                                results: [{
                                    status: 'success',
                                    filename: file.name,
                                    chunk_count: file.size > 5 * 1024 * 1024 ? Math.ceil(file.size / (5 * 1024 * 1024)) : 1,
                                    message: '문서가 성공적으로 업로드되고 AI 검색 인덱스에 등록되었습니다.'
                                }]
                            }
                        });
                        document.dispatchEvent(uploadCompleteEvent);
                    });
                    
                    // 파일 입력 초기화
                    fileInput.value = '';
                    
                    // 🔄 SHB-NetBot_Flow.csv 파일 업로드 감지 및 Flow 업데이트 이벤트 발생
                    const hasFlowFile = files.some(file => 
                        file.name.includes('SHB-NetBot_Flow') && file.name.endsWith('.csv')
                    );
                    
                    if (hasFlowFile) {
                        console.log('🔄 SHB-NetBot_Flow.csv 업로드 완료 - Flow 업데이트 이벤트 발생');
                        
                        // 즉시 Flow 업데이트 이벤트 발생
                        setTimeout(() => {
                            const flowUpdateEvent = new CustomEvent('flowUpdated', {
                                detail: { 
                                    source: 'fileUpload',
                                    files: files.filter(f => f.name.includes('SHB-NetBot_Flow'))
                                }
                            });
                            document.dispatchEvent(flowUpdateEvent);
                            
                            // 사용자에게 업데이트 알림
                            showFlowUpdateNotification();
                            
                            console.log('✅ Flow 업데이트 이벤트 발생 완료');
                        }, 2000); // 2초 후 실행 (JSON 변환 완료 충분한 대기)
                    }
                    
                    // 문서 목록 업데이트
                    loadDocuments();
                    
                    // 성공 메시지 (약간의 지연 후)
                    setTimeout(() => {
                        console.log(`${files.length}개 파일이 성공적으로 업로드되었습니다!`);
                    }, 500);
                }
            } catch (error) {
                console.error('Upload error:', error);
                
                // 🎯 업로드 오류 피드백 이벤트 발생
                const files = Array.from(fileInput.files);
                files.forEach((file, index) => {
                    const uploadId = `upload_${Date.now()}_${index}`;
                    const uploadErrorEvent = new CustomEvent('uploadError', {
                        detail: { 
                            uploadId: uploadId,
                            error: error.message || '업로드 중 오류가 발생했습니다.'
                        }
                    });
                    document.dispatchEvent(uploadErrorEvent);
                });
                
                alert('An error occurred during the upload');
            } finally {
                // 업로드 버튼 다시 활성화
                const uploadButton = document.getElementById('uploadButton');
                uploadButton.disabled = false;
                uploadButton.textContent = '파일 업로드';
                
                // 업로드 중 상태 제거
                uploadDropzone.classList.remove('uploading');
            }
        });
        
        // 업로드 완료 상태 표시 함수
        function showUploadComplete(fileCount) {
            isUploadCompleted = true;
            uploadDropzone.classList.add('upload-completed');
            
            // 텍스트 변경
            const mainText = uploadDropzone.querySelector('.upload-main-text');
            const statusText = uploadDropzone.querySelector('.upload-status-text');
            
            if (mainText) {
                mainText.innerHTML = `<span style="color: #16a34a;">✓ 업로드 완료!</span>`;
            }
            
            if (statusText) {
                statusText.textContent = `${fileCount}개 파일이 성공적으로 업로드되었습니다`;
            }
            
            // 아이콘 변경
            const icon = uploadDropzone.querySelector('svg');
            if (icon) {
                icon.innerHTML = `
                    <circle cx="12" cy="12" r="10" fill="#22c55e"></circle>
                    <polyline points="9,12 12,15 16,10" stroke="white" stroke-width="2" fill="none"></polyline>
                `;
                icon.style.color = '#22c55e';
            }
            
            // 3초 후 일반 상태로 복원
            setTimeout(() => {
                resetUploadState();
            }, 3000);
        }
        
        // 업로드 상태 복원 함수
        function resetUploadState() {
            isUploadCompleted = false;
            uploadDropzone.classList.remove('upload-completed');
            
            // 텍스트 복원
            const mainText = uploadDropzone.querySelector('.upload-main-text');
            const statusText = uploadDropzone.querySelector('.upload-status-text');
            
            if (mainText) {
                mainText.innerHTML = '파일을 드래그하거나 <span class="upload-browse" style="color: #30507A; cursor: pointer; text-decoration: underline;">클릭하여 업로드</span>';
            }
            
            if (statusText) {
                statusText.textContent = '네트워크 문서를 업로드하여 AI 검색 기능을 향상시키세요';
            }
            
            // 아이콘 복원
            const icon = uploadDropzone.querySelector('svg');
            if (icon) {
                icon.innerHTML = `
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                `;
                icon.style.color = '#30507A';
            }
        }
        
        // Flow 업데이트 알림 함수
        function showFlowUpdateNotification() {
            // 기존 알림이 있다면 제거
            const existingNotification = document.querySelector('.flow-update-notification');
            if (existingNotification) {
                existingNotification.remove();
            }
            
            // 새로운 알림 생성
            const notification = document.createElement('div');
            notification.className = 'flow-update-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #2563EB, #1D4ED8);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(37, 99, 235, 0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 12px;
                animation: slideInFromRight 0.4s ease-out;
            `;
            
            notification.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"></path>
                    <circle cx="12" cy="12" r="10"></circle>
                </svg>
                <span>🔄 Flow 데이터가 업데이트되었습니다!</span>
            `;
            
            // 스타일 추가 (애니메이션)
            if (!document.querySelector('#flow-notification-styles')) {
                const style = document.createElement('style');
                style.id = 'flow-notification-styles';
                style.textContent = `
                    @keyframes slideInFromRight {
                        from {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    @keyframes slideOutToRight {
                        from {
                            transform: translateX(0);
                            opacity: 1;
                        }
                        to {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(notification);
            
            // 4초 후 자동 제거
            setTimeout(() => {
                notification.style.animation = 'slideOutToRight 0.4s ease-in';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 400);
            }, 4000);
        }

        // 업로드 시작 상태 표시 함수
        function showUploadStarted() {
            uploadDropzone.classList.add('uploading');
            
            const statusText = uploadDropzone.querySelector('.upload-status-text');
            if (statusText) {
                statusText.textContent = '파일을 업로드하는 중입니다...';
            }
        }
        
        // 초기 문서 목록 로드
        loadDocuments();
    }
    
    // 문서 목록 로드
    async function loadDocuments() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;
        
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();
            
            if (response.ok) {
                if (data.files && data.files.length > 0) {
                    // 메타데이터 파일 필터링
                    const filteredFiles = data.files.filter(file => 
                        !file.filename.endsWith('_metadata.json')
                    );
                    
                    // 문서 목록 표시
                    documentsList.innerHTML = '';
                    
                    filteredFiles.forEach(file => {
                        const fileExt = file.file_type;
                        let iconClass = 'txt';
                        
                        // 파일 타입에 따른 아이콘 클래스
                        if (fileExt === 'pdf') {
                            iconClass = 'pdf';
                        } else if (fileExt === 'docx' || fileExt === 'doc') {
                            iconClass = 'docx';
                        } else if (fileExt === 'pptx' || fileExt === 'ppt') {
                            iconClass = 'pptx';
                        } else if (fileExt === 'xlsx' || fileExt === 'xls') {
                            iconClass = 'xlsx';
                        }
                        
                        // 파일 크기 형식화
                        const fileSize = formatFileSize(file.size);
                        
                        // 날짜 형식화
                        const uploadDate = new Date(file.uploaded_at * 1000).toLocaleString();
                        
                        // 문서 항목 생성
                        const docItem = document.createElement('div');
                        docItem.className = 'document-item';
                        docItem.innerHTML = `
                            <div class="document-info">
                                <div class="document-icon ${iconClass}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                </div>
                                <div class="document-details">
                                    <div class="document-name">${file.filename}</div>
                                    <div class="document-status">
                                        Size: ${fileSize} | Uploaded: ${uploadDate}
                                    </div>
                                </div>
                            </div>
                        `;
                        
                        documentsList.appendChild(docItem);
                    });
                } else {
                    // 문서가 없음
                    documentsList.innerHTML = `
                        <div class="empty-state">
                            <p>No documents uploaded yet</p>
                        </div>
                    `;
                }
            } else {
                console.error('Error loading documents:', data.error);
                documentsList.innerHTML = `
                    <div class="empty-state">
                        <p>Error loading documents</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Network error loading documents:', error);
            documentsList.innerHTML = `
                <div class="empty-state">
                    <p>Error loading documents</p>
                </div>
            `;
        }
    }
    
    // 파일 크기 형식화 (바이트 → KB, MB)
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' bytes';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        } else {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }
    }
    
    // 페이지네이션 관련 변수
    let currentPage = 1;
    const filesPerPage = 8;
    let allDocuments = [];
    
    // 메인페이지 파일 미리보기 함수 (파일관리자와 동일한 기능)
    function openMainPageFilePreview(systemFilename, originalFilename) {
        console.log('메인페이지 파일 미리보기 호출:', originalFilename);
        
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('filePreviewModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // AbortController로 fetch 요청 취소 가능하게 설정
        const abortController = new AbortController();
        
        // 모달 생성
        const modal = document.createElement('div');
        modal.id = 'filePreviewModal';
        modal.className = 'file-preview-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;
        
        // 모달에 abortController 참조 저장
        modal._abortController = abortController;
        
        // 모달 내용
        const modalContent = document.createElement('div');
        modalContent.className = 'file-preview-content';
        modalContent.style.cssText = `
            background: white;
            border-radius: 12px;
            width: 95vw;
            max-width: 1400px;
            height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        `;
        
        // 헤더
        const header = document.createElement('div');
        header.className = 'file-preview-header';
        header.style.cssText = `
            padding: 20px 25px;
            border-bottom: 2px solid #e8e8e8;
            background: linear-gradient(135deg, #30507A 0%, #1A2B4C 100%);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        header.innerHTML = `
            <div>
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">📁 ${originalFilename}</h3>
                <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">파일 보기 및 편집</p>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <a href="/api/documents/view/${systemFilename}" 
                   download="${originalFilename}"
                   style="background: #4CD6B9; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                   ⬇️ 다운로드
                </a>
                <button id="closeFilePreview" 
                        style="background: #ff5252; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 18px; width: 40px; height: 40px;">
                    ✕
                </button>
            </div>
        `;
        
        // 본문 (파일 내용)
        const content = document.createElement('div');
        content.className = 'file-preview-body';
        content.style.cssText = `
            flex: 1;
            overflow: auto;
            padding: 0;
            background: #fafafa;
        `;
        
        content.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <div style="font-size: 24px; margin-bottom: 10px;">📄</div>
                <p>파일을 불러오는 중입니다...</p>
            </div>
        `;
        
        // 모달 조립
        modalContent.appendChild(header);
        modalContent.appendChild(content);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // 모달 닫기 함수
        function closeModal() {
            // fetch 요청 취소
            if (modal._abortController) {
                modal._abortController.abort();
            }
            
            // 이벤트 리스너 제거
            const escHandler = modal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            
            // DOM에서 모달 완전 제거
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            
            // 메모리 정리
            modal._escHandler = null;
            modal._abortController = null;
        }
        
        // 닫기 이벤트
        document.getElementById('closeFilePreview').addEventListener('click', closeModal);
        
        // 모달 외부 클릭시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // ESC 키로 닫기
        function escHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }
        modal._escHandler = escHandler;
        document.addEventListener('keydown', escHandler);
        
        // 파일 내용 로드 (AbortController와 함께)
        fetch(`/api/documents/view/${systemFilename}`, {
            signal: abortController.signal
        })
            .then(response => {
                // 요청이 취소되었는지 확인
                if (abortController.signal.aborted) {
                    return null;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // 요청이 취소되었거나 모달이 닫혔는지 확인
                if (!data || abortController.signal.aborted || !document.body.contains(modal)) {
                    return;
                }
                
                if (data && data.status === 'success') {
                    if (data.html_content && data.file_type === 'csv') {
                        // CSV 파일의 경우 편집 가능한 HTML 콘텐츠 표시
                        content.innerHTML = data.content || '';
                        
                        // CSV 편집 기능 활성화
                        initializeCSVEditingInModal(modal, systemFilename, data.encoding || 'utf-8');
                    } else if (data.html_content && data.file_type === 'pdf') {
                        // PDF 파일의 경우 HTML 콘텐츠를 그대로 표시 (iframe 포함)
                        content.innerHTML = data.content || '';
                    } else if (data.file_type === 'pdf' && data.content && data.content.startsWith('data:application/pdf;base64,')) {
                        // PDF 파일을 Blob URL로 변환하여 표시
                        try {
                            const base64Data = data.content.split(',')[1];
                            const binaryData = atob(base64Data);
                            const bytes = new Uint8Array(binaryData.length);
                            for (let i = 0; i < binaryData.length; i++) {
                                bytes[i] = binaryData.charCodeAt(i);
                            }
                            const blob = new Blob([bytes], { type: 'application/pdf' });
                            const blobUrl = URL.createObjectURL(blob);
                            
                            content.innerHTML = `
                                <div style="width: 100%; height: 100%; display: flex; flex-direction: column;">
                                    <div style="background-color: #f0f0f0; padding: 15px; border-bottom: 1px solid #ddd;">
                                        <h3 style="margin: 0; color: #333; font-size: 16px;">📄 PDF 문서 미리보기</h3>
                                        <p style="margin: 5px 0 0; color: #666; font-size: 14px;">파일명: ${originalFilename}</p>
                                    </div>
                                    <iframe 
                                        src="${blobUrl}" 
                                        style="flex: 1; border: none; width: 100%;" 
                                        title="PDF 미리보기">
                                        <p style="padding: 20px; text-align: center;">
                                            PDF를 표시할 수 없습니다. 
                                            <a href="${blobUrl}" target="_blank" style="color: #30507A; text-decoration: underline;">
                                                새 창에서 열기
                                            </a>
                                        </p>
                                    </iframe>
                                </div>
                            `;
                            
                            // 모달이 닫힐 때 Blob URL 해제
                            const originalCloseModal = closeModal;
                            closeModal = function() {
                                URL.revokeObjectURL(blobUrl);
                                originalCloseModal();
                            };
                        } catch (error) {
                            console.error('PDF 처리 오류:', error);
                            content.innerHTML = `
                                <div style="padding: 20px; text-align: center; color: #666;">
                                    <p>PDF 파일을 표시할 수 없습니다.</p>
                                    <p>파일을 다운로드하여 확인해주세요.</p>
                                </div>
                            `;
                        }
                    } else {
                        // 일반 텍스트 파일
                        const fileContent = data.content || data || '';
                        content.innerHTML = `
                            <div style="background: white; border-radius: 8px; margin: 20px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                <pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; line-height: 1.5;">${fileContent}</pre>
                            </div>
                        `;
                    }
                } else {
                    throw new Error(data?.message || '파일 데이터가 올바르지 않습니다.');
                }
            })
            .catch(error => {
                // AbortError는 무시 (정상적인 취소)
                if (error.name === 'AbortError' || abortController.signal.aborted) {
                    return;
                }
                
                // 모달이 이미 닫혔는지 확인
                if (!document.body.contains(modal)) {
                    return;
                }
                
                console.error('파일 로드 오류:', error);
                const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ff5252;">
                        <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                        <p>파일을 불러올 수 없습니다.</p>
                        <p style="font-size: 14px; color: #666;">오류: ${errorMessage}</p>
                    </div>
                `;
            });
    }
    
    // 모달 내에서 CSV 편집 기능 초기화
    function initializeCSVEditingInModal(modal, systemFilename, encoding) {
        // 편집 모드 버튼 이벤트
        const editButton = modal.querySelector('#edit-mode-btn');
        const saveButton = modal.querySelector('#save-changes-btn');
        const cancelButton = modal.querySelector('#cancel-edit-btn');
        const table = modal.querySelector('.editable-csv-table');
        
        if (editButton && table) {
            editButton.addEventListener('click', function() {
                // 편집 모드 활성화
                table.classList.add('editing');
                editButton.style.display = 'none';
                if (saveButton) saveButton.style.display = 'inline-block';
                if (cancelButton) cancelButton.style.display = 'inline-block';
                
                // 테이블 셀을 편집 가능하게 만들기
                const cells = table.querySelectorAll('td');
                cells.forEach(cell => {
                    cell.contentEditable = true;
                    cell.style.border = '2px solid #4CD6B9';
                    cell.style.backgroundColor = '#f8ffff';
                });
            });
        }
        
        if (saveButton) {
            saveButton.addEventListener('click', function() {
                saveCSVChangesInModal(modal, systemFilename, encoding);
            });
        }
        
        if (cancelButton) {
            cancelButton.addEventListener('click', function() {
                // 편집 모드 취소 - 페이지 새로고침
                location.reload();
            });
        }
    }
    
    // 모달 내에서 CSV 변경사항 저장
    function saveCSVChangesInModal(modal, systemFilename, encoding) {
        const table = modal.querySelector('.editable-csv-table');
        if (!table) return;
        
        // 헤더와 데이터 수집
        const headers = [];
        const data = [];
        
        const headerRow = table.querySelector('thead tr');
        if (headerRow) {
            headerRow.querySelectorAll('th').forEach(th => {
                headers.push(th.textContent.trim());
            });
        }
        
        const dataRows = table.querySelectorAll('tbody tr');
        dataRows.forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach(td => {
                rowData.push(td.textContent.trim());
            });
            data.push(rowData);
        });
        
        // 서버에 저장 요청
        fetch(`/api/documents/edit/${systemFilename}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                headers: headers,
                data: data,
                encoding: encoding
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.status === 'success') {
                alert('✅ 파일이 성공적으로 저장되었습니다!');
                
                // 편집 모드 해제
                table.classList.remove('editing');
                const cells = table.querySelectorAll('td');
                cells.forEach(cell => {
                    cell.contentEditable = false;
                    cell.style.border = '';
                    cell.style.backgroundColor = '';
                });
                
                // 버튼 상태 복원
                const editButton = modal.querySelector('#edit-mode-btn');
                const saveButton = modal.querySelector('#save-changes-btn');
                const cancelButton = modal.querySelector('#cancel-edit-btn');
                
                if (editButton) editButton.style.display = 'inline-block';
                if (saveButton) saveButton.style.display = 'none';
                if (cancelButton) cancelButton.style.display = 'none';
                
                // 문서 목록 새로고침
                if (typeof loadDocuments === 'function') {
                    loadDocuments();
                }
            } else {
                alert('❌ 저장 중 오류가 발생했습니다: ' + result.message);
            }
        })
        .catch(error => {
            console.error('저장 오류:', error);
            alert('❌ 저장 중 오류가 발생했습니다.');
        });
    }

    // 문서 목록 로드 함수
    async function loadDocuments() {
        const documentsTable = document.getElementById('documents-table');
        const documentsTableBody = document.getElementById('documents-tbody');
        
        if (!documentsTable || !documentsTableBody) return;
        
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();
            
            if (data.files && Array.isArray(data.files)) {
                documentsTableBody.innerHTML = ''; // 기존 목록 초기화
                
                // 🚫 메타데이터 파일 완전 차단! 
                const filteredFiles = data.files.filter(file => 
                    !file.filename.endsWith('_metadata.json') && 
                    !file.filename.includes('_metadata') &&
                    !file.system_filename.endsWith('_metadata.json') &&
                    !file.system_filename.includes('_metadata')
                );
                
                if (filteredFiles.length === 0) {
                    // 파일이 없는 경우
                    documentsTable.style.display = 'none';
                    // 페이지네이션 컨테이너가 있으면 제거
                    const paginationContainer = document.getElementById('pagination-container');
                    if (paginationContainer) {
                        paginationContainer.remove();
                    }
                    return;
                }
                
                // 필터링된 문서만 저장
                allDocuments = filteredFiles;
                
                // 파일이 있는 경우
                documentsTable.style.display = 'table';
                
                // 현재 페이지에 표시할 파일 계산
                const startIndex = (currentPage - 1) * filesPerPage;
                const endIndex = Math.min(startIndex + filesPerPage, allDocuments.length);
                const currentPageFiles = allDocuments.slice(startIndex, endIndex);
                
                // 현재 페이지의 파일 목록 생성
                currentPageFiles.forEach(file => {
                    const row = document.createElement('tr');
                    const fileSize = formatFileSize(file.size);
                    
                    row.innerHTML = `
                        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; cursor: pointer; color: #30507A; text-decoration: underline; font-weight: 600;" 
                            class="clickable-filename" 
                            title="📁 클릭하여 파일 미리보기"
                            data-system-filename="${file.system_filename}"
                            data-original-filename="${file.filename}">${file.filename}</td>
                        <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">${fileSize}</td>
                        <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                            <button class="delete-btn document-delete-btn" data-system-filename="${file.system_filename}" data-displayname="${file.filename}"
                                    style="background-color: #ff5252; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-weight: bold;">
                                DELETE
                            </button>
                        </td>
                    `;
                    
                    documentsTableBody.appendChild(row);
                    
                    // 파일명 클릭 이벤트 추가
                    const filenameCell = row.querySelector('.clickable-filename');
                    if (filenameCell) {
                        filenameCell.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            const systemFilename = this.getAttribute('data-system-filename');
                            const originalFilename = this.getAttribute('data-original-filename');
                            console.log('파일명 클릭됨:', originalFilename, 'System:', systemFilename);
                            
                            // 메인페이지 파일 미리보기 함수 호출
                            if (typeof openMainPageFilePreview === 'function') {
                                openMainPageFilePreview(systemFilename, originalFilename);
                            } else {
                                console.error('openMainPageFilePreview 함수를 찾을 수 없습니다');
                            }
                        });
                        
                        // 호버 효과 추가
                        filenameCell.addEventListener('mouseenter', function() {
                            this.style.backgroundColor = '#f0f8ff';
                            this.style.color = '#1e3a5f';
                            this.style.padding = '8px';
                            this.style.borderRadius = '4px';
                        });
                        
                        filenameCell.addEventListener('mouseleave', function() {
                            this.style.backgroundColor = 'transparent';
                            this.style.color = '#30507A';
                            this.style.padding = '12px';
                            this.style.borderRadius = '0';
                        });
                    }
                    
                    // 삭제 버튼에 이벤트 리스너 추가
                    row.querySelector('.delete-btn').addEventListener('click', function() {
                        const systemFilename = this.getAttribute('data-system-filename');
                        const displayFilename = this.getAttribute('data-displayname');
                        deleteDocument(systemFilename, displayFilename);
                    });
                });
                
                // 페이지네이션 생성
                createPagination(allDocuments.length);
            }
        } catch (error) {
            console.error('문서 목록 조회 중 오류:', error);
        }
    }
    
    // 페이지네이션 UI 생성 함수
    function createPagination(totalFiles) {
        // 이전 페이지네이션 요소가 있으면 제거
        const existingPagination = document.getElementById('pagination-container');
        if (existingPagination) {
            existingPagination.remove();
        }
        
        // 총 파일 수가 5개 이하면 페이지네이션을 표시하지 않음
        const totalPages = Math.ceil(totalFiles / filesPerPage);
        if (totalPages <= 1) return;
        
        // 페이지네이션 컨테이너 생성
        const documentsContent = document.querySelector('.documents-content');
        const paginationContainer = document.createElement('div');
        paginationContainer.id = 'pagination-container';
        paginationContainer.style.cssText = 'display: flex; justify-content: center; margin-top: 20px; gap: 8px;';
        
        // 이전 버튼
        if (currentPage > 1) {
            const prevButton = document.createElement('button');
            prevButton.innerHTML = '이전';
            prevButton.className = 'pagination-btn';
            prevButton.style.cssText = 'padding: 6px 12px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 14px;';
            prevButton.addEventListener('click', () => {
                currentPage--;
                loadDocuments();
            });
            paginationContainer.appendChild(prevButton);
        }
        
        // 페이지 번호 버튼
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.innerText = i;
            pageButton.className = i === currentPage ? 'pagination-btn active' : 'pagination-btn';
            
            // 활성 페이지와 비활성 페이지 스타일 구분
            const baseStyle = 'padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 14px;';
            const activeStyle = 'background-color: #0064E1; color: white; font-weight: bold;';
            const inactiveStyle = 'background-color: #f5f5f5; color: #333;';
            
            pageButton.style.cssText = baseStyle + (i === currentPage ? activeStyle : inactiveStyle);
            
            pageButton.addEventListener('click', () => {
                if (i !== currentPage) {
                    currentPage = i;
                    loadDocuments();
                }
            });
            paginationContainer.appendChild(pageButton);
        }
        
        // 다음 버튼
        if (currentPage < totalPages) {
            const nextButton = document.createElement('button');
            nextButton.innerHTML = '다음';
            nextButton.className = 'pagination-btn';
            nextButton.style.cssText = 'padding: 6px 12px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 14px;';
            nextButton.addEventListener('click', () => {
                currentPage++;
                loadDocuments();
            });
            paginationContainer.appendChild(nextButton);
        }
        
        // 페이지네이션을 문서 목록 아래에 추가
        documentsContent.appendChild(paginationContainer);
    }
    
    // 문서 삭제 함수
    function deleteDocument(systemFilename, displayFilename) {
        if (confirm(`정말 "${displayFilename}" 파일을 삭제하시겠습니까?`)) {
            console.log(`Deleting document: ${displayFilename} (${systemFilename})`);
            
            fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_filename: systemFilename
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`"${displayFilename}" 파일이 삭제되었습니다.`);
                    // 문서 목록 다시 로드
                    loadDocuments();
                } else {
                    alert(`삭제 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
                }
            })
            .catch(error => {
                console.error('파일 삭제 API 호출 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
            });
        }
    }
    
    // 드롭다운 메뉴 초기화
    function initDropdowns() {
        const dropdowns = document.querySelectorAll('.dropdown');
        
        dropdowns.forEach(dropdown => {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            const menu = dropdown.querySelector('.dropdown-menu');
            
            // 클릭 이벤트 처리
            if (toggle && menu) {
                toggle.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 다른 열린 드롭다운 메뉴 닫기
                    dropdowns.forEach(other => {
                        if (other !== dropdown && other.classList.contains('show')) {
                            other.classList.remove('show');
                            other.querySelector('.dropdown-menu').classList.remove('show');
                        }
                    });
                    
                    // 현재 드롭다운 토글
                    dropdown.classList.toggle('show');
                    menu.classList.toggle('show');
                });
                
                // 드롭다운 메뉴 항목 클릭 시 메뉴 닫기
                menu.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        dropdown.classList.remove('show');
                        menu.classList.remove('show');
                    });
                });
            }
        });
        
        // 드롭다운 외부 클릭 시 닫기
        document.addEventListener('click', function(e) {
            dropdowns.forEach(dropdown => {
                if (!dropdown.contains(e.target) && dropdown.classList.contains('show')) {
                    dropdown.classList.remove('show');
                    dropdown.querySelector('.dropdown-menu').classList.remove('show');
                }
            });
        });
    }
    
    // 초기화 함수
    function init() {
        initTheme();
        initScrollEffects();
        initMobileMenu();
        initDropdowns(); // 드롭다운 메뉴 초기화 추가
        initChat();
        initSmoothScroll();
        initDocumentUpload();
        
        // 문서 목록 초기 로드
        loadDocuments();
    }
    
    // 초기화 실행
    init();
});