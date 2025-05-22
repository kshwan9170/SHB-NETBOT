// 기본 UI 초기화 스크립트 
console.log("기본 UI 초기화 완료");

document.addEventListener('DOMContentLoaded', function() {
    // 채팅 폼 참조
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    
    // 채팅 폼이 존재하면 이벤트 리스너 추가
    if (chatForm) {
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const message = userInput.value.trim();
            if (message) {
                // 메시지 전송 코드는 여기에 들어갑니다
                // 현재는 기존 코드를 유지하기 위해 비워둡니다
            }
        });
    }
});