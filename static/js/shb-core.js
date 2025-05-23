/**
 * SHB-NetBot 핵심 시스템
 * - 파일 업로드/삭제/조회
 * - 채팅 기능
 * - 네비게이션
 * - 모든 불필요한 기능 제거
 */

class SHBCore {
    constructor() {
        this.isUploading = false;
        this.chatHistory = [];
        this.CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        this.init();
    }

    init() {
        console.log('🚀 SHB-NetBot 핵심 시스템 초기화');
        this.setupFileEvents();
        this.setupChatEvents();
        this.setupNavigation();
        this.loadDocuments();
        this.initAOS();
    }

    // 파일 관리 기능
    setupFileEvents() {
        // 업로드 폼
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        }

        // 드래그 앤 드롭
        const dropzone = document.getElementById('uploadDropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = '#007bff';
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = '#dee2e6';
                this.processFiles(Array.from(e.dataTransfer.files));
            });
        }

        // 파일 선택
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.processFiles(Array.from(e.target.files));
            });
        }
    }

    async handleUpload(e) {
        e.preventDefault();
        const fileInput = document.getElementById('fileInput');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            alert('업로드할 파일을 선택해주세요.');
            return;
        }

        await this.processFiles(files);
    }

    async processFiles(files) {
        if (this.isUploading) return;

        this.isUploading = true;
        this.setButtonState(true);

        let success = 0;
        let fail = 0;

        for (const file of files) {
            try {
                console.log(`📤 업로드: ${file.name}`);
                const result = await this.uploadFile(file);
                if (result) success++;
                else fail++;
            } catch (error) {
                console.error(`❌ 오류: ${file.name}`, error);
                fail++;
            }
        }

        // 결과 표시
        if (fail === 0) {
            alert(`✅ ${success}개 파일 업로드 완료!`);
        } else {
            alert(`⚠️ ${success}개 성공, ${fail}개 실패`);
        }

        // UI 새로고침
        if (success > 0) {
            await this.loadDocuments();
            setTimeout(() => this.loadDocuments(), 500);
        }

        this.resetForm();
        this.setButtonState(false);
        this.isUploading = false;
    }

    async uploadFile(file) {
        try {
            if (file.size > this.CHUNK_SIZE) {
                return await this.uploadChunked(file);
            } else {
                return await this.uploadSingle(file);
            }
        } catch (error) {
            console.error('업로드 오류:', error);
            return false;
        }
    }

    async uploadSingle(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('업로드 응답:', response.status, data);

        if (response.ok && data.results) {
            return data.results.every(r => r.status === 'success');
        }
        return response.ok;
    }

    async uploadChunked(file) {
        const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
        let sessionId = null;

        console.log(`📦 청크 업로드: ${totalChunks}개`);

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
                throw new Error(`청크 ${i + 1} 실패: ${data.error}`);
            }

            if (i === 0 && data.sessionId) {
                sessionId = data.sessionId;
            }
        }

        return true;
    }

    async loadDocuments() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();

            if (response.ok && data.files) {
                this.renderDocuments(data.files);
                console.log(`📁 문서 로드: ${data.files.length}개`);
            }
        } catch (error) {
            console.error('문서 로드 오류:', error);
        }
    }

    renderDocuments(files) {
        const tbody = document.getElementById('documents-tbody');
        const table = document.getElementById('documents-table');
        
        if (!tbody) return;

        tbody.innerHTML = '';

        if (files.length === 0) {
            if (table) table.style.display = 'none';
            return;
        }

        files.forEach(file => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea;">
                    <span onclick="window.open('/api/documents/view/${encodeURIComponent(file.system_filename)}', '_blank')"
                          style="color: #30507A; cursor: pointer; text-decoration: underline; font-weight: 500;">
                        ${this.escapeHtml(file.filename)}
                    </span>
                </td>
                <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                    ${this.formatSize(file.size)}
                </td>
                <td style="text-align: center; padding: 12px; border-bottom: 1px solid #eaeaea;">
                    <button onclick="shbCore.deleteFile('${file.system_filename}', '${this.escapeHtml(file.filename)}')"
                            style="background-color: #ff5252; color: white; border: none; border-radius: 4px; 
                                   padding: 8px 12px; cursor: pointer; font-weight: bold;">
                        DELETE
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        if (table) table.style.display = 'table';
    }

    async deleteFile(systemFilename, displayName) {
        if (!confirm(`"${displayName}" 파일을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: systemFilename })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert(`✅ "${displayName}" 삭제 완료`);
                await this.loadDocuments();
            } else {
                alert(`❌ 삭제 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            alert(`❌ 삭제 중 오류 발생`);
            console.error('삭제 오류:', error);
        }
    }

    // 채팅 기능
    setupChatEvents() {
        const chatForm = document.getElementById('chatForm');
        const chatInput = document.getElementById('chatInput');
        
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => this.handleChat(e));
        }
        
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleChat(e);
                }
            });
        }
    }

    async handleChat(e) {
        e.preventDefault();
        
        const chatInput = document.getElementById('chatInput');
        const query = chatInput.value.trim();
        
        if (!query) return;
        
        this.addMessage(query, 'user');
        chatInput.value = '';
        
        const loadingId = this.addMessage('응답 생성중...', 'bot', true);
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    chat_history: this.chatHistory
                })
            });
            
            const data = await response.json();
            this.removeMessage(loadingId);
            
            if (response.ok) {
                this.addMessage(data.response, 'bot');
                this.chatHistory.push({role: 'user', content: query});
                this.chatHistory.push({role: 'assistant', content: data.response});
            } else {
                this.addMessage('응답 생성 실패', 'bot');
            }
        } catch (error) {
            this.removeMessage(loadingId);
            this.addMessage('네트워크 오류', 'bot');
            console.error('채팅 오류:', error);
        }
    }

    addMessage(content, sender, isLoading = false) {
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

    removeMessage(messageId) {
        const message = document.getElementById(messageId);
        if (message) message.remove();
    }

    // 네비게이션
    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.section');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                const targetId = link.getAttribute('href').substring(1);
                
                sections.forEach(section => section.style.display = 'none');
                navLinks.forEach(navLink => navLink.classList.remove('active'));
                
                const targetSection = document.getElementById(targetId);
                if (targetSection) targetSection.style.display = 'block';
                
                link.classList.add('active');
            });
        });
    }

    // 유틸리티 함수
    setButtonState(uploading) {
        const button = document.getElementById('uploadButton');
        if (button) {
            button.disabled = uploading;
            button.textContent = uploading ? 'Uploading...' : 'Upload Files';
        }
    }

    resetForm() {
        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('uploadDropzone');
        
        if (fileInput) fileInput.value = '';
        if (dropzone) {
            const p = dropzone.querySelector('p');
            if (p) p.textContent = 'Drag and drop files here or browse';
        }
    }

    formatSize(bytes) {
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

    initAOS() {
        if (typeof AOS !== 'undefined') {
            AOS.init({
                duration: 800,
                easing: 'ease-in-out',
                once: true
            });
        }
    }
}

// 전역 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.shbCore = new SHBCore();
    console.log('✅ SHB-NetBot 핵심 시스템 준비 완료');
});