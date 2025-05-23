/**
 * FLOW 기반 절차 안내 챗봇 시스템
 * 단계별 분기 구조로 사용자를 안내하는 직관적인 챗봇
 */

class FlowChatbot {
    constructor() {
        this.currentFlow = null;
        this.flowHistory = [];
        this.userChoices = {};
        
        // FLOW 정의 - 실제 업무 절차에 따른 분기 구조
        this.flows = {
            // IP 전화기 관련 문제 해결 플로우
            ip_phone_troubleshooting: {
                id: 'ip_phone_troubleshooting',
                title: 'IP 전화기 문제 해결',
                steps: {
                    start: {
                        question: "IP 전화기에 문제가 있으신가요?",
                        type: 'choice',
                        choices: [
                            { text: '예', next: 'phone_check' },
                            { text: '아니오', next: 'other_issues' }
                        ]
                    },
                    phone_check: {
                        question: "전화기 전원이 정상적으로 켜져 있나요?",
                        type: 'choice',
                        choices: [
                            { text: '예', next: 'dial_tone_check' },
                            { text: '아니오', next: 'power_solution' }
                        ]
                    },
                    power_solution: {
                        question: "전원 문제 해결 방법을 안내드립니다.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>🔌 전원 문제 해결 단계</h4>
                            <ol>
                                <li>전원 어댑터가 전화기에 제대로 연결되었는지 확인</li>
                                <li>벽면 콘센트에 전원이 들어오는지 확인</li>
                                <li>다른 콘센트에 연결해보기</li>
                                <li>전원 LED가 켜지는지 확인</li>
                            </ol>
                            <p><strong>💡 여전히 문제가 있다면:</strong> IT 지원팀 (내선: 1234)로 연락주세요.</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    dial_tone_check: {
                        question: "수화기를 들었을 때 발신음(삐- 소리)이 들리나요?",
                        type: 'choice',
                        choices: [
                            { text: '예', next: 'call_quality_check' },
                            { text: '아니오', next: 'network_solution' }
                        ]
                    },
                    network_solution: {
                        question: "네트워크 연결 문제 해결 방법입니다.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>🌐 네트워크 연결 문제 해결</h4>
                            <ol>
                                <li>랜선이 전화기 뒷면에 제대로 연결되었는지 확인</li>
                                <li>랜선이 벽면 네트워크 포트에 제대로 꽂혀있는지 확인</li>
                                <li>전화기를 껐다가 30초 후 다시 켜기</li>
                                <li>네트워크 LED 상태 확인 (보통 녹색이어야 함)</li>
                            </ol>
                            <p><strong>💡 여전히 문제가 있다면:</strong> 네트워크팀 (내선: 5678)로 연락주세요.</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    call_quality_check: {
                        question: "통화 품질에 문제가 있나요? (잡음, 끊김 등)",
                        type: 'choice',
                        choices: [
                            { text: '예', next: 'quality_solution' },
                            { text: '아니오', next: 'other_phone_issues' }
                        ]
                    },
                    quality_solution: {
                        question: "통화 품질 개선 방법을 안내드립니다.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>📞 통화 품질 개선 방법</h4>
                            <ol>
                                <li>수화기 연결 부분이 느슨하지 않은지 확인</li>
                                <li>다른 내선번호로 테스트 통화해보기</li>
                                <li>전화기 주변의 전자기기 간섭 확인</li>
                                <li>랜선 상태 점검 (구부러짐, 손상 확인)</li>
                            </ol>
                            <p><strong>💡 여전히 문제가 있다면:</strong> 통신팀 (내선: 9999)로 연락주세요.</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    other_phone_issues: {
                        question: "다른 전화기 관련 문제가 있으신가요?",
                        type: 'choice',
                        choices: [
                            { text: '내선번호 설정 문제', next: 'extension_solution' },
                            { text: '버튼/기능 문제', next: 'function_solution' },
                            { text: '없음', next: 'end' }
                        ]
                    },
                    extension_solution: {
                        question: "내선번호 설정 방법을 안내드립니다.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>📋 내선번호 설정 방법</h4>
                            <ol>
                                <li>전화기 메뉴 버튼 누르기</li>
                                <li>'설정' 또는 'Settings' 선택</li>
                                <li>'네트워크' 또는 'Network' 선택</li>
                                <li>할당받은 내선번호 입력</li>
                                <li>'저장' 또는 'Save' 선택</li>
                            </ol>
                            <p><strong>💡 내선번호를 모르시면:</strong> 총무팀 (내선: 1111)로 문의하세요.</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    function_solution: {
                        question: "버튼/기능 문제 해결 방법입니다.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>🔘 버튼/기능 문제 해결</h4>
                            <ol>
                                <li>전화기 재부팅 (전원 끄기 → 30초 대기 → 전원 켜기)</li>
                                <li>버튼을 천천히 눌러보기</li>
                                <li>액정 화면 메뉴 확인</li>
                                <li>사용 설명서 참조</li>
                            </ol>
                            <p><strong>💡 특정 기능 문의:</strong> IT 지원팀 (내선: 1234)로 연락주세요.</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    other_issues: {
                        question: "어떤 종류의 문제인가요?",
                        type: 'choice',
                        choices: [
                            { text: '네트워크/인터넷 문제', next: 'network_issues' },
                            { text: 'PC/컴퓨터 문제', next: 'pc_issues' },
                            { text: '기타 문제', next: 'general_support' }
                        ]
                    },
                    network_issues: {
                        question: "네트워크 문제 해결을 도와드리겠습니다.",
                        type: 'redirect',
                        target: 'network_troubleshooting'
                    },
                    pc_issues: {
                        question: "PC 문제 해결을 도와드리겠습니다.",
                        type: 'redirect',
                        target: 'pc_troubleshooting'
                    },
                    general_support: {
                        question: "일반적인 지원이 필요하시군요.",
                        type: 'solution',
                        content: `
                        <div class="solution-steps">
                            <h4>📞 고객 지원 연락처</h4>
                            <ul>
                                <li><strong>IT 지원팀:</strong> 내선 1234</li>
                                <li><strong>네트워크팀:</strong> 내선 5678</li>
                                <li><strong>총무팀:</strong> 내선 1111</li>
                                <li><strong>보안팀:</strong> 내선 7777</li>
                            </ul>
                            <p><strong>💡 긴급 상황:</strong> 내선 0000 (24시간 지원)</p>
                        </div>
                        `,
                        actions: [
                            { text: '다른 문제 해결', next: 'start' },
                            { text: '완료', next: 'end' }
                        ]
                    },
                    end: {
                        question: "문제 해결이 완료되었습니다. 추가로 도움이 필요하시면 언제든 말씀해주세요!",
                        type: 'end',
                        actions: [
                            { text: '새로운 문제 해결', next: 'start' }
                        ]
                    }
                }
            },
            
            // IP 주소 조회 플로우 
            ip_lookup: {
                id: 'ip_lookup',
                title: 'IP 주소 사용자 조회',
                steps: {
                    start: {
                        question: "IP 주소를 입력해주세요. (예: 192.168.1.100)",
                        type: 'input',
                        inputType: 'ip',
                        validation: 'ip_address',
                        next: 'lookup_result'
                    },
                    lookup_result: {
                        question: "조회 결과입니다.",
                        type: 'dynamic',
                        handler: 'handleIpLookup'
                    }
                }
            }
        };
    }

    // 플로우 시작
    startFlow(flowId, stepId = 'start') {
        const flow = this.flows[flowId];
        if (!flow) {
            console.error(`Flow not found: ${flowId}`);
            return false;
        }

        this.currentFlow = flow;
        this.flowHistory = [];
        this.userChoices = {};
        
        this.showStep(stepId);
        return true;
    }

    // 단계 표시
    showStep(stepId) {
        const step = this.currentFlow.steps[stepId];
        if (!step) {
            console.error(`Step not found: ${stepId}`);
            return;
        }

        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;

        // 봇 메시지 추가
        this.addBotMessage(step.question, step);
        
        // 단계별 처리
        switch (step.type) {
            case 'choice':
                this.renderChoices(step.choices, stepId);
                break;
            case 'input':
                this.renderInput(step, stepId);
                break;
            case 'solution':
                this.renderSolution(step);
                break;
            case 'dynamic':
                this.handleDynamicStep(step, stepId);
                break;
            case 'redirect':
                this.startFlow(step.target);
                break;
            case 'end':
                this.renderEndStep(step);
                break;
        }
    }

    // 봇 메시지 추가
    addBotMessage(message, step = null) {
        const chatContainer = document.getElementById('chatContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message bot-message';
        
        let content = `
            <div class="message-content">
                <div class="bot-avatar">🤖</div>
                <div class="message-text">${message}</div>
            </div>
        `;

        if (step && step.content) {
            content += `<div class="solution-content">${step.content}</div>`;
        }

        messageDiv.innerHTML = content;
        chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    // 사용자 메시지 추가
    addUserMessage(message) {
        const chatContainer = document.getElementById('chatContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message user-message';
        
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${message}</div>
                <div class="user-avatar">👤</div>
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    // 선택지 렌더링
    renderChoices(choices, currentStepId) {
        const chatContainer = document.getElementById('chatContainer');
        const choicesDiv = document.createElement('div');
        choicesDiv.className = 'flow-choices';

        choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'flow-choice-btn';
            button.textContent = choice.text;
            button.onclick = () => {
                this.addUserMessage(choice.text);
                this.userChoices[currentStepId] = choice.text;
                this.flowHistory.push({step: currentStepId, choice: choice.text});
                
                // 선택지 버튼들 제거
                choicesDiv.remove();
                
                // 다음 단계로 이동
                this.showStep(choice.next);
            };
            choicesDiv.appendChild(button);
        });

        chatContainer.appendChild(choicesDiv);
        this.scrollToBottom();
    }

    // 입력 필드 렌더링
    renderInput(step, currentStepId) {
        const chatContainer = document.getElementById('chatContainer');
        const inputDiv = document.createElement('div');
        inputDiv.className = 'flow-input';

        inputDiv.innerHTML = `
            <div class="input-group">
                <input type="text" id="flowInput" placeholder="입력해주세요..." class="flow-input-field">
                <button onclick="flowChatbot.handleInput('${currentStepId}', '${step.next}')" class="flow-submit-btn">확인</button>
            </div>
        `;

        chatContainer.appendChild(inputDiv);
        
        // 포커스 설정
        setTimeout(() => {
            document.getElementById('flowInput').focus();
        }, 100);
        
        this.scrollToBottom();
    }

    // 입력 처리
    handleInput(currentStepId, nextStepId) {
        const input = document.getElementById('flowInput');
        const value = input.value.trim();
        
        if (!value) {
            alert('값을 입력해주세요.');
            return;
        }

        this.addUserMessage(value);
        this.userChoices[currentStepId] = value;
        
        // 입력 필드 제거
        input.closest('.flow-input').remove();
        
        // 다음 단계로 이동
        this.showStep(nextStepId);
    }

    // 솔루션 렌더링
    renderSolution(step) {
        if (step.actions && step.actions.length > 0) {
            setTimeout(() => {
                this.renderChoices(step.actions, 'solution');
            }, 1000);
        }
    }

    // 동적 단계 처리
    handleDynamicStep(step, stepId) {
        if (step.handler === 'handleIpLookup') {
            this.handleIpLookup();
        }
    }

    // IP 조회 처리
    async handleIpLookup() {
        const ipAddress = this.userChoices['start'];
        
        try {
            // IP 주소 조회 API 호출
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `${ipAddress} 사용자 조회` })
            });
            
            const data = await response.json();
            this.addBotMessage(data.response);
            
        } catch (error) {
            this.addBotMessage('죄송합니다. 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }

        // 완료 후 선택지
        setTimeout(() => {
            this.renderChoices([
                { text: '다른 IP 조회', next: 'start' },
                { text: '완료', next: 'end' }
            ], 'lookup_result');
        }, 2000);
    }

    // 끝 단계 렌더링
    renderEndStep(step) {
        if (step.actions) {
            setTimeout(() => {
                this.renderChoices(step.actions, 'end');
            }, 1000);
        }
    }

    // 스크롤 하단으로 이동
    scrollToBottom() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// 전역 인스턴스 생성
const flowChatbot = new FlowChatbot();

// 플로우 시작 함수들
function startIpPhoneTroubleshooting() {
    flowChatbot.startFlow('ip_phone_troubleshooting');
}

function startIpLookup() {
    flowChatbot.startFlow('ip_lookup');
}

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('FLOW 기반 챗봇 시스템 초기화 완료');
});