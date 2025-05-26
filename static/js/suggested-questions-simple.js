/**
 * 추천 질문 시스템 - 간단 버전 (오류 수정)
 */

class SuggestedQuestions {
    constructor() {
        this.container = null;
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        await this.findContainer();
        if (this.container) {
            await this.loadQuestions();
            this.setupRefreshTimer();
        }
    }

    async findContainer() {
        // 최대 10초 동안 컨테이너를 찾는다
        for (let i = 0; i < 20; i++) {
            this.container = document.getElementById('suggestedQuestionsContainer');
            if (this.container) {
                console.log('추천 질문 컨테이너를 찾았습니다.');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('추천 질문 컨테이너를 찾을 수 없습니다.');
    }

    async loadQuestions() {
        if (!this.container) return;

        try {
            const response = await fetch('/api/suggested_questions');
            const data = await response.json();

            if (data.success && data.questions && data.questions.length > 0) {
                this.renderQuestions(data.questions);
            } else {
                this.showError('추천 질문을 불러올 수 없습니다.');
            }
        } catch (error) {
            console.error('추천 질문 로드 실패:', error);
            this.showError('추천 질문을 불러오는 중 오류가 발생했습니다.');
        }
    }

    renderQuestions(questions) {
        const listContainer = document.getElementById('suggestedQuestionsList');
        if (!listContainer) return;

        listContainer.innerHTML = questions.map(item => 
            `<button class="question-button" onclick="window.suggestedQuestions.askQuestion('${item.question.replace(/'/g, "\\'")}')">
                ${item.question}
            </button>`
        ).join('');

        // 컨테이너 표시
        if (this.container && this.container.style.display === 'none') {
            this.container.style.display = 'block';
        }
    }

    askQuestion(question) {
        // 채팅 입력창에 질문 입력
        const chatInput = document.getElementById('userInput');
        if (chatInput) {
            chatInput.value = question;
            chatInput.focus();
            
            // 자동으로 전송
            const sendButton = document.getElementById('sendButton');
            if (sendButton) {
                sendButton.click();
            }
        }

        // 추천 질문 패널을 잠시 숨김
        this.hideTemporarily();
    }

    hideTemporarily() {
        if (this.container) {
            this.container.style.opacity = '0.5';
            setTimeout(() => {
                if (this.container) {
                    this.container.style.opacity = '1';
                }
            }, 5000);
        }
    }

    showError(message) {
        const listContainer = document.getElementById('suggestedQuestionsList');
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div class="error-message">
                <span class="error-icon">⚠️</span>
                <span>${message}</span>
            </div>
        `;
    }

    setupRefreshTimer() {
        // 주기적으로 추천 질문 갱신 (5분마다)
        setInterval(() => {
            this.refresh();
        }, 5 * 60 * 1000);
    }

    async refresh() {
        if (this.container && this.container.style.display !== 'none') {
            await this.loadQuestions();
        }
    }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 추천 질문 시스템 초기화 (약간의 딜레이 후)
    setTimeout(() => {
        window.suggestedQuestions = new SuggestedQuestions();
    }, 1000);
});

// 챗봇 응답 완료 후 추천 질문 갱신을 위한 이벤트 리스너
document.addEventListener('chatResponseComplete', function() {
    if (window.suggestedQuestions) {
        window.suggestedQuestions.refresh();
    }
});