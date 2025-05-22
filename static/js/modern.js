document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 참조
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatContainer = document.getElementById('chatContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const sendButton = document.getElementById('sendButton');
    const clearButton = document.getElementById('clearButton');
    const connectionStatus = document.getElementById('connection-status');
    
    // 대화 기록 저장 키
    const CHAT_HISTORY_KEY = 'shinhan_netbot_chat_history';
    const LOCAL_CSV_DATA_KEY = 'shinhan_netbot_csv_data';
    const CONNECTION_CHECK_INTERVAL = 60000; // 1분마다 연결 확인
    
    // 페이지 로드 시 서버 연결 상태 확인
    checkConnectionStatus();
    
    // 주기적으로 서버 연결 상태 확인
    setInterval(checkConnectionStatus, CONNECTION_CHECK_INTERVAL);
    
    // 오프라인 모드 플래그
    let isOfflineMode = false;
    
    // 이전 대화 기록이 있으면 로드
    loadChatHistory();
    
    // 대화 기록 저장하기
    function saveChatHistory() {
        const messages = Array.from(chatContainer.children).map(messageDiv => {
            const text = messageDiv.querySelector('p').textContent;
            const role = messageDiv.classList.contains('user-message') ? 'user' : 'bot';
            return { text, role };
        });
        
        // 최대 50개 메시지만 저장
        const limitedMessages = messages.slice(-50);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limitedMessages));
    }
    
    // 저장된 대화 기록 로드하기
    function loadChatHistory() {
        try {
            const savedMessages = localStorage.getItem(CHAT_HISTORY_KEY);
            if (savedMessages) {
                const messages = JSON.parse(savedMessages);
                chatContainer.innerHTML = ''; // 기존 메시지 초기화
                
                // 메시지 추가
                messages.forEach(message => {
                    addMessage(message.text, message.role);
                });
                
                // 스크롤 최하단으로 이동
                scrollToBottom();
            }
        } catch (error) {
            console.error('대화 기록 로드 중 오류:', error);
        }
    }
    
    // 서버 연결 상태 확인
    function checkConnectionStatus() {
        fetch('/api/connection_status')
            .then(response => response.json())
            .then(data => {
                console.log('서버 연결 상태:', data);
                updateConnectionStatus(data.status === 'online');
                
                // 처음 로드 시 CSV 데이터 캐싱
                if (data.status === 'online' && !localStorage.getItem('csv_last_updated')) {
                    initLocalCsvData();
                }
            })
            .catch(error => {
                console.error('연결 상태 확인 중 오류:', error);
                updateConnectionStatus(false);
            });
    }
    
    // 연결 상태 UI 업데이트
    function updateConnectionStatus(isOnline) {
        isOfflineMode = !isOnline;
        console.log('연결 상태 업데이트:', isOnline ? '온라인' : '오프라인');
        
        if (connectionStatus) {
            connectionStatus.textContent = isOnline ? '온라인' : '오프라인';
            connectionStatus.className = isOnline ? 'status-badge online' : 'status-badge offline';
        }
        
        // 오프라인 모드일 때 본문에 클래스 추가
        if (isOfflineMode) {
            document.body.classList.add('offline-mode');
        } else {
            document.body.classList.remove('offline-mode');
        }
        
        // 오프라인 모드에서 CSV 데이터 캐싱 확인
        if (isOfflineMode) {
            initLocalCsvData();
        }
    }
    
    // CSV 데이터 로컬 저장소에 캐싱
    function initLocalCsvData() {
        // 이미 최근에 업데이트된 데이터가 있는지 확인
        const lastUpdated = localStorage.getItem('csv_last_updated');
        const currentTime = Date.now();
        
        // 마지막 업데이트가 1시간 이내면 재사용
        if (lastUpdated && (currentTime - parseInt(lastUpdated)) < 3600000) {
            console.log('최근에 업데이트된 CSV 데이터가 있습니다. 재사용합니다.');
            
            // 저장된 데이터가 있는지 확인
            const savedData = localStorage.getItem(LOCAL_CSV_DATA_KEY);
            if (savedData) {
                try {
                    const parsedData = JSON.parse(savedData);
                    console.log(`저장된 CSV 파일 ${parsedData.length}개를 사용합니다.`);
                    return;
                } catch (error) {
                    console.error('저장된 CSV 데이터 파싱 오류:', error);
                }
            }
        }
        
        console.log('CSV 데이터 로컬 캐싱 시작');
        
        // IndexedDB가 지원되면 사용
        if (window.OfflineStorage && typeof window.OfflineStorage.storeCSVData === 'function') {
            try {
                console.log('IndexedDB를 사용하여 CSV 데이터 캐싱 시도');
                window.OfflineStorage.storeCSVData();
                return;
            } catch (storageError) {
                console.error('IndexedDB 저장 오류:', storageError);
            }
        }
        
        // 그렇지 않으면 localStorage 사용
        try {
            fetch('/api/documents')
                .then(response => response.json())
                .then(data => {
                    // CSV 파일만 필터링
                    const csvFiles = data.files.filter(file => 
                        file.file_type === 'csv' || 
                        file.filename.toLowerCase().endsWith('.csv')
                    );
                    
                    if (csvFiles.length === 0) {
                        console.log('캐싱할 CSV 파일이 없습니다.');
                        return;
                    }
                    
                    console.log(`${csvFiles.length}개 CSV 파일 캐싱 시작`);
                    
                    // 각 CSV 파일 내용 가져와서 저장
                    Promise.all(csvFiles.map(file => 
                        fetch(`/api/view_document/${file.system_filename}`)
                            .then(response => response.json())
                            .then(fileData => {
                                if (fileData.content) {
                                    try {
                                        // CSV 파싱 (간단한 구현)
                                        const lines = fileData.content.split('\n');
                                        const headers = lines[0].split(',').map(h => h.trim());
                                        const records = [];
                                        
                                        for (let i = 1; i < lines.length; i++) {
                                            if (!lines[i].trim()) continue;
                                            
                                            const values = lines[i].split(',').map(v => v.trim());
                                            const record = {};
                                            
                                            headers.forEach((header, index) => {
                                                record[header] = values[index] || '';
                                            });
                                            
                                            records.push(record);
                                        }
                                        
                                        return {
                                            filename: file.filename,
                                            system_filename: file.system_filename,
                                            headers: headers,
                                            records: records
                                        };
                                    } catch (e) {
                                        console.error(`CSV 파일 ${file.filename} 파싱 오류:`, e);
                                        return null;
                                    }
                                }
                                return null;
                            })
                            .catch(err => {
                                console.error(`파일 ${file.filename} 로드 오류:`, err);
                                return null;
                            })
                    )).then(results => {
                        // null 값 제거
                        const validResults = results.filter(r => r !== null);
                        
                        if (validResults.length > 0) {
                            // localStorage에 저장
                            localStorage.setItem(LOCAL_CSV_DATA_KEY, JSON.stringify(validResults));
                            localStorage.setItem('csv_last_updated', Date.now().toString());
                            console.log(`${validResults.length}개 CSV 파일 캐싱 완료`);
                        } else {
                            console.log('캐싱된 CSV 파일이 없습니다.');
                        }
                    });
                })
                .catch(fetchError => {
                    console.error('CSV 파일 목록 가져오기 오류:', fetchError);
                });
        } catch (e) {
            console.error('CSV 데이터 캐싱 중 오류:', e);
        }
    }
    
    // 채팅 폼 제출 이벤트 처리
    if (chatForm) {
        chatForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const message = userInput.value.trim();
            if (!message) return;
            
            // 사용자 메시지 UI에 추가
            addMessage(message, 'user');
            userInput.value = '';
            
            // 스크롤 최하단으로 이동
            scrollToBottom();
            
            // 로딩 인디케이터 표시
            loadingIndicator.classList.add('active');
            
            // 입력 비활성화
            sendButton.style.pointerEvents = 'none';
            sendButton.style.opacity = '0.5';
            
            try {
                // 오프라인 모드이거나 API 요청 실패 시 로컬 데이터 사용
                if (isOfflineMode) {
                    console.log('오프라인 모드: 로컬 데이터 사용');
                    
                    // IndexedDB에서 검색 시도
                    if (window.OfflineStorage && window.OfflineCache) {
                        try {
                            console.log('오프라인 쿼리 처리 시도');
                            const offlineResult = await OfflineCache.handleOfflineQuery(message);
                            
                            if (offlineResult && offlineResult.success) {
                                const offlineResponse = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + 
                                                       offlineResult.data.text;
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
                        addMessage('[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + localResponse, 'bot');
                    } else {
                        addMessage('[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n현재 오프라인 상태입니다. 로컬 데이터에서 관련 정보를 찾을 수 없습니다.', 'bot');
                    }
                } else {
                    // 서버 API 호출
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
                            const offlineResponse = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + 
                                                   offlineResult.data.text;
                            addMessageWithTypingEffect(offlineResponse, 'bot');
                            return;
                        }
                    } catch (offlineError) {
                        console.error('오프라인 응답 생성 중 오류:', offlineError);
                    }
                }
                
                // localStorage에서 검색 시도 (fallback)
                const localResponse = getLocalResponse(message);
                if (localResponse) {
                    addMessage('[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]\n\n' + localResponse, 'bot');
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
        userInput.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });
        
        userInput.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
        });
        
        // 자동 높이 조절
        userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            const maxHeight = window.innerHeight * 0.3; // 화면 높이의 30%로 제한
            this.style.height = Math.min(this.scrollHeight, maxHeight) + 'px';
        });
        
        // Enter 키 처리 (Shift+Enter는 줄바꿈)
        userInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        });
    }
    
    // 채팅 초기화 버튼
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            if (confirm('대화 내용을 모두 지우시겠습니까?')) {
                chatContainer.innerHTML = '';
                localStorage.removeItem(CHAT_HISTORY_KEY);
                
                // 시작 메시지 추가
                addMessage('안녕하세요! 신한은행 네트워크 챗봇입니다. 무엇을 도와드릴까요?', 'bot');
            }
        });
    }
    
    // 메시지 추가 함수
    function addMessage(text, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = role === 'user' ? 'message user-message' : 'message bot-message';
        
        // 아이콘 추가
        const iconSpan = document.createElement('span');
        iconSpan.className = 'message-icon';
        iconSpan.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        messageDiv.appendChild(iconSpan);
        
        // 메시지 내용 추가
        const messagePara = document.createElement('p');
        
        // 마크다운 형식 처리 (선택적)
        if (window.markdownit && role === 'bot') {
            // 코드 블록 또는 인라인 코드가 있는지 확인
            const hasCodeBlock = text.includes('```') || text.includes('`');
            
            // 마크다운 변환
            messagePara.innerHTML = window.md.render(text);
            
            // 코드 블록이 있으면 하이라이트 적용
            if (hasCodeBlock && window.hljs) {
                messageDiv.querySelectorAll('pre code').forEach((block) => {
                    window.hljs.highlightBlock(block);
                });
            }
            
            // 테이블에 클래스 추가
            messageDiv.querySelectorAll('table').forEach((table) => {
                table.classList.add('markdown-table');
            });
        } else {
            // 일반 텍스트로 처리 (줄바꿈 보존)
            messagePara.innerHTML = text.replace(/\n/g, '<br>');
        }
        
        messageDiv.appendChild(messagePara);
        
        // 시간 표시 추가
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        timeSpan.textContent = `${hours}:${minutes}`;
        
        messageDiv.appendChild(timeSpan);
        
        // 채팅 컨테이너에 추가
        chatContainer.appendChild(messageDiv);
        
        // 스크롤 최하단으로 이동
        scrollToBottom();
        
        // 대화 기록 저장
        saveChatHistory();
        
        return messageDiv;
    }
    
    // 타이핑 효과를 가진 메시지 추가
    function addMessageWithTypingEffect(text, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = role === 'user' ? 'message user-message' : 'message bot-message';
        
        // 아이콘 추가
        const iconSpan = document.createElement('span');
        iconSpan.className = 'message-icon';
        iconSpan.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        messageDiv.appendChild(iconSpan);
        
        // 메시지 내용 추가
        const messagePara = document.createElement('p');
        messagePara.className = 'typing-effect';
        messageDiv.appendChild(messagePara);
        
        // 시간 표시 추가
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        timeSpan.textContent = `${hours}:${minutes}`;
        
        messageDiv.appendChild(timeSpan);
        
        // 채팅 컨테이너에 추가
        chatContainer.appendChild(messageDiv);
        
        // 스크롤 최하단으로 이동
        scrollToBottom();
        
        // 타이핑 효과 시작
        let i = 0;
        const typingSpeed = 15; // 타이핑 속도 (ms)
        
        // 마크다운 형식인 경우를 대비해 전체 텍스트를 먼저 저장
        const fullText = text;
        
        function typeNextCharacter() {
            if (i < fullText.length) {
                // 현재까지의 텍스트 조각
                const currentText = fullText.substring(0, i + 1);
                
                // 마크다운 처리 (선택적)
                if (window.markdownit && role === 'bot') {
                    messagePara.innerHTML = window.md.render(currentText);
                    
                    // 코드 블록에 하이라이트 적용
                    if (window.hljs) {
                        messageDiv.querySelectorAll('pre code').forEach((block) => {
                            window.hljs.highlightBlock(block);
                        });
                    }
                    
                    // 테이블에 클래스 추가
                    messageDiv.querySelectorAll('table').forEach((table) => {
                        table.classList.add('markdown-table');
                    });
                } else {
                    // 일반 텍스트로 처리
                    messagePara.innerHTML = currentText.replace(/\n/g, '<br>');
                }
                
                i++;
                
                // 다음 문자 타이핑
                setTimeout(typeNextCharacter, typingSpeed);
                
                // 스크롤 유지
                scrollToBottom();
            } else {
                // 타이핑 완료 후 클래스 제거
                messagePara.classList.remove('typing-effect');
                
                // 대화 기록 저장
                saveChatHistory();
            }
        }
        
        // 타이핑 시작
        typeNextCharacter();
        
        return messageDiv;
    }
    
    // 스크롤을 최하단으로 이동
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // 로컬 스토리지에서 데이터 검색
    function getLocalResponse(query) {
        if (!query) return null;
        
        try {
            // 1. IP 주소 형식 검색
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
        } catch (error) {
            console.error('로컬 데이터 검색 중 오류:', error);
            return null;
        }
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
                        // 각 레코드의 모든 필드 검색
                        for (const [key, value] of Object.entries(record)) {
                            if (typeof value === 'string' && (value === ipAddress || 
                                (key.toLowerCase().includes('ip') && value.includes(ipAddress)))) {
                                // IP 주소 일치하는 레코드 발견
                                foundRecord = record;
                                sourceFilename = file.filename;
                                console.log(`IP 주소 ${ipAddress} 레코드 찾음:`, record);
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
                            if (typeof value === 'string' && (value === ipAddress || 
                                (key.toLowerCase().includes('ip') && value.includes(ipAddress)))) {
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
            
            // 레코드를 찾았으면 응답 생성
            if (foundRecord) {
                let response = `IP ${ipAddress} 정보:\n\n`;
                
                // 레코드의 각 필드를 응답에 추가
                for (const [key, value] of Object.entries(foundRecord)) {
                    if (value && key.trim() !== "") {
                        // 키 이름 가독성 향상
                        let displayKey = key;
                        
                        // 특정 필드명 자연어 변환
                        if (key.match(/^[A-G]$/)) {
                            // A,B,C 등의 단일 문자 필드명 변환
                            switch(key) {
                                case 'A': displayKey = '사용자'; break;
                                case 'B': displayKey = '부서'; break;
                                case 'C': displayKey = '연락처'; break;
                                case 'D': displayKey = '상태'; break;
                                case 'E': displayKey = '날짜'; break;
                                case 'F': displayKey = '비고'; break;
                                case 'G': displayKey = '수정일'; break;
                                default: displayKey = key;
                            }
                        } else if (key.toLowerCase().includes('ip')) {
                            displayKey = 'IP 주소';
                        } else if (key.toLowerCase().includes('user') || key.toLowerCase().includes('name')) {
                            displayKey = '사용자';
                        } else if (key.toLowerCase().includes('dept')) {
                            displayKey = '부서';
                        } else if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
                            displayKey = '날짜';
                        } else if (key.toLowerCase().includes('status')) {
                            displayKey = '상태';
                        } else if (key.toLowerCase().includes('contact') || key.toLowerCase().includes('phone')) {
                            displayKey = '연락처';
                        }
                        
                        response += `${displayKey}: ${value}\n`;
                    }
                }
                
                // 데이터 출처 표시
                response += `\n(출처: ${sourceFilename})`;
                
                return response;
            }
            
            return null;
        } catch (error) {
            console.error('IP 주소 검색 중 오류:', error);
            return null;
        }
    }
    
    // 로컬 CSV 데이터에서 키워드 검색
    function searchKeywordsInLocalData(keywords) {
        try {
            const csvDataString = localStorage.getItem(LOCAL_CSV_DATA_KEY);
            if (!csvDataString) return null;
            
            const csvData = JSON.parse(csvDataString);
            
            // 디버깅용 로그
            console.log(`키워드 검색 시작, 로컬 CSV 파일 ${csvData.length}개 대상`);
            
            let bestMatches = [];
            let highestScore = 0;
            
            // 모든 CSV 파일 검색
            for (const file of csvData) {
                for (const record of file.records) {
                    // 각 레코드의 모든 필드에서 키워드 검색
                    let matchScore = 0;
                    let matchedKeywords = [];
                    
                    for (const keyword of keywords) {
                        for (const [key, value] of Object.entries(record)) {
                            if (typeof value === 'string' && value.toLowerCase().includes(keyword.toLowerCase())) {
                                matchScore++;
                                if (!matchedKeywords.includes(keyword)) {
                                    matchedKeywords.push(keyword);
                                }
                            }
                        }
                    }
                    
                    // 일치하는 키워드가 있으면 점수 계산
                    if (matchScore > 0) {
                        // 새로운 최고 점수인 경우 배열 초기화
                        if (matchScore > highestScore) {
                            highestScore = matchScore;
                            bestMatches = [{
                                record,
                                filename: file.filename,
                                score: matchScore,
                                matchedKeywords
                            }];
                        } 
                        // 최고 점수와 동일한 경우 배열에 추가
                        else if (matchScore === highestScore) {
                            bestMatches.push({
                                record,
                                filename: file.filename,
                                score: matchScore,
                                matchedKeywords
                            });
                        }
                    }
                }
            }
            
            // 최고 점수 결과가 있으면 응답 생성
            if (bestMatches.length > 0) {
                // 최대 3개까지만 결과 표시
                const limitedMatches = bestMatches.slice(0, 3);
                
                let response = `키워드 "${keywords.join(', ')}" 검색 결과:\n\n`;
                
                for (let i = 0; i < limitedMatches.length; i++) {
                    const match = limitedMatches[i];
                    response += `결과 ${i+1}:\n`;
                    
                    // 레코드의 주요 필드 추가
                    for (const [key, value] of Object.entries(match.record)) {
                        if (value && key.trim() !== "") {
                            // 키 이름 가독성 향상
                            let displayKey = key;
                            
                            // 특정 필드명 자연어 변환
                            if (key.match(/^[A-G]$/)) {
                                // A,B,C 등의 단일 문자 필드명 변환
                                switch(key) {
                                    case 'A': displayKey = '사용자'; break;
                                    case 'B': displayKey = '부서'; break;
                                    case 'C': displayKey = '연락처'; break;
                                    case 'D': displayKey = '상태'; break;
                                    case 'E': displayKey = '날짜'; break;
                                    case 'F': displayKey = '비고'; break;
                                    case 'G': displayKey = '수정일'; break;
                                    default: displayKey = key;
                                }
                            } else if (key.toLowerCase().includes('ip')) {
                                displayKey = 'IP 주소';
                            } else if (key.toLowerCase().includes('user') || key.toLowerCase().includes('name')) {
                                displayKey = '사용자';
                            } else if (key.toLowerCase().includes('dept')) {
                                displayKey = '부서';
                            } else if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
                                displayKey = '날짜';
                            } else if (key.toLowerCase().includes('status')) {
                                displayKey = '상태';
                            } else if (key.toLowerCase().includes('contact') || key.toLowerCase().includes('phone')) {
                                displayKey = '연락처';
                            }
                            
                            response += `${displayKey}: ${value}\n`;
                        }
                    }
                    
                    response += `(출처: ${match.filename})\n\n`;
                }
                
                return response;
            }
            
            return null;
        } catch (error) {
            console.error('키워드 검색 중 오류:', error);
            return null;
        }
    }
    
    // 피드백 기능
    const feedbackButtons = document.querySelectorAll('.feedback-btn');
    if (feedbackButtons) {
        feedbackButtons.forEach(button => {
            button.addEventListener('click', function() {
                const type = this.dataset.type;
                const messageElement = this.closest('.message');
                
                if (!messageElement) return;
                
                // 피드백 처리
                submitFeedback(messageElement, type)
                    .then(() => {
                        // 피드백 버튼 비활성화
                        feedbackButtons.forEach(btn => {
                            if (btn.closest('.message') === messageElement) {
                                btn.disabled = true;
                                btn.classList.add('feedback-submitted');
                            }
                        });
                        
                        // 메시지에 피드백 제출 완료 표시
                        const feedbackIndicator = document.createElement('div');
                        feedbackIndicator.className = 'feedback-indicator';
                        feedbackIndicator.textContent = '피드백 제출 완료';
                        messageElement.appendChild(feedbackIndicator);
                        
                        // 잠시 후 표시 제거
                        setTimeout(() => {
                            feedbackIndicator.style.opacity = '0';
                            setTimeout(() => {
                                feedbackIndicator.remove();
                            }, 500);
                        }, 2000);
                    })
                    .catch(error => {
                        console.error('피드백 제출 중 오류:', error);
                        alert('피드백 제출 중 오류가 발생했습니다.');
                    });
            });
        });
    }
    
    // 피드백 제출 함수
    async function submitFeedback(messageElement, type) {
        if (!messageElement) return;
        
        // 메시지 텍스트 가져오기
        const messageText = messageElement.querySelector('p').textContent;
        
        // 이전 메시지 찾기 (사용자 질문)
        let questionText = '';
        let prevElement = messageElement.previousElementSibling;
        
        if (prevElement && prevElement.classList.contains('user-message')) {
            questionText = prevElement.querySelector('p').textContent;
        }
        
        // 서버에 피드백 제출
        const response = await fetch('/api/chat_feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: questionText,
                answer: messageText,
                feedback_type: type
            })
        });
        
        if (!response.ok) {
            throw new Error('피드백 제출 실패');
        }
        
        return response.json();
    }
    
    // 테마 토글 기능
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // 저장된 테마 적용
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
            themeToggle.checked = savedTheme === 'dark';
        }
        
        // 테마 변경 이벤트
        themeToggle.addEventListener('change', function() {
            const newTheme = this.checked ? 'dark' : 'light';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
});

