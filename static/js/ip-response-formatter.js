/**
 * IP 주소 검색 결과를 자연어 형태로 변환하는 기능
 * 오프라인 모드에서도 자연스러운 응답 제공
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("IP 응답 포맷터가 로드되었습니다.");
    
    // 채팅 컨테이너 참조
    const chatContainer = document.getElementById('chatContainer');
    
    // 기본 값 설정
    const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    
    // 메시지 변환 함수
    function transformMessage(node) {
        if (!node || !node.textContent) return;
        
        // 오프라인 모드 메시지인지 확인
        if (node.textContent.includes('서버 연결이 끊겼습니다')) {
            // IP 주소 확인
            const ipMatch = node.textContent.match(ipPattern);
            if (!ipMatch) return;
            
            const ipAddress = ipMatch[0];
            
            // 알파벳 패턴 (A: 값, B: 값 등) 찾기
            const alphaMatches = node.textContent.match(/([A-G])\s*:\s*([^.]+)(?=[.,]|$)/g);
            if (!alphaMatches || alphaMatches.length === 0) return;
            
            // 값 추출
            const data = {};
            alphaMatches.forEach(match => {
                const parts = match.split(':');
                if (parts.length === 2) {
                    const key = parts[0].trim();
                    const value = parts[1].trim();
                    data[key] = value;
                }
            });
            
            // 데이터 가공
            let result = "";
            
            // 기본 정보 구성
            if (data['A'] && data['B']) {
                result = "IP " + ipAddress + "는 " + data['B'] + "의 " + data['A'] + " 담당자가 ";
                
                if (data['D']) {
                    result += data['D'] + " 상태입니다.";
                } else {
                    result += "사용 중입니다.";
                }
            } else if (data['A']) {
                result = "IP " + ipAddress + "는 " + data['A'] + " 담당자가 ";
                
                if (data['D']) {
                    result += data['D'] + " 상태입니다.";
                } else {
                    result += "사용 중입니다.";
                }
            } else {
                result = "IP " + ipAddress + "에 대한 정보입니다.";
            }
            
            // 부가 정보 추가
            if (data['C']) {
                result += " 연락처는 " + data['C'] + "입니다.";
            }
            
            if (data['E']) {
                result += " 최근 접속일은 " + data['E'] + "입니다.";
            }
            
            if (data['F']) {
                result += " 참고사항: " + data['F'];
            }
            
            if (data['G']) {
                result += " (" + data['G'] + " 기준)";
            }
            
            // 메시지 내용 교체
            const messageContent = node.querySelector('.message-content') || node;
            if (messageContent) {
                const header = '[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다.]';
                messageContent.innerHTML = header + '<br><br>' + result;
            }
        }
    }
    
    // 채팅 메시지 변경 감지 설정
    if (chatContainer) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.classList && node.classList.contains('bot-message')) {
                            transformMessage(node);
                        }
                    }
                }
            });
        });
        
        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log('IP 응답 변환기가 활성화되었습니다.');
    }
});