/**
 * SHB-NetBot 오프라인 Flow 시스템
 * - 오프라인 모드에서 Flow 방식으로 사용자를 안내
 * - 질문과 선택지 기반 인터랙션
 */

class OfflineFlowSystem {
    constructor() {
        this.flowData = null;
        this.currentNode = 'start';
        this.isFlowMode = false;
        this.flowHistory = [];
        
        this.init();
    }
    
    async init() {
        console.log('오프라인 Flow 시스템 초기화...');
        await this.loadFlowData();
        this.setupEventListeners();
    }
    
    async loadFlowData() {
        try {
            const response = await fetch('/static/data/offline_flow.json');
            if (response.ok) {
                this.flowData = await response.json();
                console.log('Flow 데이터 로드 완료:', Object.keys(this.flowData).length, '개 노드');
            } else {
                console.warn('Flow 데이터를 로드할 수 없습니다.');
            }
        } catch (error) {
            console.error('Flow 데이터 로드 중 오류:', error);
        }
    }
    
    /**
     * 선택지 텍스트를 분석하여 긍정적/부정적 선택인지 판단
     * @param {string} label - 선택지 텍스트
     * @returns {boolean} - 긍정적 선택이면 true, 부정적이면 false
     */
    isPositiveChoice(label) {
        const positiveKeywords = ['예', '네', '맞음', '있음', '그렇다', '동의', '확인', '진행', '계속'];
        const negativeKeywords = ['아니요', '아니오', '없음', '틀림', '거부', '취소', '중단', '아님'];
        
        const lowerLabel = label.toLowerCase().trim();
        
        // 긍정적 키워드 확인
        if (positiveKeywords.some(keyword => lowerLabel.includes(keyword))) {
            return true;
        }
        
        // 부정적 키워드 확인
        if (negativeKeywords.some(keyword => lowerLabel.includes(keyword))) {
            return false;
        }
        
        // 기본적으로 첫 번째 선택지는 긍정적으로 간주
        return true;
    }

    setupEventListeners() {
        // 온라인/오프라인 상태 감지
        window.addEventListener('online', () => {
            console.log('온라인 모드로 전환');
            this.exitFlowMode();
        });
        
        window.addEventListener('offline', () => {
            console.log('오프라인 모드로 전환');
            this.enterFlowMode();
        });
        
        // 페이지 로드 시 초기 상태 확인
        if (!navigator.onLine) {
            this.enterFlowMode();
        }
    }
    
    enterFlowMode() {
        if (!this.flowData || this.isFlowMode) return;
        
        console.log('오프라인 Flow 모드 시작');
        this.isFlowMode = true;
        this.currentNode = 'start';
        this.flowHistory = [];
        
        // 오프라인 모드 표시기 업데이트
        this.updateOfflineModeIndicator(true);
        
        // 첫 번째 Flow 메시지 표시
        this.showFlowMessage();
    }
    
    exitFlowMode() {
        if (!this.isFlowMode) return;
        
        console.log('오프라인 Flow 모드 종료');
        this.isFlowMode = false;
        
        // 오프라인 모드 표시기 업데이트
        this.updateOfflineModeIndicator(false);
        
        // 일반 채팅 모드로 복원
        this.restoreNormalChat();
    }
    
    updateOfflineModeIndicator(isOffline) {
        const indicator = document.querySelector('.offline-mode-indicator');
        if (indicator) {
            if (isOffline) {
                indicator.style.display = 'block';
                indicator.innerHTML = '🔴 오프라인 모드: Flow 가이드를 통해 문제 해결을 도와드립니다';
            } else {
                indicator.style.display = 'none';
            }
        }
    }
    