// 파일 드래그 앤 드롭 처리
document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.getElementById('dragDropArea');
    const fileInput = document.getElementById('fileInput');
    const uploadForm = document.getElementById('uploadForm');
    
    // 드래그 앤 드롭 영역이 있는 경우에만 이벤트 처리
    if (dropArea && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropArea.classList.add('drag-active');
        }
        
        function unhighlight() {
            dropArea.classList.remove('drag-active');
        }
        
        // 파일 드롭 처리
        dropArea.addEventListener('drop', handleDrop, false);
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0) {
                fileInput.files = files;
                handleFiles(files);
            }
        }
        
        // 파일 처리 함수
        function handleFiles(files) {
            // 선택한 파일 표시
            const fileList = document.getElementById('selectedFiles');
            if (fileList) {
                fileList.innerHTML = '';
                
                for (let i = 0; i < files.length; i++) {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.innerHTML = `
                        <span class="file-name">${files[i].name}</span>
                        <span class="file-size">(${formatFileSize(files[i].size)})</span>
                    `;
                    fileList.appendChild(fileItem);
                }
                
                // 업로드 버튼 활성화
                const uploadButton = document.querySelector('#uploadForm button[type="submit"]');
                if (uploadButton) {
                    uploadButton.disabled = false;
                }
            }
            
            // 크기가 큰 파일인 경우 청크 분할 업로드 방식 사용
            const largeFiles = Array.from(files).filter(file => file.size > 5 * 1024 * 1024); // 5MB 초과
            
            if (largeFiles.length > 0) {
                // 폼 제출 이벤트 가로채기
                uploadForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    // 대용량 파일 처리
                    for (const file of largeFiles) {
                        uploadLargeFile(file);
                    }
                    
                    // 일반 크기 파일은 기본 방식으로 업로드
                    const regularFiles = Array.from(files).filter(file => file.size <= 5 * 1024 * 1024);
                    if (regularFiles.length > 0) {
                        const regularFormData = new FormData();
                        regularFiles.forEach(file => regularFormData.append('file', file));
                        
                        fetch('/api/upload', {
                            method: 'POST',
                            body: regularFormData
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log('일반 파일 업로드 결과:', data);
                            updateUploadStatus(data);
                        })
                        .catch(error => {
                            console.error('일반 파일 업로드 오류:', error);
                            showUploadError('파일 업로드 중 오류가 발생했습니다.');
                        });
                    }
                });
            }
        }
        
        // 파일 크기 포맷
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // 대용량 파일 업로드 함수
        function uploadLargeFile(file) {
            const chunkSize = 2 * 1024 * 1024; // 2MB 청크
            const totalChunks = Math.ceil(file.size / chunkSize);
            const sessionId = Date.now().toString(); // 세션 ID 생성
            
            // 업로드 상태 초기화
            initUploadStatus(file.name, totalChunks);
            
            // 청크 단위로 업로드
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                
                // 폼 데이터 생성
                const formData = new FormData();
                formData.append('filename', file.name);
                formData.append('chunkIndex', chunkIndex);
                formData.append('totalChunks', totalChunks);
                formData.append('chunkData', chunk);
                formData.append('sessionId', sessionId);
                
                // 청크 업로드
                fetch('/api/upload_chunk', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    updateChunkProgress(file.name, chunkIndex, totalChunks);
                    
                    // 모든 청크 업로드 완료 시
                    if (data.status === 'all_chunks_received') {
                        completeUpload(file.name);
                    }
                })
                .catch(error => {
                    console.error(`청크 업로드 오류 (${chunkIndex}/${totalChunks}):`, error);
                    showUploadError(`파일 "${file.name}" 청크 업로드 중 오류가 발생했습니다.`);
                });
            }
        }
        
        // 업로드 상태 초기화
        function initUploadStatus(fileName, totalChunks) {
            const statusContainer = document.getElementById('uploadStatus');
            if (!statusContainer) return;
            
            const fileStatus = document.createElement('div');
            fileStatus.className = 'file-upload-status';
            fileStatus.dataset.file = fileName;
            
            fileStatus.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${fileName}</span>
                    <span class="upload-progress">0/${totalChunks} 청크 (0%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%"></div>
                </div>
            `;
            
            statusContainer.appendChild(fileStatus);
        }
        
        // 청크 업로드 진행 상태 업데이트
        function updateChunkProgress(fileName, chunkIndex, totalChunks) {
            const statusContainer = document.getElementById('uploadStatus');
            if (!statusContainer) return;
            
            const fileStatus = statusContainer.querySelector(`.file-upload-status[data-file="${fileName}"]`);
            if (!fileStatus) return;
            
            const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
            
            fileStatus.querySelector('.upload-progress').textContent = 
                `${chunkIndex + 1}/${totalChunks} 청크 (${progress}%)`;
            fileStatus.querySelector('.progress').style.width = `${progress}%`;
        }
        
        // 업로드 완료 처리
        function completeUpload(fileName) {
            const statusContainer = document.getElementById('uploadStatus');
            if (!statusContainer) return;
            
            const fileStatus = statusContainer.querySelector(`.file-upload-status[data-file="${fileName}"]`);
            if (!fileStatus) return;
            
            fileStatus.classList.add('upload-complete');
            fileStatus.querySelector('.upload-progress').textContent = '업로드 완료';
            
            // 모든 파일 업로드 확인
            const allComplete = Array.from(
                statusContainer.querySelectorAll('.file-upload-status')
            ).every(el => el.classList.contains('upload-complete'));
            
            if (allComplete) {
                // 모든 파일 업로드 완료 처리
                showUploadSuccess('모든 파일이 업로드 되었습니다.');
                
                // 파일 목록 가져오기
                setTimeout(() => {
                    fetchDocumentList();
                }, 1000);
            }
        }
        
        // 업로드 상태 업데이트
        function updateUploadStatus(data) {
            if (data.status === 'success') {
                showUploadSuccess('파일이 성공적으로 업로드 되었습니다.');
                
                // 파일 목록 가져오기
                setTimeout(() => {
                    fetchDocumentList();
                }, 1000);
            } else {
                showUploadError(data.message || '업로드 중 오류가 발생했습니다.');
            }
        }
        
        // 성공 메시지 표시
        function showUploadSuccess(message) {
            const alertBox = document.createElement('div');
            alertBox.className = 'alert alert-success';
            alertBox.textContent = message;
            
            const container = document.querySelector('.upload-container');
            if (container) {
                container.prepend(alertBox);
                
                // 3초 후 메시지 제거
                setTimeout(() => {
                    alertBox.style.opacity = '0';
                    setTimeout(() => alertBox.remove(), 300);
                }, 3000);
            }
        }
        
        // 오류 메시지 표시
        function showUploadError(message) {
            const alertBox = document.createElement('div');
            alertBox.className = 'alert alert-error';
            alertBox.textContent = message;
            
            const container = document.querySelector('.upload-container');
            if (container) {
                container.prepend(alertBox);
                
                // 5초 후 메시지 제거
                setTimeout(() => {
                    alertBox.style.opacity = '0';
                    setTimeout(() => alertBox.remove(), 300);
                }, 5000);
            }
        }
        
        // 파일 목록 가져오기 함수
        function fetchDocumentList() {
            const fileListElement = document.getElementById('document-list');
            if (!fileListElement) return;
            
            fetch('/api/documents')
                .then(response => response.json())
                .then(data => {
                    if (data.files && data.files.length > 0) {
                        const fileList = document.getElementById('document-list');
                        fileList.innerHTML = ''; // 목록 초기화
                        
                        // 파일 유형별 정렬 (PDF, Excel, Word, 기타)
                        const sortedFiles = data.files.sort((a, b) => {
                            // 파일 유형 순서 정의
                            const typeOrder = {
                                'pdf': 1,
                                'xlsx': 2,
                                'xls': 2,
                                'docx': 3,
                                'doc': 3,
                                'pptx': 4,
                                'ppt': 4,
                                'csv': 5,
                                'txt': 6
                            };
                            
                            const typeA = a.file_type.toLowerCase();
                            const typeB = b.file_type.toLowerCase();
                            
                            // 유형이 같으면 이름으로 정렬
                            if (typeOrder[typeA] === typeOrder[typeB]) {
                                return a.filename.localeCompare(b.filename);
                            }
                            
                            // 유형 순서대로 정렬
                            return (typeOrder[typeA] || 99) - (typeOrder[typeB] || 99);
                        });
                        
                        // 파일 목록 생성
                        sortedFiles.forEach(file => {
                            const fileItem = document.createElement('div');
                            fileItem.className = 'document-item';
                            fileItem.dataset.filename = file.system_filename;
                            
                            // 파일 아이콘 선택
                            let iconClass = 'fa-file';
                            if (file.file_type === 'pdf') {
                                iconClass = 'fa-file-pdf';
                            } else if (['xlsx', 'xls', 'csv'].includes(file.file_type)) {
                                iconClass = 'fa-file-excel';
                            } else if (['docx', 'doc'].includes(file.file_type)) {
                                iconClass = 'fa-file-word';
                            } else if (['pptx', 'ppt'].includes(file.file_type)) {
                                iconClass = 'fa-file-powerpoint';
                            } else if (file.file_type === 'txt') {
                                iconClass = 'fa-file-alt';
                            }
                            
                            // 파일 크기 포맷
                            const fileSize = formatFileSize(file.size);
                            
                            // 업로드 날짜 포맷
                            const uploadDate = new Date(file.uploaded_at * 1000).toLocaleString();
                            
                            fileItem.innerHTML = `
                                <div class="document-icon">
                                    <i class="fas ${iconClass}"></i>
                                </div>
                                <div class="document-info">
                                    <div class="document-name">${file.filename}</div>
                                    <div class="document-meta">
                                        <span class="document-type">${file.file_type.toUpperCase()}</span>
                                        <span class="document-size">${fileSize}</span>
                                        <span class="document-date">${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="document-actions">
                                    <button class="view-btn" data-filename="${file.system_filename}">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="edit-btn" data-filename="${file.system_filename}">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="delete-btn" data-filename="${file.system_filename}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `;
                            
                            fileList.appendChild(fileItem);
                        });
                        
                        // 파일 액션 이벤트 추가
                        addFileActionListeners();
                    } else {
                        document.getElementById('document-list').innerHTML = 
                            '<div class="no-documents">업로드된 문서가 없습니다</div>';
                    }
                })
                .catch(error => {
                    console.error('문서 목록 가져오기 오류:', error);
                    document.getElementById('document-list').innerHTML = 
                        '<div class="error-message">문서 목록을 가져오는 중 오류가 발생했습니다</div>';
                });
        }
        
        // 파일 액션 이벤트 리스너 추가
        function addFileActionListeners() {
            // 보기 버튼
            document.querySelectorAll('.view-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const filename = this.dataset.filename;
                    viewDocument(filename);
                });
            });
            
            // 수정 버튼
            document.querySelectorAll('.edit-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const filename = this.dataset.filename;
                    editDocument(filename);
                });
            });
            
            // 삭제 버튼
            document.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const filename = this.dataset.filename;
                    if (confirm('정말 이 파일을 삭제하시겠습니까?')) {
                        deleteDocument(filename);
                    }
                });
            });
        }
        
        // 문서 보기 함수
        function viewDocument(filename) {
            fetch(`/api/view_document/${filename}`)
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        // 문서 뷰어 모달 표시
                        showDocumentViewer(data.filename, data.content, data.format);
                    } else {
                        alert('문서를 불러오는 중 오류가 발생했습니다: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('문서 보기 오류:', error);
                    alert('문서를 불러오는 중 오류가 발생했습니다.');
                });
        }
        
        // 문서 수정 함수
        function editDocument(filename) {
            fetch(`/api/edit_document/${filename}`)
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        // 문서 편집기 모달 표시
                        showDocumentEditor(filename, data.content, data.format);
                    } else {
                        alert('문서를 불러오는 중 오류가 발생했습니다: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('문서 수정 오류:', error);
                    alert('문서를 불러오는 중 오류가 발생했습니다.');
                });
        }
        
        // 문서 삭제 함수
        function deleteDocument(filename) {
            fetch('/api/delete_file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filename })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 성공 메시지 표시
                    showUploadSuccess('파일이 성공적으로 삭제되었습니다.');
                    
                    // 파일 목록 업데이트
                    fetchDocumentList();
                } else {
                    alert('파일 삭제 중 오류가 발생했습니다: ' + data.message);
                }
            })
            .catch(error => {
                console.error('파일 삭제 오류:', error);
                alert('파일 삭제 중 오류가 발생했습니다.');
            });
        }
        
        // 문서 뷰어 모달 표시
        function showDocumentViewer(filename, content, format) {
            // 모달 생성
            const modal = document.createElement('div');
            modal.className = 'document-modal';
            
            // 모달 내용 생성
            let contentHtml = '';
            
            // 포맷에 따라 다른 뷰어 사용
            if (format === 'csv') {
                contentHtml = createCsvViewer(content);
            } else if (format === 'pdf') {
                contentHtml = createPdfViewer(filename);
            } else {
                // 텍스트 기반 포맷
                contentHtml = `<pre class="document-content">${content}</pre>`;
            }
            
            // 모달 HTML 구성
            modal.innerHTML = `
                <div class="document-modal-content">
                    <div class="document-modal-header">
                        <h3>${filename}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="document-modal-body">
                        ${contentHtml}
                    </div>
                </div>
            `;
            
            // 모달 추가 및 표시
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('visible'), 10);
            
            // 닫기 버튼 이벤트
            modal.querySelector('.modal-close-btn').addEventListener('click', function() {
                modal.classList.remove('visible');
                setTimeout(() => modal.remove(), 300);
            });
            
            // 모달 외부 클릭 시 닫기
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.classList.remove('visible');
                    setTimeout(() => modal.remove(), 300);
                }
            });
        }
        
        // CSV 뷰어 생성
        function createCsvViewer(csvContent) {
            // CSV 파싱
            const rows = csvContent.split('\n');
            const headers = rows[0].split(',').map(h => h.trim());
            
            // 테이블 HTML 생성
            let tableHtml = '<table class="csv-table"><thead><tr>';
            
            // 헤더 행 생성
            headers.forEach(header => {
                tableHtml += `<th>${header}</th>`;
            });
            
            tableHtml += '</tr></thead><tbody>';
            
            // 데이터 행 생성
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                
                const values = rows[i].split(',').map(v => v.trim());
                tableHtml += '<tr>';
                
                values.forEach((value, index) => {
                    if (index < headers.length) {
                        tableHtml += `<td>${value}</td>`;
                    }
                });
                
                tableHtml += '</tr>';
            }
            
            tableHtml += '</tbody></table>';
            
            return `<div class="csv-viewer">${tableHtml}</div>`;
        }
        
        // PDF 뷰어 생성
        function createPdfViewer(filename) {
            return `
                <div class="pdf-viewer">
                    <iframe src="/api/view_document/${filename}?format=html" width="100%" height="600px"></iframe>
                </div>
            `;
        }
        
        // 문서 편집기 모달 표시
        function showDocumentEditor(filename, content, format) {
            // 편집 가능한 포맷인지 확인
            if (!['txt', 'csv'].includes(format.toLowerCase())) {
                alert('이 파일 형식은 웹에서 직접 편집할 수 없습니다.');
                return;
            }
            
            // 모달 생성
            const modal = document.createElement('div');
            modal.className = 'document-modal editor-modal';
            
            // 포맷에 따라 다른 에디터 사용
            let editorHtml = '';
            if (format === 'csv') {
                editorHtml = `<div id="csv-editor" class="csv-editor-container"></div>`;
            } else {
                // 텍스트 에디터
                editorHtml = `<textarea id="text-editor" class="text-editor">${content}</textarea>`;
            }
            
            // 모달 HTML 구성
            modal.innerHTML = `
                <div class="document-modal-content">
                    <div class="document-modal-header">
                        <h3>편집: ${filename}</h3>
                        <button class="modal-close-btn">&times;</button>
                    </div>
                    <div class="document-modal-body">
                        ${editorHtml}
                    </div>
                    <div class="document-modal-footer">
                        <button id="save-document" class="primary-btn">저장</button>
                        <button id="cancel-document" class="secondary-btn">취소</button>
                    </div>
                </div>
            `;
            
            // 모달 추가 및 표시
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('visible'), 10);
            
            // CSV 에디터 초기화
            if (format === 'csv') {
                initCsvEditor(filename, content);
            }
            
            // 닫기 버튼 이벤트
            modal.querySelector('.modal-close-btn').addEventListener('click', function() {
                if (confirm('변경 사항이 저장되지 않을 수 있습니다. 계속하시겠습니까?')) {
                    modal.classList.remove('visible');
                    setTimeout(() => modal.remove(), 300);
                }
            });
            
            // 취소 버튼 이벤트
            modal.querySelector('#cancel-document').addEventListener('click', function() {
                if (confirm('변경 사항이 저장되지 않을 수 있습니다. 계속하시겠습니까?')) {
                    modal.classList.remove('visible');
                    setTimeout(() => modal.remove(), 300);
                }
            });
            
            // 모달 외부 클릭 시 확인
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    if (confirm('변경 사항이 저장되지 않을 수 있습니다. 계속하시겠습니까?')) {
                        modal.classList.remove('visible');
                        setTimeout(() => modal.remove(), 300);
                    }
                }
            });
            
            // 저장 버튼 이벤트
            modal.querySelector('#save-document').addEventListener('click', function() {
                let updatedContent = '';
                
                if (format === 'csv') {
                    // CSV 에디터의 데이터 가져오기
                    updatedContent = getCsvEditorContent();
                } else {
                    // 텍스트 에디터의 내용 가져오기
                    updatedContent = document.getElementById('text-editor').value;
                }
                
                // 변경 내용 저장
                saveDocumentChanges(filename, updatedContent)
                    .then(success => {
                        if (success) {
                            modal.classList.remove('visible');
                            setTimeout(() => modal.remove(), 300);
                            
                            // 성공 메시지 표시
                            showUploadSuccess('문서가 성공적으로 저장되었습니다.');
                        }
                    });
            });
        }
        
        // CSV 에디터 초기화
        function initCsvEditor(filename, content) {
            // CSV 파싱
            const rows = content.split('\n');
            const headers = rows[0].split(',').map(h => h.trim());
            const data = [];
            
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                
                const values = rows[i].split(',').map(v => v.trim());
                const row = {};
                
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                
                data.push(row);
            }
            
            // 여기서 CSV 에디터 라이브러리 초기화
            // 예: 간단한 HTML 테이블 에디터 구현
            const csvEditor = document.getElementById('csv-editor');
            
            let tableHtml = '<table id="editable-csv-table" class="csv-editor-table"><thead><tr>';
            headers.forEach(header => {
                tableHtml += `<th contenteditable="true">${header}</th>`;
            });
            tableHtml += '<th class="action-column">+</th></tr></thead><tbody>';
            
            data.forEach((row, rowIndex) => {
                tableHtml += '<tr>';
                headers.forEach(header => {
                    tableHtml += `<td contenteditable="true">${row[header] || ''}</td>`;
                });
                tableHtml += `<td class="action-column"><button class="delete-row-btn" data-row="${rowIndex}">×</button></td></tr>`;
            });
            
            tableHtml += '</tbody></table>';
            
            csvEditor.innerHTML = tableHtml;
            
            // 행 삭제 버튼 이벤트
            document.querySelectorAll('.delete-row-btn').forEach(button => {
                button.addEventListener('click', function() {
                    if (confirm('이 행을 삭제하시겠습니까?')) {
                        this.closest('tr').remove();
                    }
                });
            });
            
            // 새 행 추가 버튼 (헤더의 '+' 열)
            const addRowButton = document.querySelector('#editable-csv-table thead th.action-column');
            if (addRowButton) {
                addRowButton.addEventListener('click', function() {
                    const tbody = document.querySelector('#editable-csv-table tbody');
                    const newRow = document.createElement('tr');
                    
                    let cellsHtml = '';
                    headers.forEach(() => {
                        cellsHtml += '<td contenteditable="true"></td>';
                    });
                    
                    cellsHtml += `<td class="action-column"><button class="delete-row-btn">×</button></td>`;
                    newRow.innerHTML = cellsHtml;
                    
                    tbody.appendChild(newRow);
                    
                    // 새 행의 삭제 버튼 이벤트 추가
                    newRow.querySelector('.delete-row-btn').addEventListener('click', function() {
                        if (confirm('이 행을 삭제하시겠습니까?')) {
                            this.closest('tr').remove();
                        }
                    });
                });
            }
        }
        
        // CSV 에디터 내용 가져오기
        function getCsvEditorContent() {
            const table = document.getElementById('editable-csv-table');
            const headers = Array.from(table.querySelectorAll('thead th:not(.action-column)'))
                .map(th => th.textContent.trim());
                
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            
            let csvContent = headers.join(',') + '\n';
            
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td:not(.action-column)'))
                    .map(cell => cell.textContent.trim());
                    
                csvContent += cells.join(',') + '\n';
            });
            
            return csvContent;
        }
        
        // 문서 변경 사항 저장
        async function saveDocumentChanges(filename, content) {
            try {
                const response = await fetch('/api/edit_document/' + filename, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    return true;
                } else {
                    alert('문서 저장 중 오류가 발생했습니다: ' + data.message);
                    return false;
                }
            } catch (error) {
                console.error('문서 저장 오류:', error);
                alert('문서 저장 중 오류가 발생했습니다.');
                return false;
            }
        }
    }
});