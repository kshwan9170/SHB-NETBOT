/**
 * CSV 파일 편집 기능을 제공하는 JavaScript 모듈 (엑셀 스타일 개선 버전)
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
        saveBtn.addEventListener('click', saveCsvChanges);
    }
    
    // 취소 버튼
    const cancelBtn = document.getElementById('csv-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelCsvEditing);
    }
    
    // 행 추가 버튼
    const addRowBtn = document.getElementById('csv-add-row-btn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', addCsvRow);
    }
    
    // 열 추가 버튼
    const addColBtn = document.getElementById('csv-add-col-btn');
    if (addColBtn) {
        addColBtn.addEventListener('click', addCsvColumn);
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
    
    // 현재 파일명 가져오기
    const filenamePath = window.location.pathname;
    const pathSegments = filenamePath.split('/');
    
    // URL이 /api/documents/view/filename 형식인지 확인
    if (pathSegments.includes('view')) {
        // 전체 경로에서 마지막 부분이 파일명
        currentFilename = pathSegments[pathSegments.length - 1];
    } else if (pathSegments.includes('file-manager')) {
        // 파일 관리자에서는 별도로 파일명을 가져와야 함
        const viewingFile = document.querySelector('.file-preview-title');
        if (viewingFile && viewingFile.dataset.systemFilename) {
            currentFilename = viewingFile.dataset.systemFilename;
        } else {
            alert('편집할 파일을 찾을 수 없습니다.');
            return;
        }
    } else {
        currentFilename = filenamePath.substring(filenamePath.lastIndexOf('/') + 1);
    }
    console.log("현재 편집 중인 파일명:", currentFilename);
    
    // 테이블 셀을 편집 가능하게 변경
    const table = document.querySelector('.editable-csv-table');
    const cells = table.querySelectorAll('td');
    
    cells.forEach(cell => {
        cell.contentEditable = true;
        cell.style.backgroundColor = '#fffde7';
        
        // 셀 포커스 이벤트 - 행/열 위치 저장
        cell.addEventListener('focus', function() {
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const tableBody = table.querySelector('tbody');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            console.log(`선택된 셀: 행=${rowIndex}, 열=${colIndex}`);
            this.style.backgroundColor = '#fff9c4';
        });
        
        cell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
        
        // 셀에 오른쪽 클릭 이벤트 추가
        cell.addEventListener('contextmenu', function(e) {
            e.preventDefault(); // 기본 컨텍스트 메뉴 방지
            
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const tableBody = table.querySelector('tbody');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            // 선택 상태 업데이트
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            // 컨텍스트 메뉴 표시
            showCellContextMenu(e, rowIndex, colIndex);
        });
    });
    
    // 버튼 상태 변경
    document.getElementById('csv-edit-btn').style.display = 'none';
    document.getElementById('csv-save-btn').style.display = 'inline-block';
    document.getElementById('csv-cancel-btn').style.display = 'inline-block';
    
    // 행 관련 컨트롤 표시
    const rowControls = document.querySelector('.csv-row-controls');
    if (rowControls) {
        rowControls.style.display = 'block';
    }
    
    // 행 추가 버튼이 있으면 표시
    const addRowBtn = document.getElementById('csv-add-row-btn');
    if (addRowBtn) {
        addRowBtn.style.display = 'inline-block';
    }
    
    // 삭제 버튼이 있으면 표시
    const deleteRowBtn = document.getElementById('csv-delete-row-btn');
    if (deleteRowBtn) {
        deleteRowBtn.style.display = 'inline-block';
        deleteRowBtn.style.opacity = '0.6';
        deleteRowBtn.style.cursor = 'default';
        // 이벤트 리스너 추가
        deleteRowBtn.addEventListener('click', deleteSelectedRow);
    }
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
    
    // 행 관련 컨트롤 숨기기
    const rowControls = document.querySelector('.csv-row-controls');
    if (rowControls) {
        rowControls.style.display = 'none';
    }
    
    // 선택 상태 초기화
    selectedRow = null;
    selectedColumn = null;
}

// CSV 변경사항 저장
function saveCsvChanges() {
    console.log("CSV 변경사항 저장");
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('테이블을 찾을 수 없습니다.');
        return;
    }
    
    // 헤더 행 추출
    const headerRow = table.querySelector('thead tr:not(.excel-column-labels)');
    const headers = Array.from(headerRow.querySelectorAll('th')).slice(1).map(th => th.textContent.trim());
    
    // 데이터 행 추출
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
        return Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
    });
    
    // 서버에 저장 요청 (URL이 이미 /api/documents/view/로 시작하는 경우 처리)
    // URL 인코딩이 필요한 특수문자 처리
    const decodedFilename = decodeURIComponent(currentFilename);
    console.log("파일명 디코딩:", decodedFilename);
    
    // 파일명에 '업무 안내 가이드' 같은 단어가 포함된 경우 인코딩 처리
    const encodedFilename = encodeURIComponent(decodedFilename);
    let apiUrl = '/api/documents/edit/' + encodedFilename;
    
    // 저장 시작 알림 표시
    const saveBtn = document.getElementById('csv-save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '저장 중...';
    saveBtn.disabled = true;
    
    // 저장 중 스피너 효과
    saveBtn.innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;margin-right:5px;"></span> 저장 중...';
    
    // 스피너 애니메이션 스타일 추가
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styleElement);
    
    console.log("저장 API URL:", apiUrl);
    
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            headers: headers,
            data: rows
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 저장 성공 알림
            alert('CSV 파일이 성공적으로 저장되었습니다.');
            
            // 수정 모드 종료
            document.getElementById('csv-edit-btn').style.display = 'inline-block';
            document.getElementById('csv-save-btn').style.display = 'none';
            document.getElementById('csv-cancel-btn').style.display = 'none';
            
            // 행 관련 컨트롤 숨기기
            const rowControls = document.querySelector('.csv-row-controls');
            if (rowControls) {
                rowControls.style.display = 'none';
            }
            
            // 현재 상태를 원본 상태로 업데이트
            originalCsvData = document.getElementById('csv-table-container').innerHTML;
        } else {
            alert('저장 중 오류가 발생했습니다: ' + data.message);
        }
    })
    .catch(error => {
        console.error('저장 중 오류 발생:', error);
        alert('서버 연결 중 오류가 발생했습니다.');
    })
    .finally(() => {
        // 저장 버튼 상태 복원
        const saveBtn = document.getElementById('csv-save-btn');
        saveBtn.innerHTML = '변경사항 저장';
        saveBtn.disabled = false;
    });
}

// 새 행 추가 (버튼 클릭) - 항상 맨 아래에 추가
function addCsvRow() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('테이블을 찾을 수 없습니다.');
        return;
    }
    
    // 항상 마지막에 행 추가
    const tableBody = table.querySelector('tbody');
    const rowCount = tableBody.querySelectorAll('tr').length;
    insertNewRow(rowCount);
    
    // 모든 선택 초기화
    clearSelection();
    
    // 추가된 행으로 스크롤
    setTimeout(() => {
        const rows = tableBody.querySelectorAll('tr');
        if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 추가된 행 강조 표시 (잠시 후 사라짐)
            lastRow.style.backgroundColor = '#e8f5e9';
            setTimeout(() => {
                lastRow.style.backgroundColor = '';
            }, 2000);
        }
    }, 100);
}

// 새 열 추가 (버튼 클릭)
function addCsvColumn() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('테이블을 찾을 수 없습니다.');
        return;
    }
    
    // 항상 마지막에 열 추가 (사용자 요청대로 수정)
    const headerRow = table.querySelector('thead tr:not(.excel-column-labels)');
    const columnCount = headerRow.querySelectorAll('th').length - 1; // 행 번호 열 제외
    insertNewColumn(columnCount);
    
    // 모든 선택 초기화
    clearSelection();
    
    // 새 열 강조 표시 (잠시 후 사라짐)
    setTimeout(() => {
        const headers = headerRow.querySelectorAll('th');
        const lastHeader = headers[headers.length - 1];
        
        if (lastHeader) {
            lastHeader.style.backgroundColor = '#e3f2fd';
            setTimeout(() => {
                lastHeader.style.backgroundColor = '';
            }, 2000);
        }
    }, 100);
}

// 행 선택 기능
function selectRow(rowIndex) {
    console.log(`행 선택: ${rowIndex}`);
    
    // 이전 선택 초기화
    clearSelection();
    
    // 해당 행의 모든 셀 선택
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    if (rowIndex <= 0 || rowIndex > rows.length) return;
    
    // 행 번호는 1부터 시작하므로 인덱스 조정
    const row = rows[rowIndex - 1];
    row.style.backgroundColor = '#e6f2ff';
    
    // 전역 변수에 현재 선택된 행 저장
    selectedRow = rowIndex - 1;
    
    // 행 번호 셀 강조
    const rowHeader = row.querySelector('th');
    if (rowHeader) {
        rowHeader.style.backgroundColor = '#0064E1';
        rowHeader.style.color = 'white';
    }
    
    // 삭제 버튼 활성화 시각적 표시
    const deleteRowBtn = document.getElementById('csv-delete-row-btn');
    if (deleteRowBtn && deleteRowBtn.style.display !== 'none') {
        deleteRowBtn.style.opacity = '1';
        deleteRowBtn.style.cursor = 'pointer';
        deleteRowBtn.title = `${rowIndex}번 행 삭제`;
    }
    
    // 컨텍스트 메뉴 표시 (행 추가/삭제 등)
    showRowContextMenu(rowIndex);
}

// 열 선택 기능
function selectColumn(columnIndex) {
    console.log(`열 선택: ${columnIndex}`);
    
    // 이전 선택 초기화
    clearSelection();
    
    // 모든 행에서 해당 인덱스의 셀 선택
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    // 열 번호가 유효한지 확인
    if (columnIndex < 0) return;
    
    // 알파벳 열 헤더(A, B, C...) 강조
    const excelHeaderRow = table.querySelector('thead tr.excel-column-labels');
    if (excelHeaderRow) {
        const columnLabels = excelHeaderRow.querySelectorAll('th');
        if (columnIndex + 1 < columnLabels.length) {
            columnLabels[columnIndex + 1].style.backgroundColor = '#0064E1';
            columnLabels[columnIndex + 1].style.color = 'white';
        }
    }
    
    // 모든 행의 해당 열 셀 선택
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (columnIndex < cells.length) {
            cells[columnIndex].style.backgroundColor = '#e6f2ff';
        }
    });
    
    // 열 이름 헤더도 강조
    const headerRow = table.querySelector('thead tr:not(.excel-column-labels)');
    const headerCells = headerRow.querySelectorAll('th');
    if (columnIndex + 1 < headerCells.length) {
        headerCells[columnIndex + 1].style.backgroundColor = '#0064E1';
        headerCells[columnIndex + 1].style.color = 'white';
    }
    
    // 전역 변수에 현재 선택된 열 저장
    selectedColumn = columnIndex;
    
    // 컨텍스트 메뉴 표시 (열 추가/삭제 등)
    showColumnContextMenu(columnIndex);
}

// 선택 초기화
function clearSelection() {
    // 모든 선택 표시 제거
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    // 모든 셀 배경색 초기화
    table.querySelectorAll('td').forEach(cell => {
        if (cell.contentEditable === 'true') {
            cell.style.backgroundColor = '#fffde7';
        } else {
            cell.style.backgroundColor = '';
        }
    });
    
    // 모든 헤더 색상 초기화
    table.querySelectorAll('th').forEach(th => {
        if (th.classList.contains('row-header')) {
            th.style.backgroundColor = '#e6f2ff';
            th.style.color = '#0064E1';
        } else if (th.classList.contains('column-label')) {
            th.style.backgroundColor = '#e6f2ff';
            th.style.color = '#0064E1';
        } else {
            th.style.backgroundColor = '#f2f2f2';
            th.style.color = '#333';
        }
    });
    
    // 선택된 행/열 변수 초기화
    selectedRow = null;
    selectedColumn = null;
    
    // 삭제 버튼 비활성화 시각적 표시
    const deleteRowBtn = document.getElementById('csv-delete-row-btn');
    if (deleteRowBtn && deleteRowBtn.style.display !== 'none') {
        deleteRowBtn.style.opacity = '0.6';
        deleteRowBtn.style.cursor = 'default';
        deleteRowBtn.title = '행을 선택하면 삭제할 수 있습니다';
    }
    
    // 컨텍스트 메뉴 닫기
    hideContextMenus();
}

// 컨텍스트 메뉴 숨기기 함수
function hideContextMenus() {
    document.querySelectorAll('.row-context-menu, .column-context-menu, .cell-context-menu').forEach(menu => {
        if (menu.parentElement) {
            menu.parentElement.removeChild(menu);
        }
    });
}

// 행 컨텍스트 메뉴 표시
function showRowContextMenu(rowIndex) {
    console.log(`행 ${rowIndex}에 대한 컨텍스트 메뉴 표시`);
    
    // 기존 컨텍스트 메뉴 제거
    hideContextMenus();
    
    // 선택된 행 요소 찾기
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    if (rowIndex <= 0 || rowIndex > rows.length) return;
    
    // 메뉴 컨테이너 생성
    const menuContainer = document.createElement('div');
    menuContainer.className = 'row-context-menu';
    menuContainer.style.cssText = `
        position: absolute;
        display: flex;
        gap: 5px;
        padding: 5px;
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
    `;
    
    // 행 위에 추가 버튼
    const addAboveBtn = document.createElement('button');
    addAboveBtn.innerText = '위에 행 추가';
    addAboveBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    addAboveBtn.onclick = () => insertNewRow(rowIndex - 1);
    
    // 행 아래 추가 버튼
    const addBelowBtn = document.createElement('button');
    addBelowBtn.innerText = '아래에 행 추가';
    addBelowBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    addBelowBtn.onclick = () => insertNewRow(rowIndex);
    
    // 행 삭제 버튼
    const deleteRowBtn = document.createElement('button');
    deleteRowBtn.innerText = '행 삭제';
    deleteRowBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    deleteRowBtn.onclick = () => deleteRow(rowIndex);
    
    // 메뉴에 버튼 추가
    menuContainer.appendChild(addAboveBtn);
    menuContainer.appendChild(addBelowBtn);
    menuContainer.appendChild(deleteRowBtn);
    
    // 선택한 행 위에 메뉴 위치시키기
    const row = rows[rowIndex - 1];
    const rowRect = row.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    
    menuContainer.style.top = `${rowRect.top - tableRect.top - 40}px`;
    menuContainer.style.left = `${rowRect.left - tableRect.left + 100}px`;
    
    // 메뉴를 테이블에 추가
    table.parentElement.appendChild(menuContainer);
    
    // 다른 곳 클릭 시 메뉴 닫기
    document.addEventListener('click', function closeMenu(e) {
        if (!menuContainer.contains(e.target) && e.target !== row) {
            hideContextMenus();
            document.removeEventListener('click', closeMenu);
        }
    });
}

// 열 컨텍스트 메뉴 표시
function showColumnContextMenu(columnIndex) {
    console.log(`열 ${columnIndex}에 대한 컨텍스트 메뉴 표시`);
    
    // 기존 컨텍스트 메뉴 제거
    hideContextMenus();
    
    // 테이블 및 헤더 요소 찾기
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    if (columnIndex < 0) return;
    
    // 메뉴 컨테이너 생성
    const menuContainer = document.createElement('div');
    menuContainer.className = 'column-context-menu';
    menuContainer.style.cssText = `
        position: absolute;
        display: flex;
        gap: 5px;
        padding: 5px;
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
    `;
    
    // 왼쪽에 열 추가 버튼
    const addLeftBtn = document.createElement('button');
    addLeftBtn.innerText = '왼쪽에 열 추가';
    addLeftBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    addLeftBtn.onclick = () => insertNewColumn(columnIndex);
    
    // 오른쪽에 열 추가 버튼
    const addRightBtn = document.createElement('button');
    addRightBtn.innerText = '오른쪽에 열 추가';
    addRightBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    addRightBtn.onclick = () => insertNewColumn(columnIndex + 1);
    
    // 열 삭제 버튼
    const deleteColumnBtn = document.createElement('button');
    deleteColumnBtn.innerText = '열 삭제';
    deleteColumnBtn.style.cssText = `
        padding: 4px 8px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    deleteColumnBtn.onclick = () => deleteColumn(columnIndex);
    
    // 메뉴에 버튼 추가
    menuContainer.appendChild(addLeftBtn);
    menuContainer.appendChild(addRightBtn);
    menuContainer.appendChild(deleteColumnBtn);
    
    // 선택한 열 위에 메뉴 위치시키기
    const headerRow = table.querySelector('thead tr:not(.excel-column-labels)');
    const headerCells = headerRow.querySelectorAll('th');
    
    if (columnIndex + 1 < headerCells.length) {
        const cellRect = headerCells[columnIndex + 1].getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        
        menuContainer.style.top = `${cellRect.top - tableRect.top - 40}px`;
        menuContainer.style.left = `${cellRect.left - tableRect.left}px`;
        
        // 메뉴를 테이블에 추가
        table.parentElement.appendChild(menuContainer);
        
        // 다른 곳 클릭 시 메뉴 닫기
        document.addEventListener('click', function closeMenu(e) {
            if (!menuContainer.contains(e.target) && e.target !== headerCells[columnIndex + 1]) {
                hideContextMenus();
                document.removeEventListener('click', closeMenu);
            }
        });
    }
}

// 셀 컨텍스트 메뉴 표시 - 엑셀스타일
function showCellContextMenu(event, rowIndex, colIndex) {
    console.log(`셀 컨텍스트 메뉴: 행=${rowIndex}, 열=${colIndex}`);
    
    // 기존 컨텍스트 메뉴 제거
    hideContextMenus();
    
    // 메뉴 컨테이너 생성
    const menuContainer = document.createElement('div');
    menuContainer.className = 'cell-context-menu';
    menuContainer.style.cssText = `
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px;
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 14px;
        min-width: 150px;
        top: ${event.pageY}px;
        left: ${event.pageX}px;
    `;
    
    // 행 추가 메뉴 아이템
    const addRowAboveItem = createMenuItem('위에 행 추가', '#4caf50', () => {
        insertNewRow(rowIndex);
        hideContextMenus();
    });
    
    const addRowBelowItem = createMenuItem('아래에 행 추가', '#4caf50', () => {
        insertNewRow(rowIndex + 1);
        hideContextMenus();
    });
    
    // 열 추가 메뉴 아이템
    const addColLeftItem = createMenuItem('왼쪽에 열 추가', '#2196f3', () => {
        insertNewColumn(colIndex);
        hideContextMenus();
    });
    
    const addColRightItem = createMenuItem('오른쪽에 열 추가', '#2196f3', () => {
        insertNewColumn(colIndex + 1);
        hideContextMenus();
    });
    
    // 삭제 메뉴 아이템
    const deleteRowItem = createMenuItem('행 삭제', '#f44336', () => {
        deleteRow(rowIndex + 1);
        hideContextMenus();
    });
    
    const deleteColItem = createMenuItem('열 삭제', '#f44336', () => {
        deleteColumn(colIndex);
        hideContextMenus();
    });
    
    // 메뉴에 아이템 추가
    menuContainer.appendChild(addRowAboveItem);
    menuContainer.appendChild(addRowBelowItem);
    menuContainer.appendChild(document.createElement('hr'));
    menuContainer.appendChild(addColLeftItem);
    menuContainer.appendChild(addColRightItem);
    menuContainer.appendChild(document.createElement('hr'));
    menuContainer.appendChild(deleteRowItem);
    menuContainer.appendChild(deleteColItem);
    
    // 메뉴를 문서에 추가
    document.body.appendChild(menuContainer);
    
    // 다른 곳 클릭 시 메뉴 닫기
    document.addEventListener('click', function closeMenu(e) {
        if (!menuContainer.contains(e.target)) {
            hideContextMenus();
            document.removeEventListener('click', closeMenu);
        }
    });
    
    // ESC 키 누르면 메뉴 닫기
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            hideContextMenus();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
    
    // 이벤트 전파 방지
    event.stopPropagation();
}

// 메뉴 아이템 생성 도우미 함수
function createMenuItem(text, color, onClick) {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.textContent = text;
    item.style.cssText = `
        padding: 6px 10px;
        cursor: pointer;
        border-radius: 3px;
        transition: background-color 0.2s;
    `;
    
    // 호버 효과
    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f5f5f5';
        item.style.color = color;
    });
    
    item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
        item.style.color = '#333';
    });
    
    // 클릭 이벤트
    item.addEventListener('click', onClick);
    
    return item;
}

// 컨텍스트 메뉴 숨기기
function hideContextMenus() {
    // 모든 컨텍스트 메뉴 삭제
    document.querySelectorAll('.row-context-menu, .column-context-menu, .cell-context-menu').forEach(menu => {
        menu.remove();
    });
}

// 새 행 삽입 - 특정 위치에
function insertNewRow(rowIndex) {
    console.log(`행 추가: ${rowIndex}번 위치에`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const headerRow = table.querySelector('thead tr:not(.excel-column-labels)');
    const headerCells = headerRow.querySelectorAll('th');
    const columnCount = headerCells.length - 1; // 행 번호 열 제외
    
    // 새 행 생성
    const newRow = document.createElement('tr');
    
    // 행 번호 셀 추가
    const rowNumCell = document.createElement('th');
    rowNumCell.className = 'row-header';
    rowNumCell.style.cssText = `
        background-color: #e6f2ff;
        color: #0064E1;
        font-weight: bold;
        text-align: center;
        cursor: pointer;
    `;
    newRow.appendChild(rowNumCell);
    
    // 데이터 셀 추가
    for (let i = 0; i < columnCount; i++) {
        const cell = document.createElement('td');
        cell.textContent = '';
        cell.contentEditable = true;
        cell.style.backgroundColor = '#fffde7';
        
        // 셀 포커스 이벤트 - 행/열 위치 저장
        cell.addEventListener('focus', function() {
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const tableBody = table.querySelector('tbody');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            console.log(`선택된 셀: 행=${rowIndex}, 열=${colIndex}`);
            this.style.backgroundColor = '#fff9c4';
        });
        
        cell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
        
        // 셀에 오른쪽 클릭 이벤트 추가
        cell.addEventListener('contextmenu', function(e) {
            e.preventDefault(); // 기본 컨텍스트 메뉴 방지
            
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const tableBody = table.querySelector('tbody');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            // 선택 상태 업데이트
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            // 컨텍스트 메뉴 표시
            showCellContextMenu(e, rowIndex, colIndex);
        });
        
        newRow.appendChild(cell);
    }
    
    // 테이블에 새 행 추가
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    if (rowIndex >= rows.length) {
        // 마지막에 추가
        tableBody.appendChild(newRow);
    } else {
        // 특정 위치에 삽입
        tableBody.insertBefore(newRow, rows[rowIndex]);
    }
    
    // 행 번호 업데이트
    updateRowNumbers(tableBody);
    
    // 선택 상태 초기화
    clearSelection();
}

// 행 번호 업데이트 함수
function updateRowNumbers(tableBody) {
    if (!tableBody) {
        const table = document.querySelector('.editable-csv-table');
        if (table) {
            tableBody = table.querySelector('tbody');
        }
    }
    
    if (!tableBody) {
        console.error("테이블 본문을 찾을 수 없습니다.");
        return;
    }
    
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach((row, index) => {
        const rowHeader = row.querySelector('th');
        if (rowHeader) {
            rowHeader.textContent = index + 1;
            rowHeader.className = 'row-header';
            rowHeader.style.cssText = `
                background-color: #e6f2ff;
                color: #0064E1;
                font-weight: bold;
                text-align: center;
                cursor: pointer;
            `;
            
            // 행 헤더 클릭 이벤트 재설정
            rowHeader.addEventListener('click', function() {
                selectRow(index + 1);
            });
        }
    });
}

// 새 열 삽입 - 특정 위치에
function insertNewColumn(columnIndex) {
    console.log(`열 추가: ${columnIndex}번 위치에`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    // 엑셀 스타일 헤더(A, B, C...)가 있는지 확인
    const excelHeaderRow = table.querySelector('thead tr.excel-column-labels');
    const columnLabelRow = table.querySelector('thead tr:not(.excel-column-labels)');
    
    if (!excelHeaderRow || !columnLabelRow) return;
    
    // 새 엑셀 스타일 열 헤더 생성 (A, B, C, ...)
    const alphaIndex = excelHeaderRow.querySelectorAll('th').length - 1; // 현재 열 수 (행 번호 제외)
    const newColumnLabel = String.fromCharCode(65 + alphaIndex); // 0->A, 1->B, ...
    
    // 새 엑셀 헤더 셀 추가
    const newExcelHeaderCell = document.createElement('th');
    newExcelHeaderCell.className = 'column-label';
    newExcelHeaderCell.textContent = newColumnLabel;
    newExcelHeaderCell.style.cssText = `
        background-color: #e6f2ff;
        color: #0064E1;
        cursor: pointer;
        position: sticky;
        top: 0;
        z-index: 2;
    `;
    
    // 열 헤더 클릭 시 열 선택
    newExcelHeaderCell.onclick = function() {
        selectColumn(columnIndex);
    };
    
    // 새 열 헤더 추가
    const newHeaderCell = document.createElement('th');
    newHeaderCell.textContent = '새 열';
    newHeaderCell.style.cssText = `
        background-color: #f2f2f2;
        position: sticky;
        top: 30px;
        z-index: 2;
    `;
    
    // 모든 행에 새 열 추가
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    // 헤더 행에 열 삽입
    if (columnIndex >= excelHeaderRow.children.length - 1) {
        // 마지막에 추가
        excelHeaderRow.appendChild(newExcelHeaderCell);
        columnLabelRow.appendChild(newHeaderCell);
    } else {
        // 특정 위치에 삽입 (행 번호 열 고려)
        excelHeaderRow.insertBefore(newExcelHeaderCell, excelHeaderRow.children[columnIndex + 1]);
        columnLabelRow.insertBefore(newHeaderCell, columnLabelRow.children[columnIndex + 1]);
    }
    
    // 모든 데이터 행에 새 셀 추가
    rows.forEach(row => {
        const newCell = document.createElement('td');
        newCell.textContent = '';
        newCell.contentEditable = true;
        newCell.style.backgroundColor = '#fffde7';
        
        // 셀 포커스 이벤트 - 행/열 위치 저장
        newCell.addEventListener('focus', function() {
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            console.log(`선택된 셀: 행=${rowIndex}, 열=${colIndex}`);
            this.style.backgroundColor = '#fff9c4';
        });
        
        newCell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
        
        // 셀에 오른쪽 클릭 이벤트 추가
        newCell.addEventListener('contextmenu', function(e) {
            e.preventDefault(); // 기본 컨텍스트 메뉴 방지
            
            // 현재 행과 열 인덱스 찾기
            const rowElement = this.closest('tr');
            const rowIndex = Array.from(tableBody.children).indexOf(rowElement);
            const colIndex = Array.from(rowElement.children).indexOf(this) - 1; // 행 번호 열 제외
            
            // 선택 상태 업데이트
            selectedRow = rowIndex;
            selectedColumn = colIndex;
            
            // 컨텍스트 메뉴 표시
            showCellContextMenu(e, rowIndex, colIndex);
        });
        
        if (columnIndex >= row.children.length - 1) {
            // 마지막에 추가
            row.appendChild(newCell);
        } else {
            // 특정 위치에 삽입 (행 번호 열 고려)
            row.insertBefore(newCell, row.children[columnIndex + 1]);
        }
    });
    
    // 엑셀 스타일 열 헤더 업데이트 (A, B, C, ...)
    updateColumnHeaders();
    
    // 선택 상태 초기화
    clearSelection();
}

// 행 삭제
function deleteRow(rowIndex) {
    console.log(`행 삭제: ${rowIndex}번`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    // 행 번호 유효성 검사 (rowIndex는 UI 기준으로 1부터 시작)
    if (rowIndex < 1 || rowIndex > rows.length) {
        console.error(`유효하지 않은 행 인덱스: ${rowIndex}, 전체 행 수: ${rows.length}`);
        return;
    }
    
    // 배열 인덱스로 변환 (0부터 시작)
    const arrayIndex = rowIndex - 1;
    
    // 행 삭제 애니메이션 효과
    const row = rows[arrayIndex];
    row.style.transition = 'all 0.3s';
    row.style.backgroundColor = '#ffebee';
    row.style.opacity = '0.5';
    
    setTimeout(() => {
        // 행 삭제
        tableBody.removeChild(row);
        
        // 행 번호 업데이트
        updateRowNumbers();
        
        // 선택 상태 초기화
        clearSelection();
        
        // 삭제 후 테이블이 비어있는지 확인
        const remainingRows = tableBody.querySelectorAll('tr');
        if (remainingRows.length === 0) {
            // 테이블이 비어있으면 빈 행 하나 추가
            insertNewRow(0);
        }
    }, 300);
}

// 선택된 행 삭제 (삭제 버튼 클릭)
function deleteSelectedRow() {
    // 선택된 행이 있는지 확인
    if (selectedRow === null) {
        alert('삭제할 행을 먼저 선택해주세요.');
        return;
    }
    
    // 실제 행 인덱스는 0부터 시작하지만, UI에서는 1부터 시작하므로 +1
    const displayRowNumber = selectedRow + 1;
    if (confirm(`${displayRowNumber}번 행을 삭제하시겠습니까?`)) {
        // selectedRow는 0부터 시작하는 배열 인덱스이므로, UI 인덱스로 변환 (+1)
        deleteRow(displayRowNumber);
    }
}

// 열 삭제
function deleteColumn(columnIndex) {
    console.log(`열 삭제: ${columnIndex}번`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    // 열 번호 유효성 검사
    if (columnIndex < 0) return;
    
    // 엑셀 스타일 헤더 행과 일반 헤더 행
    const excelHeaderRow = table.querySelector('thead tr.excel-column-labels');
    const columnLabelRow = table.querySelector('thead tr:not(.excel-column-labels)');
    
    if (!excelHeaderRow || !columnLabelRow) return;
    
    const excelHeaders = excelHeaderRow.querySelectorAll('th');
    const columnHeaders = columnLabelRow.querySelectorAll('th');
    
    // 열 인덱스 유효성 검사 (행 번호 열 제외)
    if (columnIndex + 1 >= columnHeaders.length) return;
    
    // 열 이름 가져오기
    const columnName = columnHeaders[columnIndex + 1].textContent.trim();
    
    // 열 삭제 확인
    if (confirm(`'${columnName}' 열을 삭제하시겠습니까?`)) {
        // 열 헤더 삭제 (행 번호 열 고려)
        if (columnIndex + 1 < excelHeaders.length) {
            excelHeaders[columnIndex + 1].remove();
        }
        
        if (columnIndex + 1 < columnHeaders.length) {
            columnHeaders[columnIndex + 1].remove();
        }
        
        // 모든 행에서 해당 열 셀 삭제
        const tableBody = table.querySelector('tbody');
        const rows = tableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (columnIndex < cells.length) {
                cells[columnIndex].remove();
            }
        });
        
        // 엑셀 스타일 열 헤더 업데이트 (A, B, C, ...)
        updateColumnHeaders();
        
        // 선택 상태 초기화
        clearSelection();
    }
}

// 행 번호 업데이트
function updateRowNumbers() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach((row, index) => {
        const rowHeader = row.querySelector('th');
        if (rowHeader) {
            rowHeader.textContent = index + 1;
            
            // 행 헤더 클릭 이벤트 재설정
            rowHeader.onclick = function() {
                selectRow(index + 1);
            };
        }
    });
}

// 열 헤더 업데이트 (A, B, C, ...)
function updateColumnHeaders() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const excelHeaderRow = table.querySelector('thead tr.excel-column-labels');
    if (!excelHeaderRow) return;
    
    const excelHeaders = excelHeaderRow.querySelectorAll('th');
    
    // 첫 번째 헤더는 행 번호용이므로 건너뜀
    for (let i = 1; i < excelHeaders.length; i++) {
        const columnLabel = String.fromCharCode(64 + i); // 1->A, 2->B, ...
        excelHeaders[i].textContent = columnLabel;
        
        // 열 헤더 클릭 이벤트 재설정
        excelHeaders[i].onclick = function() {
            selectColumn(i - 1);
        };
    }
}