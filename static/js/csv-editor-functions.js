/**
 * CSV 편집기 추가 함수 모듈
 * 이 파일은 csv-editor-enhanced.js를 보완하는 함수들을 포함합니다.
 * 행/열 추가/삭제 기능은 요구사항에 따라 제거되었습니다.
 */

// 컨텍스트 메뉴 숨기기 함수
function hideContextMenus() {
    document.querySelectorAll('.row-context-menu, .column-context-menu, .cell-context-menu').forEach(menu => {
        if (menu.parentElement) {
            menu.parentElement.removeChild(menu);
        }
    });
}

// CSV 변경 사항 저장 함수
function saveCSVChanges() {
    console.log("CSV 변경사항 저장");
    
    let csvTable = document.querySelector('.editable-csv-table');
    if (!csvTable) {
        alert('편집할 테이블을 찾을 수 없습니다.');
        return;
    }

    // 테이블에서 데이터 추출
    const headers = [];
    const rows = [];
    
    // 헤더 추출
    const headerRow = table.querySelector('thead tr');
    headerRow.querySelectorAll('th').forEach(th => {
        if (th.textContent.trim() !== '행 번호') {
            headers.push(th.textContent.trim());
        }
    });
    
    // 데이터 행 추출
    table.querySelectorAll('tbody tr').forEach(tr => {
        const rowData = [];
        tr.querySelectorAll('td').forEach((td, index) => {
            // 첫 번째 열(행 번호)은 건너뛰기
            if (index > 0) {
                rowData.push(td.textContent.trim());
            }
        });
        if (rowData.length > 0) {
            rows.push(rowData);
        }
    });

    // 저장할 데이터 준비
    const saveData = {
        headers: headers,
        data: rows
    };
    
    // 파일명 찾기 시도 (다양한 방법)
    const getSystemFilename = () => {
        // 1. 전역 변수에서 파일명 가져오기
        if (window.currentFilename) {
            console.log("파일명 디코딩:", window.currentFilename);
            return decodeURIComponent(window.currentFilename);
        }
        
        // 2. 데이터 속성에서 파일명 가져오기
        const dataFilename = csvTable.dataset.filename || 
                           document.querySelector('#csv-table-container')?.dataset.filename;
        if (dataFilename) {
            return dataFilename;
        }
        
        // 3. 모달 제목에서 찾기
        const modalTitle = document.querySelector('.document-modal-header h3')?.textContent || 
                          document.querySelector('.file-preview-title')?.textContent;
        
        if (modalTitle) {
            // 파일 목록에서 해당 제목과 일치하는 파일 찾기
            const fileItems = document.querySelectorAll('.file-item[data-type="csv"]');
            for (const item of fileItems) {
                const itemTitle = item.querySelector('.file-name')?.textContent;
                if (itemTitle && modalTitle.includes(itemTitle)) {
                    return item.dataset.systemFilename;
                }
            }
        }
        
        // 4. URL에서 파일명 추출 시도
        const urlParams = new URLSearchParams(window.location.search);
        const fileParam = urlParams.get('file');
        if (fileParam) {
            return decodeURIComponent(fileParam);
        }
        
        // 5. 페이지 경로에서 추출
        const pathSegments = window.location.pathname.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment.endsWith('.csv')) {
            return decodeURIComponent(lastSegment);
        }
        
        return null;
    };
    
    const filename = getSystemFilename();
    
    if (!filename) {
        alert('저장할 파일 이름을 찾을 수 없습니다. 파일 목록에서 다시 선택해주세요.');
        console.error("저장할 파일명을 찾을 수 없음");
        return;
    }
    
    console.log("저장 API URL:", `/api/documents/edit/${filename}`);
    
    // 서버에 저장 요청
    fetch(`/api/documents/edit/${filename}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            alert('CSV 파일이 성공적으로 저장되었습니다.');
            // 편집 모드 종료 또는 새로고침
            if (typeof exitEditMode === 'function') {
                exitEditMode();
            } else {
                window.location.reload();
            }
        } else {
            alert(`저장 실패: ${data.message || '알 수 없는 오류'}`);
        }
    })
    .catch(error => {
        console.error('저장 중 오류 발생:', error);
        alert('저장 중 오류가 발생했습니다: ' + error.message);
    });
}

// 메인 JS 파일에 함수 연결 (외부 파일로 분리했을 때 사용)
if (typeof window !== 'undefined') {
    // 전역 객체에 함수 등록
    window.hideContextMenus = hideContextMenus;
    window.saveCSVChanges = saveCSVChanges;
}