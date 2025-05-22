/**
 * 오프라인 모드 데이터 초기화 모듈
 * 브라우저 IndexedDB에 샘플 데이터를 추가하여 오프라인 기능 지원
 */

// 전역 네임스페이스
window.offlineDataInitializer = (function() {
    // IndexedDB 저장소 객체 참조
    const offlineStorage = window.offlineStorage;
    
    // 샘플 데이터 생성 함수
    function createSampleData() {
        return [
            {
                text: "IP 192.168.0.1은 네트워크관리팀의 김철수 담당자가 사용 중입니다. 연락처는 02-123-4567입니다.",
                metadata: {
                    ip: "192.168.0.1",
                    user: "김철수",
                    department: "네트워크관리팀",
                    contact: "02-123-4567",
                    last_access: "2025-05-20",
                    status: "사용 중",
                    source: "업무 안내 가이드(IP_사용자_조회).csv",
                    record_type: "ip",
                    question: "192.168.0.1 정보 알려줘"
                }
            },
            {
                text: "IP 10.10.1.5는 IT보안팀의 이영희 담당자가 정상 상태입니다. 연락처는 02-123-5678입니다.",
                metadata: {
                    ip: "10.10.1.5",
                    user: "이영희",
                    department: "IT보안팀",
                    contact: "02-123-5678",
                    last_access: "2025-05-21",
                    status: "정상",
                    source: "업무 안내 가이드(IP_사용자_조회).csv",
                    record_type: "ip",
                    question: "10.10.1.5 IP 담당자는 누구?"
                }
            },
            {
                text: "네트워크 연결 오류의 증상은 \"인터넷 연결이 끊어지거나 불안정함\"입니다. 조치 방법은 다음과 같습니다: 1. 네트워크 케이블 연결 확인\n2. 공유기 재시작\n3. IP 설정 확인",
                metadata: {
                    issue_type: "네트워크 연결 오류",
                    symptom: "인터넷 연결이 끊어지거나 불안정함",
                    solution: "1. 네트워크 케이블 연결 확인\n2. 공유기 재시작\n3. IP 설정 확인",
                    department: "네트워크관리팀",
                    contact: "02-123-4567",
                    source: "업무 안내 가이드(장애_문의).csv",
                    record_type: "issue",
                    question: "네트워크 연결 오류 해결 방법"
                }
            },
            {
                text: "서버 접속 불가의 증상은 \"특정 서버에 연결할 수 없음\"입니다. 조치 방법은 다음과 같습니다: 1. 서버 IP 주소 확인\n2. 방화벽 설정 확인\n3. VPN 연결 상태 확인",
                metadata: {
                    issue_type: "서버 접속 불가",
                    symptom: "특정 서버에 연결할 수 없음",
                    solution: "1. 서버 IP 주소 확인\n2. 방화벽 설정 확인\n3. VPN 연결 상태 확인",
                    department: "서버운영팀",
                    contact: "02-123-8901",
                    source: "업무 안내 가이드(장애_문의).csv",
                    record_type: "issue",
                    question: "서버 접속 안됨"
                }
            },
            {
                text: "금융결제원 시스템(10.10.20.5)에 접속하려면 VPN 연결 후 전용 클라이언트 사용이(가) 필요합니다.",
                metadata: {
                    system_name: "금융결제원 시스템",
                    ip: "10.10.20.5",
                    access_method: "VPN 연결 후 전용 클라이언트 사용",
                    required_permission: "금결원 접속권한",
                    contact_person: "박지민 (02-345-6789)",
                    source: "업무 안내 가이드(대외계_연동).csv",
                    record_type: "external",
                    question: "금융결제원 시스템 접속 방법"
                }
            },
            {
                text: "신한금융지주 시스템(10.10.30.8)에 접속하려면 전용 VPN 연결이(가) 필요합니다.",
                metadata: {
                    system_name: "신한금융지주 시스템",
                    ip: "10.10.30.8",
                    access_method: "전용 VPN 연결",
                    required_permission: "지주사 시스템 접근권한",
                    contact_person: "최준호 (02-456-7890)",
                    source: "업무 안내 가이드(대외계_연동).csv",
                    record_type: "external",
                    question: "신한금융지주 시스템 연결 방법"
                }
            }
        ];
    }
    
    // 초기 데이터 로드 함수
    async function initializeData() {
        try {
            // offlineStorage 객체가 있는지 확인
            if (!offlineStorage || typeof offlineStorage.getDataCount !== 'function') {
                console.error('오프라인 저장소 객체가 초기화되지 않았습니다.');
                return false;
            }
            
            // 데이터 수 확인
            const count = await offlineStorage.getDataCount();
            
            // 데이터가 없는 경우에만 샘플 데이터 추가
            if (count === 0) {
                console.log('IndexedDB에 데이터가 없습니다. 샘플 데이터를 추가합니다.');
                const sampleData = createSampleData();
                await offlineStorage.saveData(sampleData);
                console.log(`${sampleData.length}개의 샘플 데이터가 IndexedDB에 저장되었습니다.`);
                return true;
            } else {
                console.log(`이미 ${count}개의 데이터가 IndexedDB에 저장되어 있습니다.`);
                return true;
            }
        } catch (error) {
            console.error('샘플 데이터 초기화 중 오류 발생:', error);
            return false;
        }
    }
    
    // 공개 API
    return {
        initialize: initializeData
    };
})();

// 페이지 로드 시 자동으로 샘플 데이터 초기화
document.addEventListener('DOMContentLoaded', async function() {
    // offlineStorage가 초기화된 후 실행하기 위해 짧은 지연 추가
    setTimeout(async function() {
        await window.offlineDataInitializer.initialize();
    }, 1000);
});