/**
 * 향상된 파일 관리자 - 페이지네이션과 검색 기능 통합
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("향상된 파일 관리자 초기화");
    
    // 전역 변수
    let allFiles = [];
    let filteredFiles = [];
    let currentPage = 1;
    const filesPerPage = 10;
    
    // 검색 기능 이벤트 리스너
    const searchInput = document.getElementById('file-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterFiles(this.value);
        });
    }
    
    // 동기화 버튼 이벤트 리스너
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncDocuments);
    }
    
    // 초기 파일 목록 로드
    fetchFileList();
    
    /**
     * 서버에서 파일 목록을 가져옴
     */
    function fetchFileList() {
        fetch('/api/documents')
            .then(response => response.json())
            .then(data => {
                if (data.files && Array.isArray(data.files)) {
                    // JSON 파일 필터링
                    allFiles = data.files.filter(file => !file.filename.toLowerCase().endsWith('.json'));
                    filteredFiles = [...allFiles];
                    
                    renderFileList(filteredFiles);
                    console.log(`총 ${allFiles.length}개 파일 로드됨`);
                } else {
                    // 파일 목록이 없을 경우
                    showEmptyState();
                }
            })
            .catch(error => {
                console.error('파일 목록 조회 중 오류 발생:', error);
                alert('파일 목록을 불러오는 중 오류가 발생했습니다.');
            });
    }
    
    /**
     * 파일 검색 필터링
     */
    function filterFiles(query) {
        if (!query || query.trim() === '') {
            // 검색어가 없으면 전체 목록 표시
            filteredFiles = [...allFiles];
        } else {
            // 검색어로 필터링
            query = query.toLowerCase().trim();
            filteredFiles = allFiles.filter(file => 
                file.filename.toLowerCase().includes(query)
            );
        }
        
        // 필터링 후 항상 1페이지부터 표시
        currentPage = 1;
        renderFileList(filteredFiles);
    }
    
    /**
     * 파일 목록 화면에 표시
     */
    function renderFileList(files) {
        const tableBody = document.getElementById('dynamic-file-list');
        if (!tableBody) return;
        
        tableBody.innerHTML = ''; // 기존 내용 초기화
        
        if (files.length === 0) {
            showEmptyState();
            return;
        }
        
        // 페이지네이션 계산
        const totalPages = Math.ceil(files.length / filesPerPage);
        const startIndex = (currentPage - 1) * filesPerPage;
        const endIndex = Math.min(startIndex + filesPerPage, files.length);
        const currentPageFiles = files.slice(startIndex, endIndex);
        
        // 파일 테이블 표시
        document.getElementById('file-table').style.display = 'table';
        document.getElementById('empty-state').style.display = 'none';
        
        // 파일 개수 정보 표시
        updateFileCountInfo(startIndex + 1, endIndex, files.length);
        
        // 파일 목록 표시
        currentPageFiles.forEach(file => {
            const row = document.createElement('tr');
            
            // 파일 크기 포맷팅
            const size = formatFileSize(file.size);
            
            row.innerHTML = `
                <td>
                    <div style="text-align: left; padding-left: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; display: block;">${file.filename}</div>
                </td>
                <td style="text-align: center;">${size}</td>
                <td>
                    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: nowrap;">
                        <button class="view-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #4caf50; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-weight: 600; min-width: 70px; white-space: nowrap;">
                            보기
                        </button>
                        <button class="download-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #0064E1; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-weight: 600; min-width: 70px; white-space: nowrap;">
                            다운로드
                        </button>
                        <button class="delete-btn" data-filename="${file.system_filename}" data-displayname="${file.filename}" 
                            style="background-color: #f44336; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-weight: 600; min-width: 70px; white-space: nowrap;">
                            삭제
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // 버튼에 이벤트 리스너 추가
        addButtonEventListeners();
        
        // 페이지네이션 렌더링
        renderPagination(files.length);
    }
    
    /**
     * 파일 개수 정보 표시 업데이트
     */
    function updateFileCountInfo(start, end, total) {
        // 기존 정보가 있으면 제거
        const existingInfo = document.querySelector('.file-count-info');
        if (existingInfo) existingInfo.remove();
        
        // 새 정보 생성
        const fileCountInfo = document.createElement('div');
        fileCountInfo.className = 'file-count-info';
        fileCountInfo.style.cssText = 'font-size: 0.9em; color: #666; margin-bottom: 10px;';
        fileCountInfo.textContent = `총 ${total}개 파일 중 ${start}-${end}번 표시 중`;
        
        // 테이블 위에 삽입
        const fileTable = document.getElementById('file-table');
        if (fileTable) {
            fileTable.parentNode.insertBefore(fileCountInfo, fileTable);
        }
    }
    
    /**
     * 페이지네이션 렌더링
     */
    function renderPagination(totalFiles) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer) return;
        
        // 컨테이너 초기화
        paginationContainer.innerHTML = '';
        
        // 총 페이지 수 계산
        const totalPages = Math.ceil(totalFiles / filesPerPage);
        
        // 페이지가 1개 이하면 페이지네이션 표시하지 않음
        if (totalPages <= 1) return;
        
        // 이전 페이지 버튼
        if (currentPage > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.innerHTML = '&laquo; 이전';
            prevBtn.className = 'pagination-btn';
            prevBtn.style.cssText = 'padding: 5px 10px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            prevBtn.addEventListener('click', () => {
                currentPage--;
                renderFileList(filteredFiles);
            });
            paginationContainer.appendChild(prevBtn);
        }
        
        // 페이지 번호 버튼
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.innerText = i;
            pageBtn.className = 'pagination-btn';
            
            if (i === currentPage) {
                pageBtn.style.cssText = 'padding: 5px 10px; background-color: #0064E1; color: white; font-weight: bold; border: 1px solid #0064E1; border-radius: 4px; cursor: pointer;';
            } else {
                pageBtn.style.cssText = 'padding: 5px 10px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            }
            
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderFileList(filteredFiles);
            });
            
            paginationContainer.appendChild(pageBtn);
        }
        
        // 다음 페이지 버튼
        if (currentPage < totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.innerHTML = '다음 &raquo;';
            nextBtn.className = 'pagination-btn';
            nextBtn.style.cssText = 'padding: 5px 10px; background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
            nextBtn.addEventListener('click', () => {
                currentPage++;
                renderFileList(filteredFiles);
            });
            paginationContainer.appendChild(nextBtn);
        }
    }
    
    /**
     * 버튼에 이벤트 리스너 추가
     */
    function addButtonEventListeners() {
        // 삭제 버튼
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                deleteFile(systemFilename, displayFilename);
            });
        });
        
        // 보기 버튼
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                viewDocument(systemFilename, displayFilename);
            });
        });
        
        // 다운로드 버튼
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const systemFilename = this.getAttribute('data-filename');
                const displayFilename = this.getAttribute('data-displayname');
                downloadDocument(systemFilename, displayFilename);
            });
        });
    }
    
    /**
     * 파일 삭제 처리
     */
    function deleteFile(systemFilename, displayFilename) {
        if (confirm(`정말 "${displayFilename}" 파일을 삭제하시겠습니까?`)) {
            fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_filename: systemFilename
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`"${displayFilename}" 파일이 삭제되었습니다.`);
                    fetchFileList(); // 파일 목록 다시 로드
                } else {
                    alert(`삭제 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
                }
            })
            .catch(error => {
                console.error('API 호출 중 오류 발생:', error);
                alert('서버 연결 중 오류가 발생했습니다. 다시 시도해주세요.');
            });
        }
    }
    
    /**
     * 문서 보기 처리
     */
    function viewDocument(systemFilename, displayFilename) {
        console.log(`Viewing document: ${displayFilename}`);
        const encodedFilename = encodeURIComponent(systemFilename);
        
        fetch(`/api/documents/view/${encodedFilename}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 모달 생성
                    const modal = document.createElement('div');
                    modal.className = 'document-modal';
                    modal.innerHTML = `
                        <div class="document-modal-content">
                            <div class="document-modal-header">
                                <h3>${displayFilename}</h3>
                                <button class="close-modal-btn">&times;</button>
                            </div>
                            <div class="document-modal-body">
                                ${data.content}
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(modal);
                    
                    // 모달 스타일링
                    applyModalStyles(modal);
                    
                    // 닫기 버튼
                    const closeBtn = modal.querySelector('.close-modal-btn');
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
     * 모달 스타일 적용
     */
    function applyModalStyles(modal) {
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
    }
    
    /**
     * 문서 다운로드 처리
     */
    function downloadDocument(systemFilename, displayFilename) {
        console.log(`Downloading document: ${displayFilename}`);
        const encodedFilename = encodeURIComponent(systemFilename);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/documents/download/${encodedFilename}`;
        downloadLink.download = displayFilename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
    
    /**
     * 문서 동기화 (벡터 DB와 파일 시스템)
     */
    function syncDocuments() {
        if (confirm('문서 동기화를 시작하시겠습니까? 파일 크기에 따라 시간이 걸릴 수 있습니다.')) {
            // 동기화 상태 표시 요소 설정
            const syncStatus = document.getElementById('sync-status');
            const syncProgress = document.getElementById('sync-progress');
            const syncMessage = document.getElementById('sync-message');
            
            syncStatus.style.display = 'block';
            syncProgress.style.width = '0%';
            syncMessage.textContent = '동기화 준비 중...';
            
            // 동기화 버튼 비활성화
            const syncBtn = document.getElementById('sync-btn');
            syncBtn.disabled = true;
            syncBtn.style.opacity = '0.7';
            
            // 서버에 동기화 요청
            fetch('/api/sync', {
                method: 'POST'
            })
            .then(response => {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                
                function readStream() {
                    return reader.read().then(({ done, value }) => {
                        if (done) {
                            syncStatus.style.display = 'none';
                            syncBtn.disabled = false;
                            syncBtn.style.opacity = '1';
                            
                            // 동기화 완료 후 파일 목록 다시 로드
                            fetchFileList();
                            return;
                        }
                        
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');
                        
                        lines.forEach(line => {
                            if (line.trim() === '') return;
                            
                            try {
                                const data = JSON.parse(line);
                                if (data.progress !== undefined) {
                                    syncProgress.style.width = `${data.progress}%`;
                                }
                                if (data.message) {
                                    syncMessage.textContent = data.message;
                                }
                            } catch (e) {
                                console.error('Invalid JSON in sync stream:', line);
                            }
                        });
                        
                        return readStream();
                    });
                }
                
                return readStream();
            })
            .catch(error => {
                console.error('동기화 중 오류 발생:', error);
                syncStatus.style.display = 'none';
                syncBtn.disabled = false;
                syncBtn.style.opacity = '1';
                
                alert('동기화 중 오류가 발생했습니다. 다시 시도해주세요.');
            });
        }
    }
    
    /**
     * 유틸리티 함수: 파일 크기 포맷팅
     */
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
    
    /**
     * 유틸리티 함수: 빈 파일 목록 상태 표시
     */
    function showEmptyState() {
        document.getElementById('file-table').style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
        
        // 페이지네이션 비우기
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) paginationContainer.innerHTML = '';
    }
});