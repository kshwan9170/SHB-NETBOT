/**
 * CSV 파일 편집 기능을 제공하는 JavaScript 모듈 (엑셀 스타일 개선 버전)
 * 행/열 추가/삭제 기능 제거됨
 */

// 전역 변수
let originalCsvData = null;
let currentFilename = null;
let selectedRow = null;
let selectedColumn = null;
    
// 윈도우 로드 시 이벤트 핸들러 등록
document.addEventListener('DOMContentLoaded', function() {
    // 편집 버튼
    const editBtn = document.getElementById('csv-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', enableCsvEditing);
    }
    
    // 저장 버튼
    const saveBtn = document.getElementById('csv-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            if (typeof saveCSVChanges === 'function') {
                saveCSVChanges();
            } else if (typeof window.saveCSVChanges === 'function') {
                window.saveCSVChanges();
            } else {
                console.error('saveCSVChanges 함수를 찾을 수 없습니다.');
                alert('저장 기능을 불러올 수 없습니다. 페이지를 새로고침하고 다시 시도해주세요.');
            }
        });
    }
    
    // 취소 버튼
    const cancelBtn = document.getElementById('csv-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelCsvEditing);
    }
    
    // 행 헤더 클릭 이벤트 - 행 선택
    const rowHeaders = document.querySelectorAll('.row-header');
    rowHeaders.forEach((header, index) => {
        header.addEventListener('click', function() {
            selectRow(index + 1);
        });
    });
    
    // 열 헤더 클릭 이벤트 - 열 선택
    const columnLabels = document.querySelectorAll('.column-label');
    columnLabels.forEach((label, index) => {
        label.addEventListener('click', function() {
            selectColumn(index - 1); // 첫 번째 열은 행 인덱스이므로 -1 조정
        });
    });
});

