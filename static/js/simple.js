// 기본 UI 초기화 스크립트
console.log("기본 UI 초기화 완료");

// 페이지 로드 완료 시 실행
window.onload = function() {
  // 해시 기반 스크롤 - 페이지 로드 시 해당 섹션으로 스크롤
  if (window.location.hash) {
    const targetId = window.location.hash.substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      window.scrollTo(0, targetElement.offsetTop - 80);
    }
  }
};