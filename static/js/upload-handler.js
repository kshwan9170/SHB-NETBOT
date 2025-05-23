/**
 * 깔끔한 파일 업로드 처리 시스템
 * - 정확한 성공/실패 메시지 표시
 * - 업로드 후 자동 새로고침
 * - 중복 방지 및 오류 처리
 */

function showUploadMessage(type, message) {
    // 기존 메시지 제거
    const existingMessage = document.querySelector('.upload-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 생성
    const messageDiv = document.createElement('div');
    messageDiv.className = `upload-message ${type}`;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        ${type === 'success' ? 'background: linear-gradient(135deg, #10B981, #059669);' : 'background: linear-gradient(135deg, #EF4444, #DC2626);'}
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (messageDiv && messageDiv.parentNode) {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateX(100%)';
            messageDiv.style.transition = 'all 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }
    }, 3000);
}

function handleUploadResponse(response, filename) {
    try {
        // 응답이 이미 파싱된 객체인지 확인
        const data = typeof response === 'object' ? response : JSON.parse(response);
        
        console.log('Upload response:', data);
        
        // 서버 응답 구조에 따른 처리
        if (data.results && Array.isArray(data.results)) {
            // 모든 결과가 성공인지 확인
            const allSuccess = data.results.every(result => result.status === 'success');
            
            if (allSuccess) {
                showUploadMessage('success', `✅ ${filename} 파일이 성공적으로 업로드되었습니다!`);
                
                // 1초 후 파일 목록 새로고침
                setTimeout(() => {
                    if (window.loadDocuments) {
                        window.loadDocuments();
                    } else {
                        window.location.reload();
                    }
                }, 1000);
            } else {
                const failedFiles = data.results.filter(r => r.status !== 'success');
                showUploadMessage('error', `❌ 업로드 실패: ${failedFiles[0].message || '처리 중 오류가 발생했습니다.'}`);
            }
        } else if (data.status === 'success') {
            showUploadMessage('success', `✅ ${filename} 파일이 성공적으로 업로드되었습니다!`);
            
            setTimeout(() => {
                if (window.loadDocuments) {
                    window.loadDocuments();
                } else {
                    window.location.reload();
                }
            }, 1000);
        } else if (data.status === 'error') {
            showUploadMessage('error', `❌ 업로드 실패: ${data.message || '알 수 없는 오류가 발생했습니다.'}`);
        } else {
            showUploadMessage('error', `❌ 예상하지 못한 응답 형식입니다.`);
        }
    } catch (error) {
        console.error('응답 처리 중 오류:', error);
        showUploadMessage('error', `❌ 응답 처리 중 오류가 발생했습니다: ${error.message}`);
    }
}

function handleUploadError(error, filename) {
    console.error('Upload error:', error);
    showUploadMessage('error', `❌ ${filename} 업로드 중 네트워크 오류가 발생했습니다.`);
}

// 전역으로 노출
window.handleUploadResponse = handleUploadResponse;
window.handleUploadError = handleUploadError;
window.showUploadMessage = showUploadMessage;