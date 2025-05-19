# SHB-NetBot 설정 파일

# Fine-tuned 모델 설정
FINE_TUNED_MODEL = {
    "enabled": True,
    "model_id": "ft:gpt-3.5-turbo-0613:shinhan-bank::shb-faq-v1",  # 실제 모델 ID로 업데이트됨
    "temperature": 0.3,
    "max_tokens": 500
}

# RAG 시스템 설정
RAG_SYSTEM = {
    "enabled": True,
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 800
}

# 키워드 기반 분기 설정
# 이 키워드가 포함된 질문은 Fine-tuned 모델 우선 사용
FAQ_KEYWORDS = [
    "VPN", "vpn", "브이피엔",
    "보안", "security",
    "접속", "연결", "connection",
    "IP", "ip", "아이피",
    "전화기", "phone",
    "망분리", "네트워크", "network",
    "프린터", "printer",
    "PC", "pc", "컴퓨터",
    "외부 접속", "외부접속",
    "비밀번호", "password",
    "인증서", "certificate",
    "USB", "usb", "저장장치",
    "방화벽", "firewall",
    "Wi-Fi", "wifi", "와이파이",
    "메신저"
]

# 로깅 설정
LOGGING = {
    "level": "INFO",  # 로깅 레벨: DEBUG, INFO, WARNING, ERROR, CRITICAL
    "log_file": "shb_netbot.log",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
}