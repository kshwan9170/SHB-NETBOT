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
    
    // 브라우저 캐시 강제 초기화를 위한 코드
    document.querySelector('head').innerHTML += `
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
    `;
    
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
    const filesPerPage = 8; // 페이지당 8개 파일 표시
    let allFiles = [];
    let filteredFiles = [];
    const VERSION = new Date().getTime(); // 캐시 방지용 버전
    
    // 파일 검색 함수
    function searchFiles(query) {
        if (!query || query.trim() === '') {
            filteredFiles = [...allFiles];
            currentPage = 1;
            renderDirectFileList(allFiles);
            return;
        }
        
        query = query.toLowerCase().trim();
        filteredFiles = allFiles.filter(file => {
            return file.filename.toLowerCase().includes(query);
        });
        
        currentPage = 1;
        renderDirectFileList(filteredFiles);
    }
    
    // 메타데이터 파일 완전 필터링 함수
    function filterJsonFiles(files) {
        return files.filter(file => {
            // 🚫 메타데이터 파일 완전 차단!
            const filename = file.filename || '';
            const systemFilename = file.system_filename || '';
            const fileType = file.file_type ? file.file_type.toLowerCase() : '';
            
            // JSON 파일과 메타데이터 파일 모두 차단
            return fileType !== 'json' && 
                   !filename.endsWith('_metadata.json') && 
                   !filename.includes('_metadata') &&
                   !systemFilename.endsWith('_metadata.json') &&
                   !systemFilename.includes('_metadata');
        });
    }
    
    // 새로운 함수: 직접 HTML로 파일 목록 렌더링 (페이지네이션 포함)
    function renderDirectFileList(files) {
        const fileListContainer = document.getElementById('file-list-container');
        if (!fileListContainer) {
            console.error("파일 목록 컨테이너를 찾을 수 없습니다");
            return;
        }
        
        // JSON 파일 필터링
        const visibleFiles = filterJsonFiles(files);
        
        // 전체 파일 목록 저장 (JSON 파일 제외)
        if (files === allFiles) {
            filteredFiles = visibleFiles;
        }
        
        // 파일 목록 컨테이너 초기화
        fileListContainer.innerHTML = '';
        
        // 검색창 추가
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.style.cssText = 'margin-bottom: 15px; width: 100%;';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '파일명 검색...';
        searchInput.className = 'search-input';
        searchInput.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;';
        
        searchInput.addEventListener('input', function() {
            searchFiles(this.value);
        });
        
        searchContainer.appendChild(searchInput);
        fileListContainer.appendChild(searchContainer);
        
        // 현재 페이지에 표시할 파일 계산 (JSON 파일 제외)
        const startIndex = (currentPage - 1) * filesPerPage;
        const endIndex = Math.min(startIndex + filesPerPage, visibleFiles.length);
        const currentFiles = visibleFiles.slice(startIndex, endIndex);
        
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
                        <button class="document-download-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" style="background-color: #0064E1; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            <span>다운로드</span>
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
            
            // 다운로드 버튼에 이벤트 리스너 추가
            const downloadBtn = fileCard.querySelector('.document-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', function() {
                    const systemFilename = this.getAttribute('data-filename');
                    const displayFilename = this.getAttribute('data-displayname');
                    downloadDocument(systemFilename, displayFilename);
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
        renderPagination(visibleFiles.length);
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
     * 파일 삭제 처리
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     * @param {HTMLElement} listItem - 삭제할 파일의 리스트 항목 요소
     */
    async function deleteFile(systemFilename, displayFilename, listItem) {
        if (confirm(`"${displayFilename}" 파일을 삭제하시겠습니까?`)) {
            try {
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
                
                if (data.success) {
                    // 성공적으로 삭제됨
                    alert(`"${displayFilename}" 파일이 삭제되었습니다.`);
                    
                    // UI에서 파일 항목 제거
                    if (listItem && listItem.parentNode) {
                        listItem.parentNode.removeChild(listItem);
                    }
                    
                    // 파일 목록 다시 로드
                    loadDocuments();
                } else {
                    // 서버에서 오류 응답
                    alert(data.error || '파일 삭제 중 오류가 발생했습니다.');
                }
            } catch (error) {
                console.error('파일 삭제 API 호출 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
            }
        }
    }
    
    /**
     * 파일 크기를 읽기 쉬운 형식으로 변환
     * @param {number} bytes - 바이트 단위 파일 크기
     * @returns {string} 포맷팅된 파일 크기
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 문서 내용 보기 기능
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     */
    /**
     * 파일 다운로드 함수
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 표시용 파일명 
     */
    async function downloadDocument(systemFilename, displayFilename) {
        try {
            // 다운로드 시작 알림
            const toastMsg = document.createElement('div');
            toastMsg.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #0064E1;
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            `;
            toastMsg.textContent = `"${displayFilename}" 다운로드 중...`;
            document.body.appendChild(toastMsg);
            
            // 파일명에 특수문자가 포함된 경우 인코딩
            const encodedFilename = encodeURIComponent(systemFilename);
            
            // 파일 다운로드 링크 생성 및 클릭
            const downloadLink = document.createElement('a');
            downloadLink.href = `/api/documents/download/${encodedFilename}`;
            downloadLink.download = displayFilename; // 다운로드될 때 표시될 파일명
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // 잠시 후 토스트 메시지 제거
            setTimeout(() => {
                toastMsg.textContent = `"${displayFilename}" 다운로드 완료!`;
                toastMsg.style.backgroundColor = '#4caf50';
                
                setTimeout(() => {
                    document.body.removeChild(toastMsg);
                }, 2000);
            }, 1500);
            
        } catch (error) {
            console.error('파일 다운로드 중 오류 발생:', error);
            alert('파일 다운로드 중 오류가 발생했습니다.');
        }
    }
    
    async function viewDocument(systemFilename, displayFilename) {
        // 로딩 표시기 생성
        const loadingIndicator = document.createElement('div');
        loadingIndicator.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
        `;
        loadingIndicator.innerHTML = `
            <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0046FF; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="margin-top: 15px;">문서 로딩 중...</div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        try {
            console.log(`Viewing document: ${systemFilename}`);
            
            // 로딩 표시기 추가
            document.body.appendChild(loadingIndicator);
            
            // 파일명에 특수문자가 포함된 경우 제대로 인코딩
            const encodedFilename = encodeURIComponent(systemFilename);
            console.log(`Encoded filename: ${encodedFilename}`);
            
            // 파일 내용 가져오기
            const response = await fetch(`/api/documents/view/${encodedFilename}`);
            
            // 로딩 표시기 제거
            document.body.removeChild(loadingIndicator);
            
            if (!response.ok) {
                throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}`);
            }
            
            // 응답 데이터 처리
            const responseText = await response.text();
            console.log('응답 데이터 길이:', responseText.length);
            console.log('응답 데이터 미리보기:', responseText.substring(0, 200));
            
            let data;
            
            try {
                data = JSON.parse(responseText);
                console.log('파싱된 데이터 상태:', data.status);
                console.log('HTML 콘텐츠 여부:', data.html_content);
                console.log('콘텐츠 길이:', data.content ? data.content.length : 0);
                
                if (data.status !== 'success') {
                    throw new Error(data.message || '문서 내용을 불러오는 중 오류가 발생했습니다');
                }
                
                // 콘텐츠 유효성 검사
                if (data.content === undefined || data.content === null) {
                    throw new Error('문서 내용이 비어 있습니다');
                }
            } catch (parseError) {
                console.error('JSON 파싱 오류:', parseError);
                throw new Error('응답 데이터를 처리할 수 없습니다: ' + parseError.message);
            }
            
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
            try {
                console.log('콘텐츠 타입:', data.html_content ? 'HTML' : '텍스트');
                console.log('파일 유형:', data.file_type || '알 수 없음');
                console.log('콘텐츠 길이:', data.content ? data.content.length : 0);
                
                // 안전하게 콘텐츠 처리
                const content = data.content || '';
                
                if (data.file_type === 'csv' || data.file_type === 'json') {
                    // CSV 또는 JSON 파일 콘텐츠 표시 (HTML 형식으로 반환됨)
                    console.log('CSV/JSON 파일 표시');
                    modalBody.innerHTML = content;
                } else if (data.html_content) {
                    // HTML로 포맷된 내용
                    modalBody.innerHTML = content;
                } else {
                    // 일반 텍스트 (TXT 파일 등)
                    modalBody.style.fontFamily = 'monospace';
                    modalBody.style.whiteSpace = 'pre-wrap';
                    modalBody.textContent = content;
                }
            } catch(err) {
                console.error('문서 내용 표시 중 오류 발생:', err);
                modalBody.innerHTML = `<div style="color: red; padding: 20px;">
                    <h3>문서 표시 중 오류가 발생했습니다</h3>
                    <p>죄송합니다. 문서를 표시하는 중 오류가 발생했습니다.</p>
                    <p>오류 내용: ${err.message || '알 수 없는 오류'}</p>
                </div>`;
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
            const closeModalBtn = document.createElement('button');
            closeModalBtn.textContent = '닫기';
            closeModalBtn.style.cssText = `
                padding: 8px 16px;
                background-color: #e0e0e0;
                color: #333;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            `;
            closeModalBtn.onclick = () => {
                document.body.removeChild(modal);
            };
            modalFooter.appendChild(closeModalBtn);
            
            // 모달 조립
            modalHeader.appendChild(headerTitle);
            modalHeader.appendChild(closeButton);
            
            modalContent.appendChild(modalHeader);
            modalContent.appendChild(modalBody);
            modalContent.appendChild(modalFooter);
            
            modal.appendChild(modalContent);
            
            // 모달 표시
            document.body.appendChild(modal);
            
            // 모달 애니메이션
            setTimeout(() => {
                modal.style.opacity = '1';
            }, 10);
        } catch (error) {
            // 로딩 표시기가 아직 존재하면 제거
            try {
                document.body.removeChild(loadingIndicator);
            } catch (e) {
                // 이미 제거된 경우 무시
            }
            
            console.error('문서 내용 로드 중 오류 발생:', error);
            
            // 사용자에게 오류 메시지 표시
            let errorMessage = '문서 내용을 불러오는 중 오류가 발생했습니다.';
            
            if (error.message) {
                if (error.message.includes('서버 응답 오류')) {
                    errorMessage = `${error.message}. 페이지를 새로고침하거나 나중에 다시 시도하세요.`;
                } else {
                    errorMessage = `오류 내용: ${error.message}`;
                }
            }
            
            alert(errorMessage);
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
            document.body.removeChild(modal);
        };
        
        // 텍스트 에디터
        const textareaContainer = document.createElement('div');
        textareaContainer.style.cssText = `
            padding: 20px;
            flex-grow: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.cssText = `
            width: 100%;
            height: 100%;
            padding: 10px;
            font-family: monospace;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: none;
            flex-grow: 1;
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
        saveButton.textContent = '저장';
        saveButton.style.cssText = `
            padding: 8px 16px;
            background-color: #4caf50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        saveButton.onclick = async () => {
            try {
                const response = await fetch(`/api/documents/edit/${systemFilename}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: textarea.value
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    alert('문서가 성공적으로 저장되었습니다.');
                    document.body.removeChild(modal);
                    
                    // 필요하다면 파일 목록 새로고침
                    // loadDocuments();
                } else {
                    alert(data.message || '문서 저장 중 오류가 발생했습니다.');
                }
            } catch (error) {
                console.error('문서 저장 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
            }
        };
        
        // 취소 버튼
        const cancelButton = document.createElement('button');
        cancelButton.textContent = '취소';
        cancelButton.style.cssText = `
            padding: 8px 16px;
            background-color: #e0e0e0;
            color: #333;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        cancelButton.onclick = () => {
            document.body.removeChild(modal);
        };
        
        // 모달 조립
        modalHeader.appendChild(headerTitle);
        modalHeader.appendChild(closeButton);
        
        textareaContainer.appendChild(textarea);
        
        modalFooter.appendChild(saveButton);
        modalFooter.appendChild(cancelButton);
        
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(textareaContainer);
        modalContent.appendChild(modalFooter);
        
        modal.appendChild(modalContent);
        
        // 모달 표시
        document.body.appendChild(modal);
        
        // 포커스 설정
        textarea.focus();
    }
});