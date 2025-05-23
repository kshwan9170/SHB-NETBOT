/**
 * SHB-NetBot 통합 파일 관리 시스템
 * - 깔끔한 파일 업로드/삭제
 * - 즉시 UI 반영
 * - 일관된 성공/실패 메시지
 * - 안정적인 오류 처리
 * - 채팅 기능 포함
 */

class SHBFileManager {
    constructor() {
        this.isUploading = false;
        this.currentFiles = [];
        this.CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        this.chatHistory = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDocuments();
        console.log('✅ SHB 파일 관리자 초기화 완료');
    }

    setupEventListeners() {
        // 파일 업로드 폼
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        }

        // 드래그 앤 드롭
        const dropzone = document.getElementById('uploadDropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropzone.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // 파일 선택
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }

    // 드래그 오버 처리
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.borderColor = '#007bff';
        e.currentTarget.style.backgroundColor = '#f8f9fa';
    }

    // 드롭 처리
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.borderColor = '#dee2e6';
        e.currentTarget.style.backgroundColor = 'white';
        
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files);
    }

    // 파일 선택 처리
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processFiles(files);
    }

    // 업로드 처리
    async handleUpload(e) {
        e.preventDefault();
        
        if (this.isUploading) {
            this.showMessage('warning', '이미 업로드가 진행 중입니다.');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            this.showMessage('warning', '업로드할 파일을 선택해주세요.');
            return;
        }

        await this.processFiles(files);
    }

    // 파일 처리
    async processFiles(files) {
        if (this.isUploading) return;

        this.isUploading = true;
        this.setUploadButtonState(true);

        let successCount = 0;
        let failCount = 0;

        for (const file of files) {
            try {
                console.log(`📤 업로드 시작: ${file.name} (${this.formatFileSize(file.size)})`);
                
                const success = await this.uploadSingleFile(file);
                if (success) {
                    successCount++;
                    console.log(`✅ 업로드 성공: ${file.name}`);
                } else {
                    failCount++;
                    console.error(`❌ 업로드 실패: ${file.name}`);
                }
            } catch (error) {
                failCount++;
                console.error(`❌ 업로드 오류: ${file.name}`, error);
            }
        }

        // 결과 메시지 표시
        this.showUploadResults(successCount, failCount, files.length);
        
        // UI 새로고침
        if (successCount > 0) {
            await this.refreshDocumentList();
        }

        // UI 초기화
        this.resetUploadForm();
        this.setUploadButtonState(false);
        this.isUploading = false;
    }

    // 단일 파일 업로드
    async uploadSingleFile(file) {
        try {
            if (file.size > this.CHUNK_SIZE) {
                return await this.uploadLargeFile(file);
            } else {
                return await this.uploadSmallFile(file);
            }
        } catch (error) {
            console.error('파일 업로드 오류:', error);
            return false;
        }
    }

    // 작은 파일 업로드
    async uploadSmallFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        return this.validateUploadResponse(response, data);
    }

    // 대용량 파일 청크 업로드
    async uploadLargeFile(file) {
        const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
        let sessionId = null;

        console.log(`📦 청크 업로드: ${file.name} (${totalChunks}개 청크)`);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunkData', chunk);
            formData.append('filename', file.name);
            formData.append('chunkIndex', i.toString());
            formData.append('totalChunks', totalChunks.toString());
            
            if (sessionId) {
                formData.append('sessionId', sessionId);
            }

            const response = await fetch('/api/upload-chunk', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(`청크 ${i + 1} 업로드 실패: ${data.error || '알 수 없는 오류'}`);
            }

            if (i === 0 && data.sessionId) {
                sessionId = data.sessionId;
            }

            console.log(`📦 청크 ${i + 1}/${totalChunks} 완료`);
        }

        return true;
    }

    // 업로드 응답 검증
    validateUploadResponse(response, data) {
        if (!response.ok) {
            return false;
        }

        // results 배열이 있는 경우
        if (data.results && Array.isArray(data.results)) {
            return data.results.every(result => result.status === 'success');
        }

        // 단일 응답인 경우
        return data.status === 'success' || data.success === true;
    }

    // 문서 목록 로드
    async loadDocuments() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();

            if (response.ok && data.files) {
                this.currentFiles = data.files;
                this.renderDocumentList(data.files);
                console.log(`📁 문서 목록 로드: ${data.files.length}개 파일`);
            } else {
                console.error('문서 목록 로드 실패:', data);
                this.renderEmptyState();
            }
        } catch (error) {
            console.error('문서 목록 API 오류:', error);
            this.renderEmptyState();
        }
    }

    // 문서 목록 새로고침
    async refreshDocumentList() {
        console.log('🔄 문서 목록 새로고침...');
        await this.loadDocuments();
        
        // 안전장치: 0.5초 후 한 번 더
        setTimeout(async () => {
            await this.loadDocuments();
        }, 500);
    }

    // 문서 목록 렌더링
    renderDocumentList(files) {
        const container = document.getElementById('documents-tbody');
        if (!container) return;

        if (files.length === 0) {
            this.renderEmptyState();
            return;
        }

        container.innerHTML = '';

        files.forEach(file => {
            const row = this.createDocumentRow(file);
            container.appendChild(row);
        });

        // 테이블 표시
        const table = document.getElementById('documents-table');
        if (table) {
            table.style.display = 'table';
        }
    }

    // 문서 행 생성
    createDocumentRow(file) {
        const row = document.createElement('tr');
        const fileSize = this.formatFileSize(file.size);

        row.innerHTML = `
            <td style="padding: 12px; border-bottom: 1px solid #eaeaea;">
                <span class="file-name-link" data-filename="${file.system_filename}" 
                      style="color: #30507A; cursor: pointer; text-decoration: underline; font-weight: 500;">
                    ${this.escapeHtml(file.filename)}
                </span>
            </td>
            <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                ${fileSize}
            </td>
            <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                <button class="delete-btn" data-filename="${file.system_filename}" 
                        data-displayname="${this.escapeHtml(file.filename)}"
                        style="background-color: #ff5252; color: white; border: none; border-radius: 4px; 
                               padding: 8px 12px; cursor: pointer; font-weight: bold;">
                    DELETE
                </button>
            </td>
        `;

        // 이벤트 리스너 추가
        const fileLink = row.querySelector('.file-name-link');
        fileLink.addEventListener('click', () => this.openDocument(file.system_filename));

        const deleteBtn = row.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => this.deleteFile(file.system_filename, file.filename));

        return row;
    }

    // 빈 상태 렌더링
    renderEmptyState() {
        const container = document.getElementById('documents-tbody');
        const table = document.getElementById('documents-table');
        
        if (container) {
            container.innerHTML = '';
        }
        
        if (table) {
            table.style.display = 'none';
        }
    }

    // 파일 삭제
    async deleteFile(systemFilename, displayName) {
        if (!confirm(`"${displayName}" 파일을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            console.log(`🗑️ 파일 삭제 시작: ${displayName}`);

            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: systemFilename
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showMessage('success', `✅ "${displayName}" 파일이 삭제되었습니다.`);
                await this.refreshDocumentList();
                console.log(`✅ 파일 삭제 완료: ${displayName}`);
            } else {
                this.showMessage('error', `❌ 파일 삭제 실패: ${data.error || '알 수 없는 오류'}`);
                console.error('파일 삭제 실패:', data);
            }
        } catch (error) {
            this.showMessage('error', `❌ 파일 삭제 중 오류가 발생했습니다.`);
            console.error('파일 삭제 오류:', error);
        }
    }

    // 문서 열기
    openDocument(systemFilename) {
        window.open(`/api/documents/view/${encodeURIComponent(systemFilename)}`, '_blank');
    }

    // 업로드 결과 메시지 표시
    showUploadResults(successCount, failCount, totalCount) {
        if (failCount === 0) {
            // 모든 파일 성공
            const message = totalCount === 1 ? 
                `✅ 파일이 성공적으로 업로드되었습니다!` :
                `✅ ${successCount}개 파일이 모두 성공적으로 업로드되었습니다!`;
            this.showMessage('success', message);
        } else if (successCount === 0) {
            // 모든 파일 실패
            this.showMessage('error', `❌ ${failCount}개 파일 업로드에 실패했습니다.`);
        } else {
            // 일부 성공, 일부 실패
            this.showMessage('warning', `⚠️ ${successCount}개 성공, ${failCount}개 실패`);
        }
    }

    // 메시지 표시
    showMessage(type, message) {
        // 기존 메시지 제거
        const existing = document.querySelector('.shb-message');
        if (existing) {
            existing.remove();
        }

        // 새 메시지 생성
        const messageDiv = document.createElement('div');
        messageDiv.className = 'shb-message';
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6'
        };

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
            background: ${colors[type] || colors.info};
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);

        // 애니메이션
        setTimeout(() => {
            messageDiv.style.transform = 'translateX(0)';
        }, 10);

        // 자동 제거
        setTimeout(() => {
            messageDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 300);
        }, 4000);
    }

    // 업로드 버튼 상태 설정
    setUploadButtonState(uploading) {
        const button = document.getElementById('uploadButton');
        if (button) {
            button.disabled = uploading;
            button.textContent = uploading ? 'Uploading...' : 'Upload Files';
        }
    }

    // 업로드 폼 초기화
    resetUploadForm() {
        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('uploadDropzone');
        
        if (fileInput) {
            fileInput.value = '';
        }
        
        if (dropzone) {
            const p = dropzone.querySelector('p');
            if (p) {
                p.textContent = 'Drag and drop files here or browse';
            }
        }
    }

    // 채팅 기능 추가
    setupChatEvents() {
        const chatForm = document.getElementById('chatForm');
        const chatInput = document.getElementById('chatInput');
        
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => this.handleChatSubmit(e));
        }
        
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleChatSubmit(e);
                }
            });
        }
    }

    async handleChatSubmit(e) {
        e.preventDefault();
        
        const chatInput = document.getElementById('chatInput');
        const query = chatInput.value.trim();
        
        if (!query) return;
        
        // UI에 사용자 메시지 추가
        this.addChatMessage(query, 'user');
        chatInput.value = '';
        
        // 로딩 상태 표시
        const loadingId = this.addChatMessage('응답을 생성중입니다...', 'bot', true);
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    chat_history: this.chatHistory
                })
            });
            
            const data = await response.json();
            
            // 로딩 메시지 제거
            this.removeChatMessage(loadingId);
            
            if (response.ok) {
                this.addChatMessage(data.response, 'bot');
                this.chatHistory.push({role: 'user', content: query});
                this.chatHistory.push({role: 'assistant', content: data.response});
            } else {
                this.addChatMessage('죄송합니다. 응답을 생성할 수 없습니다.', 'bot');
            }
        } catch (error) {
            this.removeChatMessage(loadingId);
            this.addChatMessage('네트워크 오류가 발생했습니다.', 'bot');
        }
    }

    addChatMessage(content, sender, isLoading = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return null;
        
        const messageId = 'msg_' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message${isLoading ? ' loading' : ''}`;
        messageDiv.id = messageId;
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${this.escapeHtml(content)}
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return messageId;
    }

    removeChatMessage(messageId) {
        const message = document.getElementById(messageId);
        if (message) {
            message.remove();
        }
    }

    // 네비게이션 설정
    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.section');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                const targetId = link.getAttribute('href').substring(1);
                
                // 모든 섹션 숨기기
                sections.forEach(section => {
                    section.style.display = 'none';
                });
                
                // 모든 네비게이션 링크에서 active 클래스 제거
                navLinks.forEach(navLink => {
                    navLink.classList.remove('active');
                });
                
                // 대상 섹션 보이기
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.style.display = 'block';
                }
                
                // 클릭된 링크에 active 클래스 추가
                link.classList.add('active');
            });
        });
    }

    // 유틸리티 함수들
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// 전역으로 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.shbFileManager = new SHBFileManager();
    
    // 채팅 및 네비게이션 이벤트 설정
    window.shbFileManager.setupChatEvents();
    window.shbFileManager.setupNavigation();
    
    // AOS 애니메이션 초기화
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: true
        });
    }
    
    console.log('✅ SHB-NetBot 통합 시스템 초기화 완료');
});