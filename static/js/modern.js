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
            feedbackQuestion.textContent = '도움이 되었나요?';
            
            // 피드백 버튼 컨테이너
            const feedbackButtons = document.createElement('div');
            feedbackButtons.className = 'feedback-buttons';
            
            // 좋아요 버튼
            const likeButton = document.createElement('button');
            likeButton.className = 'feedback-button like-button';
            likeButton.innerHTML = '👍 도움 됨';
            likeButton.onclick = function() {
                submitFeedback(questionText, content, '👍 도움 됨', feedbackContainer);
            };
            
            // 싫어요 버튼
            const dislikeButton = document.createElement('button');
            dislikeButton.className = 'feedback-button dislike-button';
            dislikeButton.innerHTML = '👎 부족함';
            dislikeButton.onclick = function() {
                // 부족함 피드백일 때는 추가 코멘트 입력 UI 표시
                showDislikeFeedbackForm(questionText, content, feedbackContainer);
            };
            
            // 버튼 추가
            feedbackButtons.appendChild(likeButton);
            feedbackButtons.appendChild(dislikeButton);
            
            // 피드백 UI 구성
            feedbackContainer.appendChild(feedbackQuestion);
            feedbackContainer.appendChild(feedbackButtons);
            
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
        
        // 드래그 앤 드롭 기능
        uploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDropzone.style.borderColor = '#4CD6B9';
            uploadDropzone.style.backgroundColor = 'var(--primary-light)';
        });
        
        uploadDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadDropzone.style.borderColor = 'var(--border-color)';
            uploadDropzone.style.backgroundColor = '';
        });
        
        uploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropzone.style.borderColor = 'var(--border-color)';
            uploadDropzone.style.backgroundColor = '';
            
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
                // 업로드 버튼 비활성화
                const uploadButton = document.getElementById('uploadButton');
                uploadButton.disabled = true;
                uploadButton.textContent = 'Uploading...';
                
                let allUploadsSuccessful = true;
                const files = Array.from(fileInput.files);
                
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
                    // 업로드 성공
                    uploadDropzone.querySelector('p').textContent = 'Drag and drop files here or browse';
                    fileInput.value = '';
                    
                    // 문서 목록 업데이트
                    loadDocuments();
                    
                    // 성공 메시지
                    alert('Files uploaded successfully');
                }
            } catch (error) {
                console.error('Upload error:', error);
                alert('An error occurred during the upload');
            } finally {
                // 업로드 버튼 다시 활성화
                const uploadButton = document.getElementById('uploadButton');
                uploadButton.disabled = false;
                uploadButton.textContent = 'Upload Files';
            }
        });
        
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
                    // 문서 목록 표시
                    documentsList.innerHTML = '';
                    
                    data.files.forEach(file => {
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
    const filesPerPage = 5;
    let allDocuments = [];
    
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
                
                if (data.files.length === 0) {
                    // 파일이 없는 경우
                    documentsTable.style.display = 'none';
                    // 페이지네이션 컨테이너가 있으면 제거
                    const paginationContainer = document.getElementById('pagination-container');
                    if (paginationContainer) {
                        paginationContainer.remove();
                    }
                    return;
                }
                
                // 모든 문서 저장
                allDocuments = data.files;
                
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
                        <td style="padding: 12px; border-bottom: 1px solid #eaeaea;">${file.filename}</td>
                        <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">${fileSize}</td>
                        <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                            <button class="delete-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}"
                                    style="background-color: #ff5252; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-weight: bold;">
                                DELETE
                            </button>
                        </td>
                    `;
                    
                    documentsTableBody.appendChild(row);
                    
                    // 삭제 버튼에 이벤트 리스너 추가
                    row.querySelector('.delete-btn').addEventListener('click', function() {
                        const systemFilename = this.getAttribute('data-filename');
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