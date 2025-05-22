// 기본 UI 초기화 정상화 시도
console.log("기본 UI 초기화 시도 중");

// 최대한 간소화된 스크립트
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM 요소 로드 완료");
    
    // 테마 설정
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }
    
    // 테마 토글 버튼 이벤트
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-theme');
            localStorage.setItem('theme', 
                document.body.classList.contains('dark-theme') ? 'dark' : 'light');
        });
    }
    
    // 채팅 폼 이벤트
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        const userInput = document.getElementById('userInput');
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (userInput && userInput.value.trim()) {
                console.log("메시지 입력 감지됨");
            }
        });
    }
});