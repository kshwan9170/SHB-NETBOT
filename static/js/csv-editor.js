/**
 * CSV 파일 편집 기능을 제공하는 JavaScript 모듈
 */

// 전역 변수
let originalCsvData = null;
let currentFilename = null;
let selectedRow = null;
let selectedColumn = null;
    
// CSV 편집 모드 활성화
function enableCsvEditing() {
    console.log("Enabling CSV edit mode");
    // 현재 테이블 상태 저장
    originalCsvData = document.getElementById('csv-table-container').innerHTML;
    
    // 현재 파일명 가져오기
    const filenamePath = window.location.pathname;
    currentFilename = filenamePath.substring(filenamePath.lastIndexOf('/') + 1);
    
    // 테이블 셀을 편집 가능하게 변경
    const table = document.querySelector('.editable-csv-table');
    const cells = table.querySelectorAll('td');
    
    cells.forEach(cell => {
        cell.contentEditable = true;
        cell.style.backgroundColor = '#fffde7';
        cell.addEventListener('focus', function() {
            this.style.backgroundColor = '#fff9c4';
        });
        cell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
    });
    
    // 버튼 상태 변경
    document.getElementById('csv-edit-btn').style.display = 'none';
    document.getElementById('csv-save-btn').style.display = 'inline-block';
    document.getElementById('csv-cancel-btn').style.display = 'inline-block';
    document.getElementById('csv-add-row-btn').style.display = 'inline-block';
    document.getElementById('csv-add-col-btn').style.display = 'inline-block';
}

// CSV 편집 취소
function cancelCsvEditing() {
    console.log("Canceling CSV edit mode");
    // 원래 테이블로 복원
    document.getElementById('csv-table-container').innerHTML = originalCsvData;
    
    // 버튼 상태 변경
    document.getElementById('csv-edit-btn').style.display = 'inline-block';
    document.getElementById('csv-save-btn').style.display = 'none';
    document.getElementById('csv-cancel-btn').style.display = 'none';
    document.getElementById('csv-add-row-btn').style.display = 'none';
    document.getElementById('csv-add-col-btn').style.display = 'none';
}

// 새 행 추가
function addCsvRow() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('테이블을 찾을 수 없습니다.');
        return;
    }
    
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    const rowCount = rows.length;
    const columnCount = table.querySelectorAll('thead tr:last-child th').length;
    
    // 새 행 생성
    const newRow = document.createElement('tr');
    
    // 행 번호 추가 (첫 번째 셀)
    const rowIndexCell = document.createElement('th');
    rowIndexCell.className = 'row-header';
    rowIndexCell.textContent = rowCount + 1; // 1부터 시작하는 행 번호
    newRow.appendChild(rowIndexCell);
    
    // 데이터 셀 추가
    for (let i = 1; i < columnCount; i++) { // 첫 번째 열은 인덱스이므로 1부터 시작
        const cell = document.createElement('td');
        cell.textContent = '';
        cell.contentEditable = true;
        cell.style.backgroundColor = '#fffde7';
        cell.addEventListener('focus', function() {
            this.style.backgroundColor = '#fff9c4';
        });
        cell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
        newRow.appendChild(cell);
    }
    
    // 테이블에 새 행 추가
    tbody.appendChild(newRow);
    
    // 사용자 피드백
    alert(`${rowCount + 1}번 행이 추가되었습니다.`);
}

// 새 열 추가
function addCsvColumn() {
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('테이블을 찾을 수 없습니다.');
        return;
    }
    
    // 현재 열 수 확인
    const headerRows = table.querySelectorAll('thead tr');
    const excelHeaderRow = headerRows[0]; // A, B, C, ... 행
    const columnLabelRow = headerRows[1]; // 실제 컬럼명 행
    
    // 새 엑셀 스타일 열 헤더 (A, B, C, ...)
    const alphaIndex = excelHeaderRow.querySelectorAll('th').length - 1;
    const newColumnLabel = String.fromCharCode(65 + alphaIndex); // 0->A, 1->B, ...
    
    // 새 엑셀 헤더 셀 추가
    const newExcelHeaderCell = document.createElement('th');
    newExcelHeaderCell.className = 'column-label';
    newExcelHeaderCell.textContent = newColumnLabel;
    excelHeaderRow.appendChild(newExcelHeaderCell);
    
    // 새 헤더 추가
    const newHeaderCell = document.createElement('th');
    newHeaderCell.textContent = '새 열';
    columnLabelRow.appendChild(newHeaderCell);
    
    // 모든 데이터 행에 새 열 추가
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const newCell = document.createElement('td');
        newCell.textContent = '';
        newCell.contentEditable = true;
        newCell.style.backgroundColor = '#fffde7';
        newCell.addEventListener('focus', function() {
            this.style.backgroundColor = '#fff9c4';
        });
        newCell.addEventListener('blur', function() {
            this.style.backgroundColor = '#fffde7';
        });
        row.appendChild(newCell);
    });
    
    // 사용자 피드백
    alert(`'${newColumnLabel}' 열이 추가되었습니다.`);
}

