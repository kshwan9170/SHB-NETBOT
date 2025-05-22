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
    
    // URL 해시 처리 - 페이지 로드 시 해당 섹션으로 스크롤
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1); // '#' 제거
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            // 300ms 지연 후 스크롤 (콘텐츠 로딩 대기)
            setTimeout(() => {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // 헤더 높이 고려
                    behavior: 'smooth'
                });
                
                // 타겟 섹션 강조 애니메이션
                targetElement.classList.add('highlight-section');
                setTimeout(() => {
                    targetElement.classList.remove('highlight-section');
                }, 1500);
            }, 300);
        }
    }
    
    // 내비게이션 링크 클릭 처리
    const navLinks = document.querySelectorAll('a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href.length > 1) { // '#'만 있는 경우 제외
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                    
                    // URL 업데이트 (브라우저 히스토리 추가)
                    history.pushState(null, null, href);
                }
            }
        });
    });
    
    // FAQ 아코디언 처리
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    if (faqQuestions.length > 0) {
        faqQuestions.forEach(question => {
            question.addEventListener('click', function() {
                const faqItem = this.parentElement;
                
                // 현재 클릭한 항목이 이미 활성화되어 있는지 확인
                const isActive = faqItem.classList.contains('active');
                
                // 먼저 모든 FAQ 항목 닫기
                document.querySelectorAll('.faq-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // 현재 항목이 활성화되지 않았던 경우에만 열기
                if (!isActive) {
                    faqItem.classList.add('active');
                }
            });
        });
        
        // 첫 번째 FAQ 항목 자동 열기 (선택 사항)
        // document.querySelector('.faq-item').classList.add('active');
    }
});