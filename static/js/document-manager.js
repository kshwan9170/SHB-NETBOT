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
    
    // 정적으로 생성된 삭제 버튼에 이벤트 리스너 추가
    const staticDeleteButtons = document.querySelectorAll('.document-delete-btn');
    console.log("Found static delete buttons:", staticDeleteButtons.length);
    
    staticDeleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 이 예제에서는 데이터 속성을 사용하지 않고 직접 파일 이름을 가져옵니다
            const card = button.closest('.document-card');
            const fileNameElement = card.querySelector('.document-info h4');
            
            if (fileNameElement) {
                const fileName = fileNameElement.textContent;
                console.log("Static delete button clicked for file:", fileName);
                
                if (confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) {
                    // 여기서 파일 삭제 API 호출
                    fetch('/api/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            filename: fileName  // 파일명으로 삭제 요청
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert(`"${fileName}" 파일이 삭제되었습니다.`);
                            // 페이지 새로고침
                            window.location.reload();
                        } else {
                            alert(`삭제 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
                        }
                    })
                    .catch(error => {
                        console.error('파일 삭제 API 호출 중 오류 발생:', error);
                        alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
                    });
                }
            }
        });
    });
    
    // 파일 목록 초기 로드
    const fileListContainer = document.getElementById('file-list-container');
    if (fileListContainer) {
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
                    // 파일이 있으면 빈 상태 메시지 숨기기
                    if (data.files.length > 0) {
                        if (emptyState) {
                            emptyState.style.display = 'none';
                        }
                        
                        // 새로운 방식: 직접 HTML 구성
                        renderDirectFileList(data.files);
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
    
    // 전역 변수로 페이지네이션 상태 관리
    let currentPage = 1;
    const filesPerPage = 5;
    let allFiles = [];
    
    // 새로운 함수: 직접 HTML로 파일 목록 렌더링 (페이지네이션 포함)
    function renderDirectFileList(files) {
        const fileListContainer = document.getElementById('file-list-container');
        if (!fileListContainer) {
            console.error("파일 목록 컨테이너를 찾을 수 없습니다");
            return;
        }
        
        // 전체 파일 목록 저장
        allFiles = files;
        
        // 파일 목록 컨테이너 초기화
        fileListContainer.innerHTML = '';
        
        // 현재 페이지에 표시할 파일 계산
        const startIndex = (currentPage - 1) * filesPerPage;
        const endIndex = Math.min(startIndex + filesPerPage, files.length);
        const currentFiles = files.slice(startIndex, endIndex);
        
        // 파일 목록 렌더링
        currentFiles.forEach(file => {
            const fileCard = document.createElement('div');
            fileCard.className = 'document-card';
            
            // 파일 타입에 따른 아이콘 결정
            let fileIconColor = '#ff5252'; // 기본 빨간색
            
            // 파일 크기 포맷팅
            const fileSize = formatFileSize(file.size);
            
            // 파일 날짜 포맷팅
            const fileDate = new Date(file.uploaded_at * 1000).toLocaleDateString();
            
            fileCard.innerHTML = `
                <div class="document-content">
                    <div class="document-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div class="document-info">
                        <h4>${file.filename || "Unknown File"}</h4>
                        <div class="document-meta">
                            <span>${fileSize}</span> · 
                            <span>${fileDate}</span> · 
                            <span>${file.file_type ? file.file_type.toUpperCase() : "?"}</span>
                        </div>
                    </div>
                    <div class="document-actions" style="display: flex; gap: 5px;">
                        <button class="document-view-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" style="background-color: #4caf50; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>보기</span>
                        </button>
                        ${file.file_type.toLowerCase() === 'txt' ? `
                        <button class="document-edit-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" style="background-color: #2196f3; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                            <span>편집</span>
                        </button>` : ''}
                        <button class="document-delete-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" style="background-color: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            <span>삭제</span>
                        </button>
                    </div>
                </div>
            `;
            
            fileListContainer.appendChild(fileCard);
            
            // 삭제 버튼에 이벤트 리스너 추가
            const deleteBtn = fileCard.querySelector('.document-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    const systemFilename = this.getAttribute('data-filename');
                    const displayFilename = this.getAttribute('data-displayname');
                    deleteFile(systemFilename, displayFilename, fileCard);
                });
            }
            
            // 보기 버튼에 이벤트 리스너 추가
            const viewBtn = fileCard.querySelector('.document-view-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', function() {
                    const systemFilename = this.getAttribute('data-filename');
                    const displayFilename = this.getAttribute('data-displayname');
                    viewDocument(systemFilename, displayFilename);
                });
            }
            
            // 편집 버튼에 이벤트 리스너 추가 (txt 파일만 해당)
            const editBtn = fileCard.querySelector('.document-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', function() {
                    const systemFilename = this.getAttribute('data-filename');
                    const displayFilename = this.getAttribute('data-displayname');
                    // 먼저 문서 내용을 가져온 후 편집기 열기
                    fetch(`/api/documents/view/${systemFilename}`)
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'success') {
                                editDocument(systemFilename, displayFilename, data.content);
                            } else {
                                alert(data.message || '문서 내용을 불러오는 중 오류가 발생했습니다.');
                            }
                        })
                        .catch(error => {
                            console.error('문서 내용 로드 중 오류 발생:', error);
                            alert('서버 연결 중 오류가 발생했습니다.');
                        });
                });
            }
        });
        
        // 페이지네이션 렌더링
        renderPagination(files.length);
    }
    
    // 페이지네이션 컨트롤 렌더링 함수
    function renderPagination(totalFiles) {
        const fileListContainer = document.getElementById('file-list-container');
        const totalPages = Math.ceil(totalFiles / filesPerPage);
        
        // 파일이 5개 이하면 페이지네이션 표시하지 않음
        if (totalPages <= 1) return;
        
        // 페이지네이션 컨테이너 생성
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';
        paginationContainer.style.cssText = 'margin-top: 20px; display: flex; justify-content: center; gap: 10px;';
        
        // 이전 페이지 버튼
        if (currentPage > 1) {
            const prevButton = document.createElement('button');
            prevButton.innerHTML = '&laquo; 이전';
            prevButton.className = 'pagination-btn';
            prevButton.style.cssText = 'padding: 5px 10px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            prevButton.addEventListener('click', () => {
                currentPage--;
                renderDirectFileList(allFiles);
            });
            paginationContainer.appendChild(prevButton);
        }
        
        // 페이지 숫자 버튼
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.innerText = i;
            pageButton.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
            
            const buttonStyle = 'padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            const activeStyle = 'background-color: #0064E1; color: white;';
            const inactiveStyle = 'background-color: #f5f5f5;';
            
            pageButton.style.cssText = buttonStyle + (i === currentPage ? activeStyle : inactiveStyle);
            
            pageButton.addEventListener('click', () => {
                currentPage = i;
                renderDirectFileList(allFiles);
            });
            paginationContainer.appendChild(pageButton);
        }
        
        // 다음 페이지 버튼
        if (currentPage < totalPages) {
            const nextButton = document.createElement('button');
            nextButton.innerHTML = '다음 &raquo;';
            nextButton.className = 'pagination-btn';
            nextButton.style.cssText = 'padding: 5px 10px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            nextButton.addEventListener('click', () => {
                currentPage++;
                renderDirectFileList(allFiles);
            });
            paginationContainer.appendChild(nextButton);
        }
        
        fileListContainer.appendChild(paginationContainer);
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
            // 단순한 구조로 변경
            listItem.innerHTML = `
                <div class="file-card">
                    <div class="file-info">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-details">
                            <div class="file-name">${file.filename || "Unknown File"}</div>
                            <div class="file-meta">
                                <span>${fileSize}</span> · 
                                <span>${fileDate}</span> · 
                                <span>${file.file_type ? file.file_type.toUpperCase() : "?"}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="delete-button-container">
                    <button class="big-delete-btn" title="파일 삭제">
                        파일 삭제
                    </button>
                </div>
            `;
            
            // 삭제 버튼에 이벤트 리스너 추가
            const deleteBtn = listItem.querySelector('.big-delete-btn');
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
    
    /**
     * 문서 내용 보기 기능
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     */
    async function viewDocument(systemFilename, displayFilename) {
        try {
            console.log(`Viewing document: ${systemFilename}`);
            const response = await fetch(`/api/documents/view/${encodeURIComponent(systemFilename)}`);
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                console.error('Error viewing document:', response.statusText);
                throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                // 모달 생성
                const modal = document.createElement('div');
                modal.className = 'document-modal';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // 문서 내용을 표시할 모달 컨텐츠
                const modalContent = document.createElement('div');
                modalContent.className = 'document-modal-content';
                modalContent.style.cssText = `
                    background-color: white;
                    width: 80%;
                    max-width: 800px;
                    max-height: 80vh;
                    border-radius: 8px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                `;
                
                // 모달 헤더
                const modalHeader = document.createElement('div');
                modalHeader.className = 'document-modal-header';
                modalHeader.style.cssText = `
                    padding: 15px 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #0046FF;
                    color: white;
                `;
                
                // 헤더 타이틀
                const headerTitle = document.createElement('h3');
                headerTitle.textContent = `${displayFilename}`;
                headerTitle.style.cssText = `
                    margin: 0;
                    font-size: 18px;
                    font-weight: 500;
                `;
                
                // 닫기 버튼
                const closeButton = document.createElement('button');
                closeButton.textContent = '×';
                closeButton.style.cssText = `
                    background: none;
                    border: none;
                    font-size: 24px;
                    font-weight: bold;
                    cursor: pointer;
                    color: white;
                    padding: 0 5px;
                `;
                closeButton.onclick = () => {
                    document.body.removeChild(modal);
                };
                
                // 모달 바디
                const modalBody = document.createElement('div');
                modalBody.className = 'document-modal-body';
                modalBody.style.cssText = `
                    padding: 20px;
                    overflow-y: auto;
                    flex-grow: 1;
                    line-height: 1.5;
                    background-color: #f9f9f9;
                    border: 1px solid #eee;
                    border-radius: 4px;
                    margin: 15px;
                `;
                
                // HTML 콘텐츠인지 일반 텍스트인지 확인
                if (data.html_content) {
                    // CSV, 엑셀 등 HTML로 포맷된 내용
                    modalBody.innerHTML = data.content;
                } else {
                    // 일반 텍스트 (TXT 파일 등)
                    modalBody.style.fontFamily = 'monospace';
                    modalBody.style.whiteSpace = 'pre-wrap';
                    modalBody.textContent = data.content;
                }
                
                // 모달 푸터
                const modalFooter = document.createElement('div');
                modalFooter.className = 'document-modal-footer';
                modalFooter.style.cssText = `
                    padding: 15px 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                `;
                
                // 편집 버튼 (txt 파일만)
                if (data.file_type === 'txt') {
                    const editButton = document.createElement('button');
                    editButton.textContent = '편집';
                    editButton.style.cssText = `
                        padding: 8px 16px;
                        background-color: #0046FF;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: 500;
                    `;
                    editButton.onclick = () => {
                        document.body.removeChild(modal);
                        editDocument(systemFilename, displayFilename, data.content);
                    };
                    modalFooter.appendChild(editButton);
                }
                
                // 닫기 버튼
                const closeBtn = document.createElement('button');
                closeBtn.textContent = '닫기';
                closeBtn.style.cssText = `
                    padding: 8px 16px;
                    background-color: #f2f2f2;
                    color: #333;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                `;
                closeBtn.onclick = () => {
                    document.body.removeChild(modal);
                };
                modalFooter.appendChild(closeBtn);
                
                // 모달 요소 조립
                modalHeader.appendChild(headerTitle);
                modalHeader.appendChild(closeButton);
                
                modalContent.appendChild(modalHeader);
                modalContent.appendChild(modalBody);
                modalContent.appendChild(modalFooter);
                
                modal.appendChild(modalContent);
                
                // 모달을 body에 추가
                document.body.appendChild(modal);
                
                // ESC 키로 모달 닫기
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        document.body.removeChild(modal);
                        document.removeEventListener('keydown', escHandler);
                    }
                });
            } else {
                alert(data.message || '문서 내용을 불러오는 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('문서 내용 로드 중 오류 발생:', error);
            alert(`문서 내용 조회 중 오류가 발생했습니다: ${error.message}`);
        }
    }
    
    /**
     * 문서 내용 편집 기능
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     * @param {string} content - 초기 문서 내용
     */
    async function editDocument(systemFilename, displayFilename, content) {
        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'document-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // 문서 내용을 편집할 모달 컨텐츠
        const modalContent = document.createElement('div');
        modalContent.className = 'document-modal-content';
        modalContent.style.cssText = `
            background-color: white;
            width: 80%;
            max-width: 800px;
            height: 80vh;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;
        
        // 모달 헤더
        const modalHeader = document.createElement('div');
        modalHeader.className = 'document-modal-header';
        modalHeader.style.cssText = `
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #0046FF;
            color: white;
        `;
        
        // 헤더 타이틀
        const headerTitle = document.createElement('h3');
        headerTitle.textContent = `${displayFilename} 편집`;
        headerTitle.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 500;
        `;
        
        // 닫기 버튼
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            color: white;
            padding: 0 5px;
        `;
        closeButton.onclick = () => {
            if (confirm('편집 내용이 저장되지 않습니다. 정말 닫으시겠습니까?')) {
                document.body.removeChild(modal);
            }
        };
        
        // 모달 바디 (편집기)
        const modalBody = document.createElement('div');
        modalBody.className = 'document-modal-body';
        modalBody.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
        `;
        
        // 텍스트 편집기
        const editor = document.createElement('textarea');
        editor.value = content;
        editor.style.cssText = `
            width: 100%;
            height: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            line-height: 1.5;
            resize: none;
            flex-grow: 1;
            min-height: 350px;
        `;
        
        // 모달 푸터
        const modalFooter = document.createElement('div');
        modalFooter.className = 'document-modal-footer';
        modalFooter.style.cssText = `
            padding: 15px 20px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        `;
        
        // 저장 버튼
        const saveButton = document.createElement('button');
        saveButton.textContent = '저장 및 동기화';
        saveButton.style.cssText = `
            padding: 8px 16px;
            background-color: #0046FF;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        saveButton.onclick = async () => {
            // 저장 중 로딩 표시
            saveButton.disabled = true;
            saveButton.textContent = '저장 중...';
            
            try {
                const response = await fetch(`/api/documents/edit/${systemFilename}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: editor.value
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.status === 'success') {
                    alert(data.message || '문서가 성공적으로 저장되었습니다.');
                    document.body.removeChild(modal);
                    // 파일 목록을 새로고침하여 변경사항 반영
                    loadDocuments();
                } else {
                    alert(data.message || '문서 저장 중 오류가 발생했습니다.');
                    saveButton.disabled = false;
                    saveButton.textContent = '저장 및 동기화';
                }
            } catch (error) {
                console.error('문서 저장 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다.');
                saveButton.disabled = false;
                saveButton.textContent = '저장 및 동기화';
            }
        };
        
        // 취소 버튼
        const cancelButton = document.createElement('button');
        cancelButton.textContent = '취소';
        cancelButton.style.cssText = `
            padding: 8px 16px;
            background-color: #f2f2f2;
            color: #333;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        cancelButton.onclick = () => {
            if (confirm('편집 내용이 저장되지 않습니다. 정말 취소하시겠습니까?')) {
                document.body.removeChild(modal);
            }
        };
        
        // 모달 요소 조립
        modalHeader.appendChild(headerTitle);
        modalHeader.appendChild(closeButton);
        
        modalBody.appendChild(editor);
        
        modalFooter.appendChild(saveButton);
        modalFooter.appendChild(cancelButton);
        
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modalContent.appendChild(modalFooter);
        
        modal.appendChild(modalContent);
        
        // 모달을 body에 추가
        document.body.appendChild(modal);
        
        // 포커스 지정
        editor.focus();
        
        // ESC 키로 모달 닫기
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                if (confirm('편집 내용이 저장되지 않습니다. 정말 닫으시겠습니까?')) {
                    document.body.removeChild(modal);
                    document.removeEventListener('keydown', escHandler);
                }
            }
        });
    }
});