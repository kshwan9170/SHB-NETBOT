/**
 * 추천 질문 시스템 - 대시보드 데이터 연동
 * Top 5 인기 질문을 챗봇 화면에 표시
 */

class SuggestedQuestions {
    constructor() {
        this.questions = [];
        this.container = null;
        this.refreshInterval = 5 * 60 * 1000; // 5분마다 갱신
        this.init();
    }

    async init() {
        this.createContainer();
        await this.loadQuestions();
        this.setupRefreshTimer();
    }

    createContainer() {
        // 채팅 섹션 찾기
        const chatSection = document.getElementById('chat');
        if (!chatSection) return;

        // 기존 추천 질문 컨테이너가 있으면 제거
        const existingContainer = document.getElementById('suggested-questions-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        // 추천 질문 컨테이너 생성
        const container = document.createElement('div');
        container.id = 'suggested-questions-container';
        container.className = 'suggested-questions-wrapper';
        container.innerHTML = `
            <div class="suggested-questions">
                <div class="suggested-questions-header">
                    <h3>💡 추천 질문</h3>
                    <small>많이 묻는 질문들</small>
                </div>
                <div class="suggested-questions-list" id="suggested-questions-list">
                    <div class="loading-placeholder">
                        <div class="spinner"></div>
                        <span>추천 질문을 불러오는 중...</span>
                    </div>
                </div>
            </div>
        `;

        // 채팅 입력 영역 바로 위에 삽입
        const chatContainer = chatSection.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.insertBefore(container, chatContainer.firstChild);
        }

        this.container = container;
    }

    async loadQuestions() {
        try {
            const response = await fetch('/api/suggested_questions');
            const data = await response.json();

            if (data.success && data.questions) {
                this.questions = data.questions;
                this.renderQuestions();
            } else {
                this.showError('추천 질문을 불러올 수 없습니다.');
            }
        } catch (error) {
            console.error('추천 질문 로드 오류:', error);
            this.showError('네트워크 오류가 발생했습니다.');
        }
    }

    renderQuestions() {
        const listContainer = document.getElementById('suggested-questions-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        this.questions.forEach((item, index) => {
            const questionElement = document.createElement('div');
            questionElement.className = `suggested-question-item ${item.type}`;
            
            const popularBadge = item.type === 'popular' && item.count > 0 
                ? `<span class="popularity-badge">${item.count}회</span>` 
                : '';

            questionElement.innerHTML = `
                <div class="question-content">
                    <span class="question-text">${item.question}</span>
                    ${popularBadge}
                </div>
                <div class="question-actions">
                    <button class="ask-button" data-question="${item.question}">
                        질문하기
                    </button>
                </div>
            `;

            // 클릭 이벤트 추가
            questionElement.addEventListener('click', () => {
                this.askQuestion(item.question);
            });

            listContainer.appendChild(questionElement);
        });

        // 첫 번째 로드 후 컨테이너를 서서히 나타나게 함
        setTimeout(() => {
            if (this.container) {
                this.container.classList.add('visible');
            }
        }, 300);
    }

    askQuestion(question) {
        // 채팅 입력창에 질문 입력
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = question;
            chatInput.focus();
            
            // 자동으로 전송
            const sendButton = document.querySelector('.send-button, #send-button');
            if (sendButton) {
                sendButton.click();
            }
        }

        // 추천 질문 패널을 잠시 숨김 (답변 후 다시 표시)
        this.hideTemporarily();
    }

    hideTemporarily() {
        if (this.container) {
            this.container.style.opacity = '0.5';
            this.container.style.pointerEvents = 'none';
            
            // 5초 후 다시 활성화
            setTimeout(() => {
                if (this.container) {
                    this.container.style.opacity = '1';
                    this.container.style.pointerEvents = 'auto';
                }
            }, 5000);
        }
    }

    showError(message) {
        const listContainer = document.getElementById('suggested-questions-list');
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div class="error-message">
                <span class="error-icon">⚠️</span>
                <span>${message}</span>
            </div>
        `;
    }

    setupRefreshTimer() {
        // 주기적으로 추천 질문 갱신
        setInterval(() => {
            this.loadQuestions();
        }, this.refreshInterval);
    }

    // 외부에서 호출 가능한 갱신 메서드
    async refresh() {
        await this.loadQuestions();
    }
}

// CSS 스타일 동적 추가
function addSuggestedQuestionsStyles() {
    const existingStyles = document.getElementById('suggested-questions-styles');
    if (existingStyles) return;

    const styles = document.createElement('style');
    styles.id = 'suggested-questions-styles';
    styles.textContent = `
        .suggested-questions-wrapper {
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.4s ease;
            margin-bottom: 2rem;
        }

        .suggested-questions-wrapper.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .suggested-questions {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .suggested-questions-header {
            text-align: center;
            margin-bottom: 1.5rem;
        }

        .suggested-questions-header h3 {
            color: #30507A;
            font-size: 1.2rem;
            font-weight: 600;
            margin: 0 0 0.25rem 0;
        }

        .suggested-questions-header small {
            color: #64748b;
            font-size: 0.875rem;
        }

        .suggested-questions-list {
            display: grid;
            gap: 0.75rem;
        }

        .suggested-question-item {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .suggested-question-item:hover {
            background: #f8fafc;
            border-color: #30507A;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(48, 80, 122, 0.15);
        }

        .suggested-question-item.popular {
            border-left: 4px solid #059669;
        }

        .suggested-question-item.default {
            border-left: 4px solid #6b7280;
        }

        .question-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex: 1;
        }

        .question-text {
            color: #374151;
            font-weight: 500;
            font-size: 0.95rem;
        }

        .popularity-badge {
            background: #059669;
            color: white;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            white-space: nowrap;
        }

        .question-actions {
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .suggested-question-item:hover .question-actions {
            opacity: 1;
        }

        .ask-button {
            background: #30507A;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }

        .ask-button:hover {
            background: #2563eb;
        }

        .loading-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            padding: 2rem;
            color: #64748b;
        }

        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #e2e8f0;
            border-top: 2px solid #30507A;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .error-message {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 1.5rem;
            color: #dc2626;
            font-weight: 500;
        }

        .error-icon {
            font-size: 1.25rem;
        }

        /* 모바일 반응형 */
        @media (max-width: 768px) {
            .suggested-questions {
                padding: 1rem;
                margin: 0 0.5rem;
            }

            .suggested-question-item {
                flex-direction: column;
                align-items: stretch;
                gap: 0.75rem;
            }

            .question-actions {
                opacity: 1;
            }

            .ask-button {
                width: 100%;
                text-align: center;
            }
        }
    `;

    document.head.appendChild(styles);
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 스타일 추가
    addSuggestedQuestionsStyles();
    
    // 추천 질문 시스템 초기화 (약간의 딜레이 후)
    setTimeout(() => {
        window.suggestedQuestions = new SuggestedQuestions();
    }, 1000);
});

// 챗봇 응답 완료 후 추천 질문 갱신을 위한 이벤트 리스너
document.addEventListener('chatResponseComplete', function() {
    if (window.suggestedQuestions) {
        // 응답 완료 후 3초 뒤에 추천 질문 갱신
        setTimeout(() => {
            window.suggestedQuestions.refresh();
        }, 3000);
    }
});