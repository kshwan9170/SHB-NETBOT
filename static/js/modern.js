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
    
    // AOS(Animate On Scroll) 초기화
    AOS.init({
        duration: 800,
        easing: 'ease',
        once: false,
        mirror: false
    });
    
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
            
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.offsetHeight;
                const sectionId = section.getAttribute('id');
                
                if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                    navLinkItems.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${sectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
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
                        // 챗봇 응답 UI에 추가 (타이핑 효과)
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
    
    // 타이핑 효과를 적용한 메시지 추가 함수
    function addMessageWithTypingEffect(content, sender) {
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
    
    // 초기화 함수
    function init() {
        initTheme();
        initScrollEffects();
        initMobileMenu();
        initChat();
        initSmoothScroll();
    }
    
    // 초기화 실행
    init();
});