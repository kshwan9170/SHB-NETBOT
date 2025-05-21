/**
 * CSV 편집기 추가 함수 모듈
 * 이 파일은 csv-editor-enhanced.js를 보완하는 함수들을 포함합니다.
 */

// 메뉴 아이템 생성 함수
function createMenuItem(text, backgroundColor, onClick) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerText = text;
    item.style.cssText = `
        padding: 5px 10px;
        cursor: pointer;
        background-color: ${backgroundColor};
        color: white;
        border-radius: 3px;
        margin: 2px 0;
        text-align: center;
    `;
    item.addEventListener('click', onClick);
    return item;
}

// 행 삭제 함수
function deleteRow(rowIndex) {
    console.log(`행 삭제: ${rowIndex}번 행`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    if (rowIndex < 0 || rowIndex >= rows.length) {
        console.error("유효하지 않은 행 인덱스:", rowIndex);
        return;
    }
    
    // 행 삭제
    tableBody.removeChild(rows[rowIndex]);
    
    // 행 번호 업데이트
    updateRowNumbers(tableBody);
    
    // 선택 상태 초기화
    clearSelection();
}

// 열 삭제 함수
function deleteColumn(columnIndex) {
    console.log(`열 삭제: ${columnIndex}번 열`);
    
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    // 헤더에서 열 제거
    const headerRows = table.querySelectorAll('thead tr');
    headerRows.forEach(row => {
        const cells = row.querySelectorAll('th');
        if (columnIndex + 1 < cells.length) {  // +1은 행 번호 열을 고려
            row.removeChild(cells[columnIndex + 1]);
        }
    });
    
    // 모든 행에서 해당 열 제거
    const tableBody = table.querySelector('tbody');
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (columnIndex < cells.length) {
            row.removeChild(cells[columnIndex]);
        }
    });
    
    // 선택 상태 초기화
    clearSelection();
}

// 컨텍스트 메뉴 숨기기 함수
function hideContextMenus() {
    document.querySelectorAll('.row-context-menu, .column-context-menu, .cell-context-menu').forEach(menu => {
        if (menu.parentElement) {
            menu.parentElement.removeChild(menu);
        }
    });
}

// 메인 JS 파일에 함수 연결 (외부 파일로 분리했을 때 사용)
if (typeof window !== 'undefined') {
    // 전역 객체에 함수 등록
    window.createMenuItem = createMenuItem;
    window.deleteRow = deleteRow;
    window.deleteColumn = deleteColumn;
    window.hideContextMenus = hideContextMenus;
}