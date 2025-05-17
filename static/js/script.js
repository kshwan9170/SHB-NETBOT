document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 참조
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatContainer = document.getElementById('chatContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // 폼 제출 이벤트 처리
    chatForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;
        
        // 사용자 메시지 UI에 추가
        addMessage(message, 'user');
        
        // 입력창 초기화
        userInput.value = '';
        
        // 로딩 인디케이터 표시
        loadingIndicator.classList.add('active');
        
        try {
            // 서버에 메시지 전송 및 응답 받기
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // 챗봇 응답 UI에 추가
                addMessage(data.reply, 'bot');
            } else {
                // 오류 처리
                addMessage(`오류가 발생했습니다: ${data.error || '알 수 없는 오류'}`, 'bot');
            }
        } catch (error) {
            console.error('API 호출 중 오류 발생:', error);
            addMessage('서버와 통신 중 오류가 발생했습니다. 나중에 다시 시도해주세요.', 'bot');
        } finally {
            // 로딩 인디케이터 숨기기
            loadingIndicator.classList.remove('active');
            
            // 스크롤을 최신 메시지로 이동
            scrollToBottom();
        }
    });
    
    // 메시지 추가 함수
    function addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = content;
        
        messageDiv.appendChild(messageContent);
        chatContainer.appendChild(messageDiv);
        
        // 스크롤을 최신 메시지로 이동
        scrollToBottom();
    }
    
    // 스크롤을 최신 메시지로 이동하는 함수
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // 초기 포커스 설정
    userInput.focus();
});