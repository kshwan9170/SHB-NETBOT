// Markdown을 HTML로 변환하는 함수
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

// 기존 addMessage와 addMessageWithTypingEffect 함수를 오버라이드
window.addEventListener('DOMContentLoaded', function() {
    // 원본 함수 저장
    const originalAddMessage = window.addMessage;
    const originalAddMessageWithTypingEffect = window.addMessageWithTypingEffect;
    
    // 새로운 메시지 추가 함수
    window.addMessage = function(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // 봇 메시지는 마크다운으로 처리
        if (sender === 'bot') {
            messageContent.innerHTML = convertMarkdownToHtml(content);
        } else {
            messageContent.textContent = content;
        }
        
        messageDiv.appendChild(messageContent);
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.appendChild(messageDiv);
        }
        
        // 스크롤을 최신 메시지로 이동
        if (window.scrollToBottom) {
            window.scrollToBottom();
        }
    };
    
    // 타이핑 효과 없이 마크다운을 즉시 표시하는 함수
    window.addMessageWithTypingEffect = function(content, sender) {
        // 마크다운으로 즉시 표시
        window.addMessage(content, sender);
    };
});