/**
 * IP 주소 검색 결과를 자연어 형태로 변환하는 기능
 * 오프라인 모드에서도 자연스러운 응답 제공
 */

document.addEventListener('DOMContentLoaded', function() {
    // 채팅 컨테이너 참조
    const chatContainer = document.getElementById('chatContainer');
    
    // 채팅 컨테이너에 변경사항 감지를 위한 옵저버 설정
    if (chatContainer) {
        // 채팅 메시지 변경 감지용 MutationObserver 설정
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        
                        // 봇 메시지이면서 오프라인 모드 표시가 있는 경우
                        if (node.classList && 
                            node.classList.contains('bot-message') && 
                            node.textContent.includes('서버 연결이 끊겼습니다')) {
                            
                            // IP 주소 패턴 검색
                            const messageText = node.textContent;
                            const ipMatch = messageText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
                            
                            if (ipMatch) {
                                const ipAddress = ipMatch[0];
                                console.log('오프라인 IP 주소 응답 감지:', ipAddress);
                                
                                // A:, B: 형식 패턴 검색
                                let formattedText = messageText;
                                const alphaPattern = /([A-G])\s*[:]\s*([^.,;]+)(?=[,.]|\s|$)/g;
                                
                                // 추출 데이터 저장
                                const extractedData = {};
                                let match;
                                
                                // 모든 알파벳 패턴 추출
                                while ((match = alphaPattern.exec(messageText)) !== null) {
                                    const key = match[1];
                                    const value = match[2].trim();
                                    extractedData[key] = value;
                                    console.log(`알파벳 패턴 매칭: ${key} => ${value}`);
                                }
                                
                                // 추출 데이터가 있으면 자연어로 변환
                                if (Object.keys(extractedData).length > 0) {
                                    // 필드 데이터
                                    const user = extractedData['A'] || '';
                                    const dept = extractedData['B'] || '';
                                    const contact = extractedData['C'] || '';
                                    const status = extractedData['D'] || '사용 중';
                                    const date = extractedData['E'] || '';
                                    const note = extractedData['F'] || '';
                                    const updated = extractedData['G'] || '';
                                    
                                    // 메인 응답 생성
                                    let naturalResponse = '';
                                    if (dept && user) {
                                        if (status === '사용 중' || status === '정상') {
                                            naturalResponse = `IP ${ipAddress}는 ${dept}의 ${user} 담당자가 사용 중입니다.`;
                                        } else {
                                            naturalResponse = `IP ${ipAddress}는 ${dept}의 ${user} 담당자가 ${status} 상태입니다.`;
                                        }
                                    } else if (user) {
                                        if (status === '사용 중' || status === '정상') {
                                            naturalResponse = `IP ${ipAddress}는 ${user} 담당자가 사용 중입니다.`;
                                        } else {
                                            naturalResponse = `IP ${ipAddress}는 ${user} 담당자가 ${status} 상태입니다.`;
                                        }
                                    } else {
                                        naturalResponse = `IP ${ipAddress}에 대한 정보입니다:`;
                                    }
                                    
                                    // 추가 정보
                                    if (contact) {
                                        naturalResponse += ` 연락처는 ${contact}입니다.`;
                                    }
                                    
                                    if (date) {
                                        naturalResponse += ` 최근 접속일은 ${date}입니다.`;
                                    }
                                    
                                    if (note) {
                                        if (note.includes('차단') || note.includes('만료') || note.includes('경고')) {
                                            naturalResponse += ` 주의: ${note}`;
                                        } else {
                                            naturalResponse += ` 참고사항: ${note}`;
                                        }
                                    }
                                    
                                    if (updated && !naturalResponse.includes(updated)) {
                                        naturalResponse += ` (${updated} 기준)`;
                                    }
                                    
                                    // 원본 메시지를 가져와서 응답 메시지만 교체
                                    const offlineHeader = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]';
                                    const newMessage = offlineHeader + '\n\n' + naturalResponse;
                                    
                                    // 메시지 내용 교체
                                    const messageContent = node.querySelector('.message-content') || node;
                                    if (messageContent) {
                                        messageContent.innerHTML = newMessage.replace(/\n/g, '<br>');
                                        console.log('IP 응답 포맷 변환 완료:', naturalResponse);
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });
        
        // 옵저버 시작
        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log('IP 응답 포맷터 활성화 완료');
    }
});