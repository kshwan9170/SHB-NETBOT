/**
 * FAQ 토글 기능 전용 JavaScript
 * 자주 묻는 질문 Top 5 펼치기/접기 및 질문 클릭 기능
 */

(function() {
    'use strict';
    
    let faqQuestionsLoaded = false;
    let faqQuestions = [];
    
    // DOM 로드 완료 후 초기화
    document.addEventListener('DOMContentLoaded', function() {
        console.log('FAQ 토글 시스템 초기화 시작');
        initializeFAQSystem();
    });
    
    function initializeFAQSystem() {
        // 토글 요소들 찾기
        const toggleButton = document.getElementById('suggestedQuestionsToggle');
        const questionsList = document.getElementById('suggestedQuestionsList');
        const toggleIcon = document.getElementById('toggleIcon');
        
        if (!toggleButton || !questionsList || !toggleIcon) {
            console.error('FAQ 요소를 찾을 수 없습니다. 재시도 중...');
            setTimeout(initializeFAQSystem, 500);
            return;
        }
        
        console.log('FAQ 요소 발견:', {
            toggleButton: !!toggleButton,
            questionsList: !!questionsList,
            toggleIcon: !!toggleIcon
        });
        
        // 클릭 이벤트 등록
        toggleButton.addEventListener('click', handleFAQToggle);
        
        // 초기 질문 로드
        loadFAQQuestions();
        
        console.log('FAQ 토글 시스템 초기화 완료');
    }
    
    async function handleFAQToggle(event) {
        event.preventDefault();
        event.stopPropagation();
        
        console.log('FAQ 토글 버튼 클릭됨');
        
        const questionsList = document.getElementById('suggestedQuestionsList');
        const toggleIcon = document.getElementById('toggleIcon');
        const toggleButton = document.getElementById('suggestedQuestionsToggle');
        
        if (!questionsList || !toggleIcon || !toggleButton) {
            console.error('FAQ 요소를 찾을 수 없습니다');
            return;
        }
        
        // 현재 상태 확인
        const isHidden = questionsList.style.display === 'none' || 
                        window.getComputedStyle(questionsList).display === 'none';
        
        console.log('현재 FAQ 상태:', isHidden ? '숨김' : '표시');
        
        if (isHidden) {
            // 보이기
            console.log('FAQ 목록 표시');
            
            if (!faqQuestionsLoaded) {
                questionsList.innerHTML = '<div style="padding: 16px; text-align: center; color: #666;">로딩 중...</div>';
                questionsList.style.display = 'block';
                
                try {
                    await loadFAQQuestions();
                    renderFAQQuestions();
                } catch (error) {
                    console.error('FAQ 로딩 실패:', error);
                    questionsList.innerHTML = '<div style="padding: 16px; text-align: center; color: #e74c3c;">질문을 불러올 수 없습니다.</div>';
                }
            } else {
                questionsList.style.display = 'block';
                renderFAQQuestions();
            }
            
            // 아이콘 및 스타일 변경
            toggleIcon.textContent = '▲';
            toggleButton.style.backgroundColor = 'rgba(48, 80, 122, 0.1)';
            
        } else {
            // 숨기기
            console.log('FAQ 목록 숨김');
            questionsList.style.display = 'none';
            
            // 아이콘 및 스타일 변경
            toggleIcon.textContent = '▼';
            toggleButton.style.backgroundColor = 'rgba(48, 80, 122, 0.05)';
        }
    }
    
    async function loadFAQQuestions() {
        if (faqQuestionsLoaded) {
            console.log('FAQ 질문이 이미 로드됨');
            return;
        }
        
        try {
            console.log('FAQ 질문 API 호출 시작');
            const response = await fetch('/api/suggested_questions');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('FAQ API 응답:', data);
            
            if (data.questions && Array.isArray(data.questions)) {
                faqQuestions = data.questions;
                faqQuestionsLoaded = true;
                console.log(`${faqQuestions.length}개의 FAQ 질문 로드 완료`);
            } else {
                throw new Error('유효하지 않은 API 응답');
            }
        } catch (error) {
            console.error('FAQ 질문 로딩 오류:', error);
            // 기본 질문 사용
            faqQuestions = [
                "IP 주소를 신청하고 싶어요",
                "대외계 연동 문의",
                "장애 신고 방법",
                "시스템 접속 문제",
                "업무 절차 안내"
            ];
            faqQuestionsLoaded = true;
            console.log('기본 FAQ 질문 사용');
        }
    }
    
    function renderFAQQuestions() {
        const questionsList = document.getElementById('suggestedQuestionsList');
        
        if (!questionsList || !faqQuestions.length) {
            console.error('FAQ 렌더링 실패: 요소 또는 질문 없음');
            return;
        }
        
        let html = '<div style="padding: 12px 0;">';
        
        faqQuestions.forEach((question, index) => {
            const questionText = typeof question === 'object' ? question.query || question.question || question : question;
            
            html += `
                <div class="faq-question-item" 
                     data-question="${encodeURIComponent(questionText)}"
                     style="
                         padding: 12px 16px; 
                         margin: 4px 0; 
                         background: rgba(255, 255, 255, 0.7); 
                         border: 1px solid rgba(48, 80, 122, 0.1); 
                         border-radius: 6px; 
                         cursor: pointer; 
                         transition: all 0.2s ease;
                         font-size: 14px;
                         color: #2c3e50;
                     "
                     onmouseover="this.style.backgroundColor='rgba(48, 80, 122, 0.05)'; this.style.borderColor='rgba(48, 80, 122, 0.3)';"
                     onmouseout="this.style.backgroundColor='rgba(255, 255, 255, 0.7)'; this.style.borderColor='rgba(48, 80, 122, 0.1)';">
                    ${questionText}
                </div>
            `;
        });
        
        html += '</div>';
        questionsList.innerHTML = html;
        
        // 질문 클릭 이벤트 등록
        const questionItems = questionsList.querySelectorAll('.faq-question-item');
        questionItems.forEach(item => {
            item.addEventListener('click', function() {
                const questionText = decodeURIComponent(this.getAttribute('data-question'));
                console.log('FAQ 질문 클릭:', questionText);
                sendQuestionToChat(questionText);
            });
        });
        
        console.log(`${questionItems.length}개의 FAQ 질문 렌더링 완료`);
    }
    
    function sendQuestionToChat(questionText) {
        try {
            const userInput = document.getElementById('userInput');
            const chatForm = document.getElementById('chatForm');
            
            if (userInput && chatForm) {
                // 입력창에 질문 설정
                userInput.value = questionText;
                
                // 포커스 설정
                userInput.focus();
                
                // 폼 제출 이벤트 발생
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                chatForm.dispatchEvent(submitEvent);
                
                console.log('FAQ 질문이 채팅으로 전송됨:', questionText);
                
                // FAQ 목록 숨기기
                setTimeout(() => {
                    const questionsList = document.getElementById('suggestedQuestionsList');
                    const toggleIcon = document.getElementById('toggleIcon');
                    const toggleButton = document.getElementById('suggestedQuestionsToggle');
                    
                    if (questionsList) {
                        questionsList.style.display = 'none';
                    }
                    if (toggleIcon) {
                        toggleIcon.textContent = '▼';
                    }
                    if (toggleButton) {
                        toggleButton.style.backgroundColor = 'rgba(48, 80, 122, 0.05)';
                    }
                }, 100);
                
            } else {
                console.error('채팅 요소를 찾을 수 없습니다');
            }
        } catch (error) {
            console.error('질문 전송 오류:', error);
        }
    }
    
})();