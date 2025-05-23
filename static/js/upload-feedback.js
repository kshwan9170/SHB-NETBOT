/**
 * SHB-NetBot 문서 업로드 피드백 시스템
 * - 업로드 진행 상황 실시간 표시
 * - 문서 처리 결과 피드백
 * - 인덱싱 상태 확인
 */

class UploadFeedbackSystem {
    constructor() {
        this.notificationContainer = null;
        this.currentUploads = new Map();
        this.init();
    }
    
    init() {
        this.createNotificationContainer();
        this.setupEventListeners();
    }
    
    createNotificationContainer() {
        // 알림 표시용 컨테이너 생성
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'upload-feedback-container';
        this.notificationContainer.className = 'upload-feedback-container';
        this.notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(this.notificationContainer);
    }
    
    setupEventListeners() {
        // 파일 업로드 이벤트 감지
        document.addEventListener('uploadStarted', (event) => {
            this.handleUploadStart(event.detail);
        });
        
        document.addEventListener('uploadProgress', (event) => {
            this.handleUploadProgress(event.detail);
        });
        
        document.addEventListener('uploadCompleted', (event) => {
            this.handleUploadComplete(event.detail);
        });
        
        document.addEventListener('uploadError', (event) => {
            this.handleUploadError(event.detail);
        });
    }
    
    /**
     * 업로드 시작 알림
     */
    handleUploadStart(uploadData) {
        const { filename, uploadId } = uploadData;
        
        const notification = this.createNotification({
            id: uploadId,
            type: 'info',
            title: '📤 문서 업로드 중',
            message: `${filename} 파일을 업로드하고 있습니다...`,
            showProgress: true,
            persistent: true
        });
        
        this.currentUploads.set(uploadId, {
            filename,
            notification,
            startTime: Date.now()
        });
    }
    
    /**
     * 업로드 진행 상황 업데이트
     */
    handleUploadProgress(progressData) {
        const { uploadId, progress, stage } = progressData;
        const uploadInfo = this.currentUploads.get(uploadId);
        
        if (uploadInfo) {
            const progressBar = uploadInfo.notification.querySelector('.progress-bar');
            const stageText = uploadInfo.notification.querySelector('.upload-stage');
            
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            if (stageText) {
                stageText.textContent = this.getStageMessage(stage);
            }
        }
    }
    
    /**
     * 업로드 완료 처리
     */
    handleUploadComplete(completeData) {
        const { uploadId, results } = completeData;
        const uploadInfo = this.currentUploads.get(uploadId);
        
        if (uploadInfo) {
            // 기존 업로드 알림 제거
            this.removeNotification(uploadInfo.notification);
            
            // 결과에 따른 알림 표시
            this.showProcessingResults(results, uploadInfo.filename);
            
            this.currentUploads.delete(uploadId);
        }
    }
    
    /**
     * 업로드 오류 처리
     */
    handleUploadError(errorData) {
        const { uploadId, error } = errorData;
        const uploadInfo = this.currentUploads.get(uploadId);
        
        if (uploadInfo) {
            this.removeNotification(uploadInfo.notification);
            
            this.createNotification({
                type: 'error',
                title: '❌ 업로드 실패',
                message: `${uploadInfo.filename}: ${error}`,
                duration: 8000
            });
            
            this.currentUploads.delete(uploadId);
        }
    }
    
    /**
     * 문서 처리 결과 표시
     */
    showProcessingResults(results, filename) {
        results.forEach(result => {
            let notification;
            
            if (result.status === 'success') {
                // 성공적인 처리
                const message = this.buildSuccessMessage(result);
                
                notification = this.createNotification({
                    type: 'success',
                    title: '✅ 문서 처리 완료',
                    message: message,
                    duration: 6000
                });
                
                // Flow 파일인 경우 추가 알림
                if (result.filename.includes('SHB-NetBot_Flow')) {
                    setTimeout(() => {
                        this.createNotification({
                            type: 'info',
                            title: '🔄 Flow 시스템 업데이트',
                            message: 'Flow 데이터가 업데이트되었습니다. 오프라인 모드에서 새로운 안내가 적용됩니다.',
                            duration: 4000
                        });
                    }, 1000);
                }
            } else {
                // 처리 실패
                notification = this.createNotification({
                    type: 'error',
                    title: '⚠️ 문서 처리 실패',
                    message: `${result.filename}: ${result.message}`,
                    duration: 8000
                });
            }
        });
    }
    
    /**
     * 성공 메시지 구성
     */
    buildSuccessMessage(result) {
        let message = `📄 ${result.filename}\n`;
        
        if (result.chunk_count) {
            message += `✓ ${result.chunk_count}개 섹션으로 분할됨\n`;
        }
        
        message += '✓ AI 검색 인덱스에 등록됨\n';
        message += '✓ 채팅에서 검색 가능';
        
        return message;
    }
    
    /**
     * 단계별 메시지 반환
     */
    getStageMessage(stage) {
        const stageMessages = {
            'uploading': '파일 업로드 중...',
            'parsing': '문서 분석 중...',
            'chunking': '텍스트 분할 중...',
            'indexing': 'AI 인덱스 생성 중...',
            'finalizing': '처리 완료 중...'
        };
        
        return stageMessages[stage] || '처리 중...';
    }
    
    /**
     * 알림 생성
     */
    createNotification(options) {
        const {
            id = null,
            type = 'info',
            title = '',
            message = '',
            duration = 5000,
            showProgress = false,
            persistent = false
        } = options;
        
        const notification = document.createElement('div');
        notification.className = `upload-notification notification-${type}`;
        if (id) notification.id = id;
        
        notification.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-left: 4px solid ${this.getTypeColor(type)};
            pointer-events: auto;
            animation: slideInRight 0.3s ease-out;
            white-space: pre-line;
            line-height: 1.4;
        `;
        
        let html = `
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1a2b4c; margin-bottom: 4px; font-size: 14px;">
                        ${title}
                    </div>
                    <div style="color: #5a6373; font-size: 13px;">
                        ${message}
                    </div>
                    ${showProgress ? `
                        <div style="margin-top: 8px;">
                            <div class="upload-stage" style="font-size: 11px; color: #666; margin-bottom: 4px;">처리 중...</div>
                            <div style="background: #f0f0f0; border-radius: 4px; height: 6px; overflow: hidden;">
                                <div class="progress-bar" style="background: ${this.getTypeColor(type)}; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${!persistent ? `
                    <button onclick="this.parentElement.parentElement.remove()" 
                            style="background: none; border: none; color: #999; cursor: pointer; font-size: 16px; padding: 0; width: 20px; height: 20px;">
                        ×
                    </button>
                ` : ''}
            </div>
        `;
        
        notification.innerHTML = html;
        this.notificationContainer.appendChild(notification);
        
        // 자동 제거 (persistent가 아닌 경우)
        if (!persistent && duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }
        
        return notification;
    }
    
    /**
     * 알림 제거
     */
    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }
    
    /**
     * 타입별 색상 반환
     */
    getTypeColor(type) {
        const colors = {
            'success': '#10b981',
            'error': '#ef4444',
            'warning': '#f59e0b',
            'info': '#3b82f6'
        };
        
        return colors[type] || colors.info;
    }
}

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 전역 인스턴스 생성
window.uploadFeedback = new UploadFeedbackSystem();