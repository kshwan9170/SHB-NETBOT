/**
 * 문서 관리자 - 파일 목록 표시 및 삭제 기능
 */

document.addEventListener('DOMContentLoaded', function() {
    // 파일 목록 컨테이너
    const fileList = document.getElementById('file-list');
    const emptyState = document.querySelector('.empty-state');
    const documentsList = document.getElementById('documentsList');
    
    console.log("Document manager initialized");
    console.log("File list element exists:", fileList !== null);
    
    // 문서 업로드 후 이벤트 감지
    document.getElementById('uploadForm')?.addEventListener('submit', function() {
        // 업로드 완료 후 파일 목록 갱신
        setTimeout(loadDocuments, 2000);
    });
    
    // 파일 목록 초기 로드
    if (fileList) {
        loadDocuments();
    }
    
    /**
     * 서버에서 문서 목록을 가져와 화면에 표시
     */
    async function loadDocuments() {
        try {
            console.log("Fetching document list...");
            const response = await fetch('/api/documents');
            const data = await response.json();
            
            console.log("Document list data:", data);
            
            if (response.ok) {
                if (data.files && Array.isArray(data.files)) {
                    renderFileList(data.files);
                    
                    // 파일이 있으면 빈 상태 메시지 숨기기
                    if (data.files.length > 0) {
                        if (emptyState) {
                            emptyState.style.display = 'none';
                        }
                    } else {
                        if (emptyState) {
                            emptyState.style.display = 'flex';
                        }
                    }
                    
                    console.log(`Loaded ${data.files.length} files`);
                } else {
                    console.error('유효한 파일 목록이 없습니다:', data);
                    if (emptyState) {
                        emptyState.style.display = 'flex';
                    }
                }
            } else {
                console.error('문서 목록을 가져오는 중 오류 발생:', data.error);
            }
        } catch (error) {
            console.error('문서 목록 API 호출 중 오류 발생:', error);
        }
    }
    
    /**
     * 파일 목록을 화면에 렌더링
     * @param {Array} files - 파일 목록 배열
     */
    function renderFileList(files) {
        if (!fileList) {
            console.error("File list element not found in DOM");
            return;
        }
        
        console.log("Rendering file list:", files);
        
        // 기존 목록 비우기
        fileList.innerHTML = '';
        
        if (!files || files.length === 0) {
            console.log("No files to display");
            return;
        }
        
        // 파일 목록 표시
        files.forEach(file => {
            const listItem = document.createElement('li');
            listItem.className = 'file-item';
            
            // 파일 타입에 따른 아이콘 결정
            let fileIcon = '';
            switch (file.file_type.toLowerCase()) {
                case 'pdf':
                    fileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15h6"></path><path d="M9 18h6"></path><path d="M9 12h2"></path></svg>';
                    break;
                case 'docx':
                    fileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
                    break;
                case 'pptx':
                    fileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
                    break;
                case 'xlsx':
                case 'xls':
                    fileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><polyline points="8 16 12 12 16 16"></polyline><polyline points="8 12 12 8 16 12"></polyline></svg>';
                    break;
                default:
                    fileIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
            }
            
            // 파일 크기 포맷팅
            const fileSize = formatFileSize(file.size);
            
            // 파일 날짜 포맷팅
            const fileDate = new Date(file.uploaded_at * 1000).toLocaleDateString();
            
            console.log("Creating list item for file:", file);
            
            // 항목 내용 생성
            listItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-details">
                        <div class="file-name">${file.filename || "Unknown File"}</div>
                        <div class="file-meta">
                            <span>${fileSize}</span>
                            <span>${fileDate}</span>
                            <span>${file.file_type ? file.file_type.toUpperCase() : "?"}</span>
                        </div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="delete-btn" title="파일 삭제">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            `;
            
            // 삭제 버튼에 이벤트 리스너 추가
            const deleteBtn = listItem.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    deleteFile(file.system_filename, file.filename, listItem);
                });
            }
            
            // 목록에 항목 추가
            fileList.appendChild(listItem);
        });
    }
    
    /**
     * 파일 삭제 처리
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     * @param {HTMLElement} listItem - 삭제할 파일의 리스트 항목 요소
     */
    async function deleteFile(systemFilename, displayFilename, listItem) {
        console.log(`Attempting to delete file: ${displayFilename} (${systemFilename})`);
        
        // 사용자 확인
        if (!confirm(`파일 "${displayFilename}"을(를) 삭제하시겠습니까?`)) {
            console.log("Deletion cancelled by user");
            return;
        }
        
        try {
            console.log("Sending delete request to server...");
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ system_filename: systemFilename })
            });
            
            console.log("Delete response status:", response.status);
            const data = await response.json();
            console.log("Delete response data:", data);
            
            if (response.ok && data.success) {
                console.log("File deleted successfully");
                // 성공적으로 삭제된 경우 UI에서 요소 제거
                listItem.remove();
                
                // 파일 목록이 비어있는지 확인
                if (fileList.children.length === 0 && emptyState) {
                    console.log("No files left, showing empty state");
                    emptyState.style.display = 'flex';
                }
            } else {
                console.error('파일 삭제 중 오류 발생:', data.error);
                alert(`삭제 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
            }
        } catch (error) {
            console.error('파일 삭제 API 호출 중 오류 발생:', error);
            alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
    
    /**
     * 파일 크기를 읽기 쉬운 형식으로 변환
     * @param {number} bytes - 바이트 단위 파일 크기
     * @returns {string} 포맷팅된 파일 크기
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
});