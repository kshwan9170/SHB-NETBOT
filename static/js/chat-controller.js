/**
 * 채팅 컨트롤러 - 오프라인/온라인 모드에서 채팅 처리 담당
 */

// 전역 네임스페이스
window.chatController = (function() {
    // DOM 요소 참조
    let chatForm;
    let userInput;
    let chatContainer;
    let loadingIndicator;
    let sendButton;
    
    // 초기화 함수 
    function initialize() {
        // DOM 요소 참조 설정
        chatForm = document.getElementById('chatForm');
        userInput = document.getElementById('userInput');
        chatContainer = document.getElementById('chatContainer');
        loadingIndicator = document.getElementById('loadingIndicator');
        sendButton = document.getElementById('sendButton');
        
        // 이벤트 리스너 설정
        if (chatForm) {
            chatForm.addEventListener('submit', handleChatSubmit);
        }
        
        console.log('채팅 컨트롤러 초기화 완료');
    }
    
    // 채팅 메시지 제출 핸들러
    async function handleChatSubmit(e) {
        e.preventDefault();
        
        const userText = userInput.value.trim();
        if (!userText) return;
        
        // 사용자 메시지 표시
        addMessage(userText, 'user');
        userInput.value = '';
        
        // 로딩 표시
        loadingIndicator.style.display = 'flex';
        sendButton.disabled = true;
        
        try {
            // 오프라인 모드 확인
            const isOffline = !navigator.onLine || document.body.classList.contains('offline-mode');
            
            let botResponse;
            
            if (isOffline) {
                // 오프라인 모드: 전용 핸들러를 통해 로컬 데이터에서 응답 생성
                if (window.offlineModeHandler && typeof window.offlineModeHandler.getResponse === 'function') {
                    console.log('오프라인 모드 응답 생성 중...');
                    botResponse = await window.offlineModeHandler.getResponse(userText);
                } else {
                    // 폴백: 기본 오프라인 메시지
                    console.log('오프라인 모드 핸들러를 찾을 수 없습니다.');
                    botResponse = "[🔴 서버 연결이 끊겼습니다. 기본 안내 정보로 응답 중입니다]\n\n현재 오프라인 상태입니다. 저장된 메뉴얼 데이터만으로 응답할 수 있습니다.";
                }
                
                // 오프라인 응답은 지연시간 추가 (더 자연스러운 느낌을 위해)
                await new Promise(resolve => setTimeout(resolve, 700));
            } else {
                // 온라인 모드: API 호출
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userText })
                });
                
                if (!response.ok) {
                    throw new Error(`서버 응답 오류: ${response.status}`);
                }
                
                const data = await response.json();
                botResponse = data.response;
            }
            
            // 챗봇 응답 표시
            addMessage(botResponse, 'bot');
        } catch (error) {
            console.error('오류:', error);
            
            // 오류 발생 시 오프라인 모드 확인하여 다른 메시지 표시
            if (!navigator.onLine || document.body.classList.contains('offline-mode')) {
                addMessage('[🔴 오프라인 상태] 응답을 생성하는 중에 오류가 발생했습니다. 네트워크 연결을 확인하거나 다른 질문을 시도해 주세요.', 'bot');
            } else {
                addMessage('죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해 주세요.', 'bot');
            }
        } finally {
            // 로딩 표시 제거
            loadingIndicator.style.display = 'none';
            sendButton.disabled = false;
        }
    }
    
    // 채팅 메시지 추가 함수
    function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        
        // 메시지 내용 컨테이너
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        
        if (text.includes('\n')) {
            // 줄바꿈이 있는 경우 마크다운으로 처리
            if (window.markdownHandler && typeof window.markdownHandler.renderMarkdown === 'function') {
                contentDiv.innerHTML = window.markdownHandler.renderMarkdown(text);
            } else {
                // 마크다운 핸들러가 없는 경우 간단히 줄바꿈만 처리
                contentDiv.innerText = text;
            }
        } else {
            contentDiv.innerText = text;
        }
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // 스크롤을 맨 아래로 이동
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // DOM이 로드되면 초기화
    document.addEventListener('DOMContentLoaded', initialize);
    
    // 공개 API
    return {
        addMessage: addMessage,
        handleMessage: handleChatSubmit
    };
})();