    showFlowMessage() {
        if (!this.flowData || !this.currentNode || !this.flowData[this.currentNode]) {
            console.error('Flow 데이터 또는 현재 노드가 유효하지 않습니다:', this.currentNode);
            return;
        }
        
        const node = this.flowData[this.currentNode];
        
        // 채팅 컨테이너 찾기
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) {
            console.error('채팅 컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        // Flow 메시지 생성
        const messageElement = this.createFlowMessage(node);
        chatContainer.appendChild(messageElement);
        
        // 스크롤을 맨 아래로
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // 기본 입력창 비활성화
        this.disableUserInput();
    }
    
    createFlowMessage(node) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message flow-message';
        
        // 텍스트 내용
        const textDiv = document.createElement('div');
        textDiv.className = 'message-content';
        textDiv.innerHTML = node.text.replace(/\n/g, '<br>');
        
        messageDiv.appendChild(textDiv);
        
        // 선택지가 있는 경우 버튼 추가
        if (node.options && node.options.length > 0) {
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'flow-options';
            optionsDiv.style.cssText = `
                margin-top: 15px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            node.options.forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'flow-option-button';
                
                // 선택지 텍스트 분석하여 스타일 결정
                const isPositive = this.isPositiveChoice(option.label);
                const emoji = isPositive ? '✅' : '❌';
                const buttonText = `${emoji} ${option.label}`;
                
                button.innerHTML = buttonText;
                
                // 선택지별 차별화된 스타일
                const baseStyle = isPositive ? {
                    background: 'linear-gradient(135deg, #2E7D32, #4CAF50)', // 초록색 그라데이션
                    hoverBackground: 'linear-gradient(135deg, #388E3C, #66BB6A)',
                    shadowColor: 'rgba(76, 175, 80, 0.3)'
                } : {
                    background: 'linear-gradient(135deg, #616161, #757575)', // 회색 그라데이션
                    hoverBackground: 'linear-gradient(135deg, #757575, #9E9E9E)',
                    shadowColor: 'rgba(117, 117, 117, 0.3)'
                };
                
                button.style.cssText = `
                    padding: 14px 24px;
                    background: ${baseStyle.background};
                    color: white;
                    border: none;
                    border-radius: 28px;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 600;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: center;
                    box-shadow: 0 4px 12px ${baseStyle.shadowColor};
                    min-width: 120px;
                    position: relative;
                    overflow: hidden;
                `;
                
                // 향상된 호버 효과
                button.addEventListener('mouseenter', () => {
                    button.style.background = baseStyle.hoverBackground;
                    button.style.transform = 'translateY(-3px) scale(1.02)';
                    button.style.boxShadow = `0 8px 20px ${baseStyle.shadowColor}`;
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.background = baseStyle.background;
                    button.style.transform = 'translateY(0) scale(1)';
                    button.style.boxShadow = `0 4px 12px ${baseStyle.shadowColor}`;
                });
                
                // 클릭 애니메이션
                button.addEventListener('mousedown', () => {
                    button.style.transform = 'translateY(-1px) scale(0.98)';
                });
                
                button.addEventListener('mouseup', () => {
                    button.style.transform = 'translateY(-3px) scale(1.02)';
                });
                
                // 클릭 이벤트
                button.addEventListener('click', () => {
                    this.handleOptionClick(option, button);
                });
                
                optionsDiv.appendChild(button);
            });
            
            messageDiv.appendChild(optionsDiv);
        } else {
            // 종료 노드인 경우 "처음으로 돌아가기" 버튼 추가
            const restartDiv = document.createElement('div');
            restartDiv.className = 'flow-restart';
            restartDiv.style.cssText = `
                margin-top: 15px;
                text-align: center;
            `;
            
            const restartButton = document.createElement('button');
            restartButton.className = 'flow-restart-button';
            restartButton.textContent = '🔄 처음으로 돌아가기';
            restartButton.style.cssText = `
                padding: 10px 20px;
                background: linear-gradient(135deg, #28a745, #34ce57);
                color: white;
                border: none;
                border-radius: 20px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.3s ease;
            `;
            
            restartButton.addEventListener('click', () => {
                this.restartFlow();
            });
            
            restartDiv.appendChild(restartButton);
            messageDiv.appendChild(restartDiv);
        }
        
        return messageDiv;
    }
    
    handleOptionClick(option, buttonElement) {
        // 선택한 옵션을 사용자 메시지로 표시
        this.addUserMessage(option.label);
        
        // 현재 노드를 히스토리에 추가
        this.flowHistory.push(this.currentNode);
        
        // 다음 노드로 이동
        this.currentNode = option.next;
        
        // 선택된 버튼 비활성화
        this.disableFlowOptions(buttonElement.parentElement);
        
        // 다음 메시지 표시 (약간의 지연)
        setTimeout(() => {
            this.showFlowMessage();
        }, 500);
    }
    
    addUserMessage(text) {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // 스크롤을 맨 아래로
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    disableFlowOptions(optionsContainer) {
        const buttons = optionsContainer.querySelectorAll('.flow-option-button');
        buttons.forEach(button => {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'not-allowed';
        });
    }
    
    restartFlow() {
        this.currentNode = 'start';
        this.flowHistory = [];
        
        // 새로운 세션임을 표시
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            const separatorDiv = document.createElement('div');
            separatorDiv.style.cssText = `
                text-align: center;
                margin: 20px 0;
                color: #888;
                font-size: 12px;
            `;
            separatorDiv.textContent = '--- 새로운 상담 시작 ---';
            chatContainer.appendChild(separatorDiv);
        }
        
        this.showFlowMessage();
    }
    
    disableUserInput() {
        const userInput = document.getElementById('userInput');
        const sendButton = document.getElementById('sendButton');
        
        if (userInput) {
            userInput.disabled = true;
            userInput.placeholder = 'oFlow 가이드 모드에서는 위 버튼을 사용해 주세요';
            userInput.style.opacity = '0.6';
        }
        
        if (sendButton) {
            sendButton.disabled = true;
            sendButton.style.opacity = '0.6';
        }
    }
    
    enableUserInput() {
        const userInput = document.getElementById('userInput');
        const sendButton = document.getElementById('sendButton');
        
        if (userInput) {
            userInput.disabled = false;
            userInput.placeholder = '메시지를 입력하세요...';
            userInput.style.opacity = '1';
        }
        
        if (sendButton) {
            sendButton.disabled = false;
            sendButton.style.opacity = '1';
        }
    }
    
    restoreNormalChat() {
        // 입력창 복원
        this.enableUserInput();
        
        // 환영 메시지 표시
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'message bot-message';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = '온라인 연결이 복원되었습니다! 다시 정상적인 채팅 서비스를 이용하실 수 있습니다.';
            
            welcomeDiv.appendChild(contentDiv);
            chatContainer.appendChild(welcomeDiv);
            
            // 스크롤을 맨 아래로
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
    
    // 수동 Flow 모드 토글 (테스트용)
    toggleFlowMode() {
        if (this.isFlowMode) {
            this.exitFlowMode();
        } else {
            this.enterFlowMode();
        }
    }
}

// 전역 인스턴스 생성
let offlineFlowSystem;

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    offlineFlowSystem = new OfflineFlowSystem();
    
    // 수동 테스트를 위한 전역 함수 (개발용)
    window.toggleOfflineFlow = () => {
        if (offlineFlowSystem) {
            offlineFlowSystem.toggleFlowMode();
        }
    };
});

console.log('오프라인 Flow 시스템 스크립트 로드 완료');