// 행 선택 기능
function selectRow(rowIndex) {
    console.log(`행 선택: ${rowIndex}`);
    
    // 이전 선택 초기화
    clearSelection();
    
    // 해당 행의 모든 셀 선택
    const table = document.querySelector('.editable-csv-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    if (rowIndex <= 0 || rowIndex > rows.length) return;
    
    // 행 번호는 1부터 시작하므로 인덱스 조정
    const row = rows[rowIndex - 1];
    row.style.backgroundColor = '#e6f2ff';
    
    // 전역 변수에 현재 선택된 행 저장
    selectedRow = rowIndex;
    
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
    
    // 알파벳 열 헤더(A, B, C...) 강조
    if (typeof columnIndex === 'number') {
        const columnLabels = table.querySelectorAll('thead tr.excel-column-labels th');
        if (columnIndex + 1 < columnLabels.length) {
            columnLabels[columnIndex + 1].style.backgroundColor = '#e6f2ff';
            columnLabels[columnIndex + 1].style.color = '#0033cc';
        }
        
        // 모든 행의 해당 열 셀 선택
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (columnIndex < cells.length) {
                cells[columnIndex].style.backgroundColor = '#e6f2ff';
            }
        });
        
        // 열 이름 헤더도 강조
        const headerRow = table.querySelectorAll('thead tr:not(.excel-column-labels)')[0];
        const headerCells = headerRow.querySelectorAll('th');
        if (columnIndex + 1 < headerCells.length) {
            headerCells[columnIndex + 1].style.backgroundColor = '#e6f2ff';
            headerCells[columnIndex + 1].style.color = '#0033cc';
        }
        
        // 전역 변수에 현재 선택된 열 저장
        selectedColumn = columnIndex;
    } else {
        // 열 이름으로 선택한 경우
        const columnName = columnIndex;
        const headerRow = table.querySelectorAll('thead tr:not(.excel-column-labels)')[0];
        const headerCells = headerRow.querySelectorAll('th');
        
        let colIndex = -1;
        for (let i = 0; i < headerCells.length; i++) {
            if (headerCells[i].textContent.trim() === columnName) {
                headerCells[i].style.backgroundColor = '#e6f2ff';
                headerCells[i].style.color = '#0033cc';
                colIndex = i - 1; // 첫 번째 열은 행 번호
                break;
            }
        }
        
        if (colIndex >= 0) {
            // 알파벳 열 헤더(A, B, C...)도 강조
            const columnLabels = table.querySelectorAll('thead tr.excel-column-labels th');
            if (colIndex + 1 < columnLabels.length) {
                columnLabels[colIndex + 1].style.backgroundColor = '#e6f2ff';
                columnLabels[colIndex + 1].style.color = '#0033cc';
            }
            
            // 모든 행의 해당 열 셀 선택
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (colIndex < cells.length) {
                    cells[colIndex].style.backgroundColor = '#e6f2ff';
                }
            });
            
            // 전역 변수에 현재 선택된 열 저장
            selectedColumn = colIndex;
        }
    }
    
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
    
    // 컨텍스트 메뉴 닫기
    hideContextMenus();
}

// 행 컨텍스트 메뉴 표시
function showRowContextMenu(rowIndex) {
    // 컨텍스트 메뉴는 현재 미구현 (나중에 추가 예정)
    console.log(`행 ${rowIndex}에 대한 컨텍스트 메뉴 표시`);
    // 행 위에 '위에 행 추가', '행 삭제' 등의 버튼 표시 가능
}

// 열 컨텍스트 메뉴 표시
function showColumnContextMenu(columnIndex) {
    // 컨텍스트 메뉴는 현재 미구현 (나중에 추가 예정)
    console.log(`열 ${columnIndex}에 대한 컨텍스트 메뉴 표시`);
    // 열 위에 '왼쪽에 열 추가', '열 삭제' 등의 버튼 표시 가능
}

// 컨텍스트 메뉴 숨기기
function hideContextMenus() {
    // 향후 구현
}

// CSV 변경사항 저장
function saveCsvChanges(filename, encoding = 'utf-8') {
    console.log("Saving CSV changes for:", filename);
    
    // 테이블에서 데이터 추출
    const table = document.querySelector('.editable-csv-table');
    if (!table) {
        alert('편집할 테이블을 찾을 수 없습니다.');
        return;
    }
    
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
    );
    
    // 데이터 전송
    fetch('/api/documents/edit/' + filename, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            headers: headers,
            data: rows,
            encoding: encoding
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('CSV 파일이 성공적으로 저장되었습니다.');
            // 편집 모드 종료
            originalCsvData = data.content;
            cancelCsvEditing();
            // 변경된 내용으로 테이블 업데이트
            document.getElementById('csv-table-container').innerHTML = data.content;
        } else {
            alert('저장 중 오류가 발생했습니다: ' + data.message);
        }
    })
    .catch(error => {
        alert('저장 중 오류가 발생했습니다: ' + error);
    });
}

// 메타데이터 보기
function viewMetadata(metadataFilename) {
    console.log("Viewing metadata for:", metadataFilename);
    
    fetch('/api/documents/view/' + metadataFilename)
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 새 창에 메타데이터 표시
            const metadataWindow = window.open('', '_blank', 'width=800,height=600');
            const html = '<html>' + 
                '<head>' + 
                '<title>메타데이터: ' + metadataFilename + '</title>' + 
                '<link rel="stylesheet" href="/static/css/modern.css">' + 
                '<style>' + 
                'body { padding: 20px; font-family: Arial, sans-serif; }' + 
                'pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }' + 
                '</style>' + 
                '</head>' + 
                '<body>' + 
                '<h2>메타데이터: ' + metadataFilename + '</h2>' + 
                '<pre>' + data.content + '</pre>' + 
                '</body>' + 
                '</html>';
            metadataWindow.document.write(html);
        } else {
            alert('메타데이터를 불러오는 중 오류가 발생했습니다: ' + data.message);
        }
    })
    .catch(error => {
        alert('메타데이터를 불러오는 중 오류가 발생했습니다: ' + error);
    });
}