// CSV 편집 모드 활성화
function enableCsvEditing() {
    console.log("CSV 편집 모드 활성화");
    // 현재 테이블 상태 저장
    originalCsvData = document.getElementById('csv-table-container').innerHTML;
    
    // 데이터 속성에 현재 문서 정보 저장 (파일명 찾기 위한 추가 조치)
    const container = document.getElementById('csv-table-container');
    const csvTable = document.querySelector('.editable-csv-table');
    
    // URL에서 파일명 추출
    const urlParts = window.location.pathname.split('/');
    const queryParams = new URLSearchParams(window.location.search);
    
    // 1. URL 경로에서 추출 시도
    const filenamePart = urlParts[urlParts.length - 1];
    if (filenamePart && filenamePart.endsWith('.csv')) {
        if (container) container.dataset.filename = decodeURIComponent(filenamePart);
        if (csvTable) csvTable.dataset.filename = decodeURIComponent(filenamePart);
    }
    // 2. URL 쿼리 파라미터에서 추출 시도
    else if (queryParams.has('file')) {
        const fileParam = queryParams.get('file');
        if (container) container.dataset.filename = decodeURIComponent(fileParam);
        if (csvTable) csvTable.dataset.filename = decodeURIComponent(fileParam);
    }
    // 3. 페이지 제목에서 추출 시도
    else {
        const title = document.querySelector('.file-preview-title')?.textContent || 
                     document.querySelector('.document-modal-header h3')?.textContent;
        if (title && title.includes('.csv')) {
            if (container) container.dataset.filename = title;
            if (csvTable) csvTable.dataset.filename = title;
        }
    }
    
    // 현재 파일명 가져오기 (HTML 컨텍스트에서 파일 정보 찾기)
    // 1. 제목 태그에서 찾기
    const viewingFile = document.querySelector('.file-preview-title');
    
    // 2. URL 파라미터에서 파일명 찾기
    const getFileNameFromUrl = () => {
        // URL에서 파일명 추출 (마지막 / 이후)
        const urlParts = window.location.href.split('/');
        const lastPart = decodeURIComponent(urlParts[urlParts.length - 1]);
        
        // 파일명이 존재하고 .csv로 끝나는지 확인
        if (lastPart && lastPart.toLowerCase().endsWith('.csv')) {
            return lastPart;
        }
        return null;
    };
    
    // 3. 테이블 요소에서 찾기 (시스템 파일명이 데이터 속성으로 저장된 경우)
    const getFileNameFromTable = () => {
        // 1. CSV 테이블에서 직접 데이터 속성 확인
        const csvTable = document.querySelector('.editable-csv-table');
        if (csvTable && csvTable.dataset.filename) {
            return csvTable.dataset.filename;
        }
        
        // 2. CSV 컨테이너에서 데이터 속성 확인
        const csvContainer = document.querySelector('#csv-table-container');
        if (csvContainer && csvContainer.dataset.filename) {
            return csvContainer.dataset.filename;
        }
        
        // 3. 현재 페이지의 iframe에서 데이터 속성 확인
        const iframe = document.querySelector('.document-preview-iframe');
        if (iframe && iframe.dataset.filename) {
            return iframe.dataset.filename;
        }
        
        return null;
    };
    
    // 모든 방법으로 시도
    if (viewingFile && viewingFile.getAttribute('data-system-filename')) {
        // 데이터 속성에서 시스템 파일명 가져오기
        currentFilename = viewingFile.getAttribute('data-system-filename');
        console.log("파일 제목 태그에서 찾은 파일명:", currentFilename);
    } else if (getFileNameFromTable()) {
        currentFilename = getFileNameFromTable();
        console.log("CSV 테이블에서 찾은 파일명:", currentFilename);
    } else if (getFileNameFromUrl()) {
        currentFilename = getFileNameFromUrl();
        console.log("URL에서 찾은 파일명:", currentFilename);
    } else if (viewingFile && viewingFile.textContent) {
        // 표시된 제목에서 파일명 추출
        const modalTitle = document.querySelector('.document-modal-header h3');
        if (modalTitle && modalTitle.textContent) {
            currentFilename = modalTitle.textContent.trim();
            console.log("모달 제목에서 찾은 파일명:", currentFilename);
        } else {
            // 실패 처리
            console.error("파일명을 찾을 수 없음: 제목에서 추출 실패");
            alert('편집할 CSV 파일을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.');
            return;
        }
    } else {
        // 현재 표시된 테이블이 있는지 확인
        const csvTable = document.querySelector('.editable-csv-table');
        if (csvTable) {
            // DOM에서 파일명 추출 마지막 시도 - 테이블 셀 내용 또는 페이지 타이틀에서 힌트 찾기
            const displayTitle = document.querySelector('.document-modal-header h3')?.textContent || 
                                document.querySelector('.file-preview-title')?.textContent || '';
            
            // 파일 목록에서 일치하는 제목 찾기
            const fileItems = document.querySelectorAll('.file-item[data-type="csv"]');
            let matchedFilename = null;
            
            fileItems.forEach(item => {
                const itemTitle = item.querySelector('.file-name')?.textContent || '';
                if (itemTitle && displayTitle.includes(itemTitle)) {
                    matchedFilename = item.dataset.systemFilename;
                }
            });
            
            if (matchedFilename) {
                currentFilename = matchedFilename;
                console.log("파일 목록에서 매칭된 파일명:", currentFilename);
            } else {
                // 마지막 대안: URL에서 파일명 추출 시도
                const pathSegments = window.location.pathname.split('/');
                const lastSegment = pathSegments[pathSegments.length - 1];
                
                if (lastSegment && lastSegment.endsWith('.csv')) {
                    currentFilename = decodeURIComponent(lastSegment);
                    console.log("URL 경로에서 파일명 추출:", currentFilename);
                } else {
                    // 파일 목록에서 첫 번째 CSV 파일 찾기
                    const firstCsvFile = document.querySelector('.file-item[data-type="csv"]');
                    if (firstCsvFile && firstCsvFile.dataset.systemFilename) {
                        currentFilename = firstCsvFile.dataset.systemFilename;
                        console.log("첫 번째 CSV 파일 사용:", currentFilename);
                    } else {
                        console.error("파일명을 찾을 수 없음: 모든 방법 실패");
                        alert('편집할 CSV 파일을 찾을 수 없습니다. 파일 목록에서 CSV 파일을 선택해주세요.');
                        return;
                    }
                }
            }
        } else {
            console.error("파일명을 찾을 수 없음: 테이블 요소 없음");
            alert('편집할 CSV 파일을 찾을 수 없습니다. 파일 목록에서 CSV 파일을 선택해주세요.');
            return;
        }
    }
    console.log("현재 편집 중인 파일명:", currentFilename);
    
    // 테이블 셀을 편집 가능하게 변경
    const tableEl = document.querySelector('.editable-csv-table');
    if (tableEl) {
        // 모든 테이블 셀에 대해 클릭 이벤트 추가
        const cells = tableEl.querySelectorAll('td:not(:first-child)'); // 첫 번째 열(인덱스)은 제외
        cells.forEach(cell => {
            cell.contentEditable = 'true';
            cell.classList.add('editable-cell');
            
            // 컨텍스트 메뉴 이벤트 추가
            cell.addEventListener('contextmenu', function(event) {
                const rowElement = this.parentElement;
                const rowIndex = Array.from(rowElement.parentElement.children).indexOf(rowElement);
                const columnIndex = Array.from(rowElement.children).indexOf(this);
                
                showCellContextMenu(event, rowIndex, columnIndex);
            });
        });
        
        // 전체 테이블에 키보드 이벤트 추가 (셀 간 이동)
        tableEl.addEventListener('keydown', function(event) {
            if (event.target.tagName === 'TD') {
                handleTableKeyboardNavigation(event);
            }
        });
    }
    
    // 버튼 상태 변경
    document.getElementById('csv-edit-btn').style.display = 'none';
    document.getElementById('csv-save-btn').style.display = 'inline-block';
    document.getElementById('csv-cancel-btn').style.display = 'inline-block';
}

