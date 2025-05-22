/**
 * 문서 관리자 - 파일 목록 표시 및 삭제 기능 (버전 2)
 */

document.addEventListener('DOMContentLoaded', function() {
    // 파일 목록 컨테이너
    const fileList = document.getElementById('file-list');
    const emptyState = document.querySelector('.empty-state');
    const documentsList = document.getElementById('documentsList');
    
    console.log("Document manager v2 initialized");
    
    // 문서 업로드 후 이벤트 감지
    document.getElementById('uploadForm')?.addEventListener('submit', function() {
        // 업로드 완료 후 파일 목록 갱신
        setTimeout(loadDocuments, 2000);
    });
    
    // 파일 목록 초기 로드
    const fileListContainer = document.getElementById('file-list-container');
    if (fileListContainer) {
        loadDocuments();
    }
    
    // 전역 변수로 페이지네이션 상태 관리
    let currentPage = 1;
    const filesPerPage = 10; // 페이지당 10개 파일 표시
    let allFiles = [];
    let filteredFiles = [];
    
    // 파일 검색 함수
    function searchFiles(query) {
        console.log("검색어:", query);
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
    
    // JSON 파일 필터링 함수
    function filterJsonFiles(files) {
        return files.filter(file => {
            // .json 확장자를 가진 파일 숨기기
            return file.file_type.toLowerCase() !== 'json';
        });
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
                        
                        // 전체 파일 저장
                        allFiles = data.files;
                        
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
    
    // 파일 크기 포맷팅 함수
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' Bytes';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(2) + ' KB';
        } else if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        } else {
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
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
        
        // 파일 개수 표시
        const totalCount = document.createElement('div');
        totalCount.className = 'file-count';
        totalCount.style.cssText = 'margin-bottom: 10px; font-size: 0.9em; color: #666;';
        totalCount.textContent = `총 ${visibleFiles.length}개 파일, ${startIndex + 1}-${endIndex} 표시 중`;
        fileListContainer.appendChild(totalCount);
        
        // 파일 목록 테이블 생성
        const table = document.createElement('table');
        table.className = 'file-table';
        table.style.cssText = 'width: 100%; border-collapse: collapse; margin-bottom: 15px;';
        
        // 테이블 헤더 생성
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th style="text-align: left; padding: 10px;">파일 이름</th>
                <th style="text-align: center; width: 100px;">크기</th>
                <th style="text-align: center; width: 220px;">작업</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // 테이블 바디 생성
        const tbody = document.createElement('tbody');
        
        // 현재 페이지의 파일들 표시
        currentFiles.forEach(file => {
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom: 1px solid #eee;';
            
            // 파일 크기 포맷팅
            const size = formatFileSize(file.size);
            
            // 파일 행 생성
            row.innerHTML = `
                <td style="padding: 10px; text-align: left;">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px;">${file.filename}</div>
                </td>
                <td style="text-align: center; padding: 10px;">${size}</td>
                <td style="text-align: center; padding: 10px;">
                    <div style="display: flex; justify-content: center; gap: 5px;">
                        <button class="view-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #4caf50; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;">
                            보기
                        </button>
                        <button class="download-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #0064E1; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;">
                            다운로드
                        </button>
                        <button class="delete-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #f44336; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;">
                            삭제
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        fileListContainer.appendChild(table);
        
        // 페이지네이션 렌더링
        renderPagination(visibleFiles.length, fileListContainer);
        
        // 버튼에 이벤트 리스너 추가
        addEventListenersToButtons(fileListContainer);
    }
    
    // 페이지네이션 컨트롤 렌더링 함수
    function renderPagination(totalFiles, container) {
        const totalPages = Math.ceil(totalFiles / filesPerPage);
        
        // 파일이 10개 이하면 페이지네이션 표시하지 않음
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
                renderDirectFileList(filteredFiles.length > 0 ? filteredFiles : allFiles);
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
                renderDirectFileList(filteredFiles.length > 0 ? filteredFiles : allFiles);
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
                renderDirectFileList(filteredFiles.length > 0 ? filteredFiles : allFiles);
            });
            paginationContainer.appendChild(nextButton);
        }
        
        container.appendChild(paginationContainer);
    }
    
    // 버튼에 이벤트 리스너 추가 함수
    function addEventListenersToButtons(container) {
        // 삭제 버튼에 이벤트 리스너 추가
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                deleteFile(systemFilename, displayFilename);
            });
        });
        
        // 보기 버튼에 이벤트 리스너 추가
        container.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                viewDocument(systemFilename, displayFilename);
            });
        });
        
        // 다운로드 버튼에 이벤트 리스너 추가
        container.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                downloadDocument(systemFilename, displayFilename);
            });
        });
    }
    
    /**
     * 파일 삭제 처리
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     */
    async function deleteFile(systemFilename, displayFilename) {
        if (confirm(`"${displayFilename}" 파일을 삭제하시겠습니까?`)) {
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
                    alert(`"${displayFilename}" 파일이 삭제되었습니다.`);
                    loadDocuments(); // 파일 목록 다시 로드
                } else {
                    alert(`삭제 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
                }
            } catch (error) {
                console.error('파일 삭제 API 호출 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
            }
        }
    }
    
    /**
     * 문서 보기 처리
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     */
    function viewDocument(systemFilename, displayFilename) {
        console.log(`Viewing document: ${displayFilename}`);
        // URL 인코딩하여 특수문자 처리
        const encodedFilename = encodeURIComponent(systemFilename);
        
        fetch(`/api/documents/view/${encodedFilename}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 문서 내용 표시 - 모달 또는 새 페이지
                    const modal = document.createElement('div');
                    modal.className = 'document-modal';
                    
                    // CSV 파일인 경우 편집 버튼 추가
                    const isCSV = systemFilename.toLowerCase().endsWith('.csv');
                    
                    modal.innerHTML = `
                        <div class="document-modal-content">
                            <div class="document-modal-header">
                                <h3 class="file-preview-title" data-system-filename="${systemFilename}">${displayFilename}</h3>
                                <button class="close-modal-btn">&times;</button>
                            </div>
                            ${isCSV ? `
                            <div class="document-actions">
                                <div class="csv-editor-controls" style="margin-bottom: 15px;">
                                    <button id="csv-edit-btn" style="background-color: #4caf50; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; margin-right: 10px;">
                                        편집 모드
                                    </button>
                                    <button id="csv-save-btn" style="background-color: #0064E1; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; margin-right: 10px; display: none;">
                                        변경사항 저장
                                    </button>
                                    <button id="csv-cancel-btn" style="background-color: #f44336; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; margin-right: 10px; display: none;">
                                        취소
                                    </button>
                                </div>
                                <div class="csv-row-controls" style="margin-bottom: 15px; display: none;">
                                    <button id="csv-add-row-btn" style="background-color: #4caf50; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; margin-right: 10px;">
                                        <span style="font-size: 14px; margin-right: 5px;">+</span> 맨 아래 행 추가
                                    </button>
                                    <button id="csv-delete-row-btn" style="background-color: #f44336; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: default; opacity: 0.6;">
                                        <span style="font-size: 14px; margin-right: 5px;">-</span> 선택 행 삭제
                                    </button>
                                </div>
                            </div>
                            <div id="csv-table-container">
                                ${data.content}
                            </div>
                            ` : `
                            <div class="document-modal-body">
                                ${data.content}
                            </div>
                            `}
                        </div>
                    `;
                    
                    document.body.appendChild(modal);
                    
                    // 모달 스타일 추가
                    modal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.5);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 1000;
                    `;
                    
                    const modalContent = modal.querySelector('.document-modal-content');
                    modalContent.style.cssText = `
                        background-color: white;
                        padding: 20px;
                        border-radius: 8px;
                        width: 80%;
                        max-width: 1000px;
                        max-height: 80vh;
                        overflow: auto;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                    `;
                    
                    const modalHeader = modal.querySelector('.document-modal-header');
                    modalHeader.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #eee;
                        padding-bottom: 10px;
                        margin-bottom: 15px;
                    `;
                    
                    const closeBtn = modal.querySelector('.close-modal-btn');
                    closeBtn.style.cssText = `
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #333;
                    `;
                    
                    closeBtn.addEventListener('click', () => {
                        modal.remove();
                    });
                    
                    // ESC 키로 모달 닫기
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            modal.remove();
                        }
                    });
                } else {
                    alert(data.message || '문서 내용을 불러오는 중 오류가 발생했습니다.');
                }
            })
            .catch(error => {
                console.error('문서 뷰어 API 호출 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다.');
            });
    }
    
    /**
     * 문서 다운로드 처리
     * @param {string} systemFilename - 시스템 내부 파일명
     * @param {string} displayFilename - 화면에 표시되는 파일명
     */
    function downloadDocument(systemFilename, displayFilename) {
        console.log(`Downloading document: ${displayFilename}`);
        // URL 인코딩하여 특수문자 처리
        const encodedFilename = encodeURIComponent(systemFilename);
        
        // 다운로드 링크 생성 및 클릭
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/documents/download/${encodedFilename}`;
        downloadLink.download = displayFilename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
});