/**
 * 깔끔한 파일 관리 시스템 - 완전히 새로 설계
 * - 정확한 성공/실패 메시지
 * - 중복 방지
 * - 깔끔한 UI 처리
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('깔끔한 파일 관리 시스템 초기화');
    
    // 전역 변수
    let allFiles = [];
    let currentPage = 1;
    const filesPerPage = 7;
    
    // 파일 업로드 처리
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleFileUpload);
    }
    
    // 파일 목록 초기 로드
    loadDocuments();
    
    /**
     * 파일 업로드 처리 함수
     */
    async function handleFileUpload(event) {
        event.preventDefault();
        
        const fileInput = document.getElementById('files');
        const files = fileInput.files;
        const submitBtn = document.querySelector('#upload-form button[type="submit"]');
        
        if (!files || files.length === 0) {
            alert('업로드할 파일을 선택해주세요.');
            return;
        }
        
        // 버튼 상태 변경
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '업로드 중...';
        submitBtn.disabled = true;
        submitBtn.style.backgroundColor = '#6c757d';
        
        // FormData 생성
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        try {
            // 서버로 업로드 요청
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            const filename = Array.from(files).map(f => f.name).join(', ');
            
            // 응답 처리
            if (response.ok) {
                handleUploadSuccess(data, filename);
            } else {
                handleUploadError(new Error(data.message || '업로드 실패'), filename);
            }
            
        } catch (error) {
            const filename = Array.from(files).map(f => f.name).join(', ');
            handleUploadError(error, filename);
        } finally {
            // 파일 입력 초기화
            fileInput.value = '';
            
            // 버튼 원상복구
            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.style.backgroundColor = '';
                submitBtn.disabled = false;
            }, 1500);
        }
    }
    
    /**
     * 업로드 성공 처리
     */
    function handleUploadSuccess(data, filename) {
        if (data.results && Array.isArray(data.results)) {
            const allSuccess = data.results.every(result => result.status === 'success');
            
            if (allSuccess) {
                showMessage('success', `✅ ${filename} 파일이 성공적으로 업로드되었습니다!`);
                
                // 즉시 파일 목록 새로고침 (여러 번 시도로 확실히 반영)
                loadDocuments();
                setTimeout(() => {
                    loadDocuments();
                }, 500);
                setTimeout(() => {
                    loadDocuments();
                }, 1000);
            } else {
                const failedFiles = data.results.filter(r => r.status !== 'success');
                showMessage('error', `❌ 업로드 실패: ${failedFiles[0].message || '처리 중 오류가 발생했습니다.'}`);
            }
        } else if (data.status === 'success') {
            showMessage('success', `✅ ${filename} 파일이 성공적으로 업로드되었습니다!`);
            setTimeout(() => {
                loadDocuments();
            }, 1000);
        } else {
            showMessage('error', `❌ 업로드 실패: ${data.message || '알 수 없는 오류가 발생했습니다.'}`);
        }
    }
    
    /**
     * 업로드 오류 처리
     */
    function handleUploadError(error, filename) {
        console.error('Upload error:', error);
        showMessage('error', `❌ ${filename} 업로드 중 오류가 발생했습니다: ${error.message}`);
    }
    
    /**
     * 메시지 표시 함수
     */
    function showMessage(type, message) {
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
    
    /**
     * 문서 목록 로드
     */
    async function loadDocuments() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();
            
            if (data.files && Array.isArray(data.files)) {
                allFiles = data.files;
                renderFileList(allFiles);
            } else {
                renderEmptyState();
            }
        } catch (error) {
            console.error('파일 목록 로드 오류:', error);
            renderEmptyState();
        }
    }
    
    /**
     * 파일 목록 렌더링
     */
    function renderFileList(files) {
        const fileListContainer = document.getElementById('file-list-container');
        if (!fileListContainer) return;
        
        // JSON 파일 필터링
        const filteredFiles = files.filter(file => {
            const fileType = file.file_type ? file.file_type.toLowerCase() : '';
            return fileType !== 'json';
        });
        
        if (filteredFiles.length === 0) {
            renderEmptyState();
            return;
        }
        
        // 페이지네이션 적용
        const startIndex = (currentPage - 1) * filesPerPage;
        const endIndex = startIndex + filesPerPage;
        const visibleFiles = filteredFiles.slice(startIndex, endIndex);
        
        // HTML 생성
        let html = `
            <div class="file-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
        `;
        
        visibleFiles.forEach(file => {
            const fileIcon = getFileIcon(file.file_type);
            const fileSize = formatFileSize(file.size);
            const uploadDate = new Date(file.uploaded_at * 1000).toLocaleDateString('ko-KR');
            
            html += `
                <div class="file-card" style="background: linear-gradient(135deg, rgba(0,100,225,0.05), rgba(0,100,225,0.1)); border: 1px solid rgba(0,100,225,0.2); border-radius: 12px; padding: 20px; position: relative;">
                    <div class="file-header" style="display: flex; align-items: center; margin-bottom: 15px;">
                        <div class="file-icon" style="font-size: 24px; margin-right: 12px;">${fileIcon}</div>
                        <div class="file-info" style="flex: 1; min-width: 0;">
                            <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #333; word-break: break-word;">${file.filename}</h4>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">${file.file_type.toUpperCase()} • ${fileSize} • ${uploadDate}</p>
                        </div>
                    </div>
                    
                    <div class="file-actions" style="display: flex; gap: 8px; margin-top: 15px;">
                        <button onclick="viewDocument('${file.system_filename}', '${file.filename}')" 
                                style="flex: 1; padding: 8px 12px; background: #0064E1; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            📄 보기
                        </button>
                        <button onclick="downloadDocument('${file.system_filename}', '${file.filename}')" 
                                style="flex: 1; padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            💾 다운로드
                        </button>
                        <button onclick="deleteDocument('${file.system_filename}', '${file.filename}')" 
                                style="flex: 1; padding: 8px 12px; background: #dc3545; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            🗑️ 삭제
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // 페이지네이션 추가
        if (filteredFiles.length > filesPerPage) {
            html += renderPagination(filteredFiles.length);
        }
        
        fileListContainer.innerHTML = html;
    }
    
    /**
     * 빈 상태 렌더링
     */
    function renderEmptyState() {
        const fileListContainer = document.getElementById('file-list-container');
        if (!fileListContainer) return;
        
        fileListContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #666;">
                <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
                <h3 style="margin: 0 0 8px 0; color: #333;">업로드된 파일이 없습니다</h3>
                <p style="margin: 0;">위의 업로드 영역을 통해 파일을 업로드해보세요.</p>
            </div>
        `;
    }
    
    /**
     * 페이지네이션 렌더링
     */
    function renderPagination(totalFiles) {
        const totalPages = Math.ceil(totalFiles / filesPerPage);
        let html = `<div class="pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 20px;">`;
        
        // 이전 페이지
        if (currentPage > 1) {
            html += `<button onclick="changePage(${currentPage - 1})" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; cursor: pointer; border-radius: 4px;">‹ 이전</button>`;
        }
        
        // 페이지 번호
        for (let i = 1; i <= totalPages; i++) {
            const isActive = i === currentPage;
            html += `<button onclick="changePage(${i})" style="padding: 8px 12px; border: 1px solid #ddd; background: ${isActive ? '#0064E1' : '#f8f9fa'}; color: ${isActive ? 'white' : '#333'}; cursor: pointer; border-radius: 4px;">${i}</button>`;
        }
        
        // 다음 페이지
        if (currentPage < totalPages) {
            html += `<button onclick="changePage(${currentPage + 1})" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; cursor: pointer; border-radius: 4px;">다음 ›</button>`;
        }
        
        html += '</div>';
        return html;
    }
    
    /**
     * 페이지 변경
     */
    window.changePage = function(page) {
        currentPage = page;
        renderFileList(allFiles);
    };
    
    /**
     * 파일 아이콘 반환
     */
    function getFileIcon(fileType) {
        const icons = {
            'csv': '📊',
            'xlsx': '📈',
            'xls': '📈',
            'pdf': '📄',
            'txt': '📝',
            'json': '🔧'
        };
        return icons[fileType?.toLowerCase()] || '📄';
    }
    
    /**
     * 파일 크기 포맷팅
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 문서 보기
     */
    window.viewDocument = async function(systemFilename, displayFilename) {
        try {
            const response = await fetch(`/api/documents/view/${encodeURIComponent(systemFilename)}`);
            const data = await response.json();
            
            if (data.content) {
                // 새 창에서 문서 내용 표시
                const newWindow = window.open('', '_blank');
                newWindow.document.write(`
                    <html>
                        <head>
                            <title>${displayFilename}</title>
                            <meta charset="utf-8">
                            <style>
                                body { font-family: Arial, sans-serif; margin: 20px; }
                                table { border-collapse: collapse; width: 100%; }
                                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                th { background-color: #f2f2f2; }
                            </style>
                        </head>
                        <body>
                            <h1>${displayFilename}</h1>
                            ${data.content}
                        </body>
                    </html>
                `);
            } else {
                alert('문서 내용을 불러올 수 없습니다.');
            }
        } catch (error) {
            console.error('문서 보기 오류:', error);
            alert('문서를 불러오는 중 오류가 발생했습니다.');
        }
    };
    
    /**
     * 문서 다운로드
     */
    window.downloadDocument = function(systemFilename, displayFilename) {
        const link = document.createElement('a');
        link.href = `/api/documents/download/${encodeURIComponent(systemFilename)}`;
        link.download = displayFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('success', `${displayFilename} 다운로드가 시작되었습니다.`);
    };
    
    /**
     * 문서 삭제
     */
    window.deleteDocument = async function(systemFilename, displayFilename) {
        if (!confirm(`"${displayFilename}" 파일을 삭제하시겠습니까?`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_filename: systemFilename
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showMessage('success', `${displayFilename} 파일이 삭제되었습니다.`);
                loadDocuments(); // 목록 새로고침
            } else {
                showMessage('error', `삭제 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error('삭제 오류:', error);
            showMessage('error', '파일 삭제 중 오류가 발생했습니다.');
        }
    };
});