// CSV 편집 취소
function cancelCsvEditing() {
    console.log("CSV 편집 취소");
    // 원래 테이블로 복원
    document.getElementById('csv-table-container').innerHTML = originalCsvData;
    
    // 버튼 상태 변경
    document.getElementById('csv-edit-btn').style.display = 'inline-block';
    document.getElementById('csv-save-btn').style.display = 'none';
    document.getElementById('csv-cancel-btn').style.display = 'none';
    
    // 선택 상태 초기화
    selectedRow = null;
    selectedColumn = null;
}

// 선택 영역 해제
function clearSelection() {
    // 선택된 행 해제
    if (selectedRow !== null) {
        const selectedRowElement = document.querySelector('.selected-row');
        if (selectedRowElement) {
            selectedRowElement.classList.remove('selected-row');
        }
        selectedRow = null;
    }
    
    // 선택된 열 해제
    if (selectedColumn !== null) {
        const selectedColumnElements = document.querySelectorAll('.selected-column');
        selectedColumnElements.forEach(element => {
            element.classList.remove('selected-column');
        });
        selectedColumn = null;
    }
}

// 행 선택 함수
function selectRow(rowIndex) {
    // 기존 선택 해제
    clearSelection();
    
    // 새 행 선택
    selectedRow = rowIndex;
    
    // 행 스타일 변경
    const tableEl = document.querySelector('.editable-csv-table');
    if (tableEl) {
        const rows = tableEl.querySelectorAll('tbody tr');
        if (rowIndex > 0 && rowIndex <= rows.length) {
            rows[rowIndex - 1].classList.add('selected-row');
        }
    }
}

