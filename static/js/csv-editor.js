/**
 * CSV 파일 편집 기능을 제공하는 JavaScript 모듈
 */

// 전역 변수
let originalCsvData = null;
    
// CSV 편집 모드 활성화
function enableCsvEditing() {
    console.log("Enabling CSV edit mode");
    // 현재 테이블 상태 저장
    originalCsvData = document.getElementById('csv-table-container').innerHTML;
    
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