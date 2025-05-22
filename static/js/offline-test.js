/**
 * 오프라인 모드 테스트 지원 모듈
 */

document.addEventListener('DOMContentLoaded', function() {
    // 오프라인 테스트 버튼 이벤트 설정
    const offlineTestBtn = document.getElementById('force-offline');
    
    if (offlineTestBtn) {
        // 현재 모드 확인
        const isOfflineTest = localStorage.getItem('offline_test_mode') === 'true';
        
        // 초기 상태 설정
        if (isOfflineTest) {
            document.body.classList.add('offline-mode');
            offlineTestBtn.textContent = '온라인 모드로 전환';
            
            // 상태 표시 업데이트
            const connectionStatus = document.getElementById('connection-status');
            if (connectionStatus) {
                connectionStatus.classList.remove('online');
                connectionStatus.classList.add('offline');
                const statusText = connectionStatus.querySelector('.status-text');
                if (statusText) {
                    statusText.textContent = '오프라인';
                }
            }
        }
        
        // 클릭 이벤트 리스너 등록
        offlineTestBtn.addEventListener('click', function() {
            // 현재 상태 반전
            const currentMode = localStorage.getItem('offline_test_mode') === 'true';
            const newMode = !currentMode;
            
            // 설정 저장
            localStorage.setItem('offline_test_mode', newMode);
            
            // UI 업데이트
            if (newMode) {
                // 오프라인 모드로 전환
                document.body.classList.add('offline-mode');
                offlineTestBtn.textContent = '온라인 모드로 전환';
                
                // 상태 표시 업데이트
                const connectionStatus = document.getElementById('connection-status');
                if (connectionStatus) {
                    connectionStatus.classList.remove('online');
                    connectionStatus.classList.add('offline');
                    const statusText = connectionStatus.querySelector('.status-text');
                    if (statusText) {
                        statusText.textContent = '오프라인';
                    }
                }
                
                // 사용자에게 알림
                alert('오프라인 모드로 전환되었습니다. 이제 질문하면 로컬 데이터로 응답합니다.');
            } else {
                // 온라인 모드로 전환
                document.body.classList.remove('offline-mode');
                offlineTestBtn.textContent = '오프라인 모드 테스트';
                
                // 상태 표시 업데이트
                const connectionStatus = document.getElementById('connection-status');
                if (connectionStatus) {
                    connectionStatus.classList.remove('offline');
                    connectionStatus.classList.add('online');
                    const statusText = connectionStatus.querySelector('.status-text');
                    if (statusText) {
                        statusText.textContent = '온라인';
                    }
                }
                
                // 사용자에게 알림
                alert('온라인 모드로 전환되었습니다.');
            }
        });
    }
});