// 열 선택 함수
function selectColumn(columnIndex) {
    // 기존 선택 해제
    clearSelection();
    
    // 새 열 선택
    selectedColumn = columnIndex;
    
    // 열 스타일 변경
    const tableEl = document.querySelector('.editable-csv-table');
    if (tableEl) {
        // 열 헤더 선택
        const headers = tableEl.querySelectorAll('thead th');
        if (columnIndex >= 0 && columnIndex < headers.length - 1) { // -1은 행 번호 열을 고려
            headers[columnIndex + 1].classList.add('selected-column');
        }
        
        // 모든 행의 해당 열 셀 선택
        const rows = tableEl.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (columnIndex >= 0 && columnIndex < cells.length - 1) { // -1은 행 번호 셀을 고려
                cells[columnIndex + 1].classList.add('selected-column');
            }
        });
    }
}

// 셀 컨텍스트 메뉴 표시 함수
function showCellContextMenu(event, rowIndex, columnIndex) {
    event.preventDefault();
    
    // 기존 컨텍스트 메뉴 제거
    hideContextMenus();
    
    // 새 컨텍스트 메뉴 생성
    const contextMenu = document.createElement('div');
    contextMenu.className = 'cell-context-menu';
    contextMenu.style.cssText = `
        position: absolute;
        top: ${event.clientY}px;
        left: ${event.clientX}px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 5px;
        box-shadow: 2px 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        padding: 5px;
    `;
    
    // 복사 메뉴 추가
    const copyItem = document.createElement('div');
    copyItem.className = 'context-menu-item';
    copyItem.innerText = '복사';
    copyItem.style.cssText = `
        padding: 5px 10px;
        cursor: pointer;
        background-color: #2196F3;
        color: white;
        border-radius: 3px;
        margin: 2px 0;
        text-align: center;
    `;
    copyItem.addEventListener('click', () => {
        const cell = document.querySelector(`.editable-csv-table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`);
        if (cell) {
            navigator.clipboard.writeText(cell.textContent).then(() => {
                alert('셀 내용이 클립보드에 복사되었습니다.');
                hideContextMenus();
            }).catch(err => {
                console.error('복사 실패:', err);
                alert('복사에 실패했습니다. 다시 시도해주세요.');
            });
        }
    });
    
    // 잘라내기 메뉴 추가
    const cutItem = document.createElement('div');
    cutItem.className = 'context-menu-item';
    cutItem.innerText = '잘라내기';
    cutItem.style.cssText = `
        padding: 5px 10px;
        cursor: pointer;
        background-color: #FF9800;
        color: white;
        border-radius: 3px;
        margin: 2px 0;
        text-align: center;
    `;
    cutItem.addEventListener('click', () => {
        const cell = document.querySelector(`.editable-csv-table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`);
        if (cell) {
            navigator.clipboard.writeText(cell.textContent).then(() => {
                cell.textContent = '';
                alert('셀 내용이 클립보드에 복사되고 삭제되었습니다.');
                hideContextMenus();
            }).catch(err => {
                console.error('잘라내기 실패:', err);
                alert('잘라내기에 실패했습니다. 다시 시도해주세요.');
            });
        }
    });
    
    // 붙여넣기 메뉴 추가
    const pasteItem = document.createElement('div');
    pasteItem.className = 'context-menu-item';
    pasteItem.innerText = '붙여넣기';
    pasteItem.style.cssText = `
        padding: 5px 10px;
        cursor: pointer;
        background-color: #4CAF50;
        color: white;
        border-radius: 3px;
        margin: 2px 0;
        text-align: center;
    `;
    pasteItem.addEventListener('click', () => {
        navigator.clipboard.readText().then(text => {
            const cell = document.querySelector(`.editable-csv-table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`);
            if (cell) {
                cell.textContent = text;
                hideContextMenus();
            }
        }).catch(err => {
            console.error('붙여넣기 실패:', err);
            alert('붙여넣기에 실패했습니다. 다시 시도해주세요.');
        });
    });
    
    // 삭제 메뉴 추가
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.innerText = '삭제';
    deleteItem.style.cssText = `
        padding: 5px 10px;
        cursor: pointer;
        background-color: #F44336;
        color: white;
        border-radius: 3px;
        margin: 2px 0;
        text-align: center;
    `;
    deleteItem.addEventListener('click', () => {
        const cell = document.querySelector(`.editable-csv-table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`);
        if (cell) {
            cell.textContent = '';
            hideContextMenus();
        }
    });
    
    // 메뉴 아이템 추가
    contextMenu.appendChild(copyItem);
    contextMenu.appendChild(cutItem);
    contextMenu.appendChild(pasteItem);
    contextMenu.appendChild(deleteItem);
    
    // 문서에 컨텍스트 메뉴 추가
    document.body.appendChild(contextMenu);
    
    // 다른 곳 클릭시 컨텍스트 메뉴 숨기기
    setTimeout(() => {
        window.addEventListener('click', hideContextMenus, { once: true });
    }, 0);
}

