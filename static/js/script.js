document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 참조
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatContainer = document.getElementById('chatContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const sendButton = document.getElementById('sendButton');
    
    // 테마 감지 및 전환 준비 (다크모드/라이트모드)
    function detectColorScheme() {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (darkModeMediaQuery.matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
        
        // 시스템 테마 변경 시 자동 감지
        darkModeMediaQuery.addEventListener('change', (e) => {
            if (e.matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        });
    }
    
    // 마이크로 인터랙션 - 버튼에 아이콘 추가
    function setupSendButton() {
        sendButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
        `;
    }
    
    // 마이크로 인터랙션 - 입력 효과
    function setupInputEffects() {
        userInput.setAttribute('placeholder', '메시지를 입력하세요...');
        
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
                    shakeInput();
                }
            }
        });
    }
    
    // 입력창 흔들림 효과
    function shakeInput() {
        userInput.classList.add('shake');
        setTimeout(() => {
            userInput.classList.remove('shake');
        }, 500);
    }
    
    // 폼 제출 이벤트 처리
    chatForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) {
            shakeInput();
            return;
        }
        
        // 버튼 비활성화 및 시각적 피드백
        sendButton.style.pointerEvents = 'none';
        sendButton.style.opacity = '0.7';
        
        // 사용자 메시지 UI에 추가 (애니메이션 효과 포함)
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
                // 챗봇 응답 UI에 추가 (타이핑 효과 활용)
                addMessageWithTypingEffect(data.reply, 'bot');
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
            
            // 버튼 재활성화
            sendButton.style.pointerEvents = 'auto';
            sendButton.style.opacity = '1';
            
            // 입력창에 포커스
            userInput.focus();
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
        
        // 메시지가 추가될 때 스케일 애니메이션 효과
        setTimeout(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 10);
        
        // 스크롤을 최신 메시지로 이동
        scrollToBottom();
    }
    
    // 타이핑 효과를 적용한 메시지 추가 함수
    function addMessageWithTypingEffect(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageDiv.appendChild(messageContent);
        chatContainer.appendChild(messageDiv);
        
        // 메시지가 추가될 때 스케일 애니메이션 효과
        setTimeout(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 10);
        
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
    
    // 스크롤을 최신 메시지로 이동하는 함수 (부드러운 스크롤 효과)
    function scrollToBottom() {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    
    // 초기화 함수
    function init() {
        detectColorScheme();
        setupSendButton();
        setupInputEffects();
        userInput.focus();
    }
    
    // 초기화 실행
    init();
});