// 키보드 화살표로 셀 간 이동 처리
function handleTableKeyboardNavigation(event) {
    const cell = event.target;
    const row = cell.parentElement;
    const table = cell.closest('table');
    
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    const rowIndex = Array.from(rows).indexOf(row);
    const cells = row.querySelectorAll('td');
    const cellIndex = Array.from(cells).indexOf(cell);
    
    let nextCell;
    
    // 방향키 처리
    switch (event.key) {
        case 'ArrowUp':
            if (rowIndex > 0) {
                nextCell = rows[rowIndex - 1].querySelectorAll('td')[cellIndex];
            }
            break;
        case 'ArrowDown':
            if (rowIndex < rows.length - 1) {
                nextCell = rows[rowIndex + 1].querySelectorAll('td')[cellIndex];
            }
            break;
        case 'ArrowLeft':
            if (cellIndex > 1) { // 첫 번째 열(행 번호)은 건너뛰기
                nextCell = cells[cellIndex - 1];
            }
            break;
        case 'ArrowRight':
            if (cellIndex < cells.length - 1) {
                nextCell = cells[cellIndex + 1];
            }
            break;
        case 'Tab':
            event.preventDefault(); // 기본 탭 동작 방지
            if (event.shiftKey) {
                // Shift+Tab은 이전 셀로
                if (cellIndex > 1) { // 첫 번째 열(행 번호)은 건너뛰기
                    nextCell = cells[cellIndex - 1];
                } else if (rowIndex > 0) {
                    // 이전 행의 마지막 셀로
                    const prevRowCells = rows[rowIndex - 1].querySelectorAll('td');
                    nextCell = prevRowCells[prevRowCells.length - 1];
                }
            } else {
                // Tab은 다음 셀로
                if (cellIndex < cells.length - 1) {
                    nextCell = cells[cellIndex + 1];
                } else if (rowIndex < rows.length - 1) {
                    // 다음 행의 첫 번째 편집 가능한 셀로 (두 번째 열)
                    nextCell = rows[rowIndex + 1].querySelectorAll('td')[1];
                }
            }
            break;
        case 'Enter':
            event.preventDefault(); // 기본 엔터 동작 방지
            if (rowIndex < rows.length - 1) {
                nextCell = rows[rowIndex + 1].querySelectorAll('td')[cellIndex];
            }
            break;
    }
    
    // 다음 셀로 포커스 이동
    if (nextCell) {
        nextCell.focus();
        
        // 커서를 텍스트 끝으로 이동
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(nextCell);
        range.collapse(false); // 끝으로 이동
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// 행 번호 업데이트 함수
function updateRowNumbers(tableBody) {
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const rowNumberCell = row.querySelector('td:first-child');
        if (rowNumberCell) {
            rowNumberCell.textContent = index + 1;
        }
    });
}

// 컨텍스트 메뉴 숨기기 함수
function hideContextMenus() {
    document.querySelectorAll('.row-context-menu, .column-context-menu, .cell-context-menu').forEach(menu => {
        if (menu.parentElement) {
            menu.parentElement.removeChild(menu);
        }
    });
}

// 여러 값들을 하나의 문자열로 합치기 (CSV 포맷)
function combineValues(values, separator = ',') {
    return values.map(value => {
        // 쉼표가 포함된 경우 따옴표로 묶기
        if (value.includes(separator) || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }).join(separator);
}