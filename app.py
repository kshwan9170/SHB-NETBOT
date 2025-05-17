import streamlit as st
import os

st.set_page_config(page_title="SHB-NetBot 문서 테스트", layout="centered")
st.title("📄 SHB-NetBot - 문서 처리 테스트")

st.markdown("""
### 📝 문서 내용 직접 입력
파일 업로드 대신 문서 내용을 직접 입력하여 테스트할 수 있습니다.
""")

# 탭 생성
tab1, tab2 = st.tabs(["텍스트 입력", "예시 문서"])

with tab1:
    text_input = st.text_area(
        "문서 내용을 붙여넣으세요", 
        height=200,
        placeholder="여기에 문서 내용을 복사하여 붙여넣으세요..."
    )
    
    if st.button("처리하기") and text_input:
        st.success("텍스트 처리 완료!")
        
        # 입력된 텍스트 표시
        st.subheader("📘 처리된 문서 내용:")
        st.text_area("문서 본문", text_input, height=300)
        
        # 단어 수 계산
        words = len(text_input.split())
        chars = len(text_input)
        st.info(f"문서 통계: {words}개 단어, {chars}개 문자")

with tab2:
    st.subheader("예시 문서")
    if st.button("예시 문서 사용하기"):
        sample_text = """
# 신한은행 네트워크 매뉴얼

## 스윙(SWING) 접속 방법
1. 스윙 아이콘을 더블 클릭하여 실행합니다.
2. 사원번호와 비밀번호를 입력합니다.
3. OTP 인증을 완료합니다.
4. 로그인 후 좌측 메뉴에서 원하는 기능을 선택합니다.

## IP 확인 방법
1. 시작 메뉴에서 'cmd'를 입력하여 명령 프롬프트를 실행합니다.
2. 'ipconfig'를 입력하고 Enter를 누릅니다.
3. 'IPv4 주소'를 확인합니다.

## VPN 연결 방법
1. VPN 클라이언트를 실행합니다.
2. 'shb.vpn.net' 서버 주소를 입력합니다.
3. 사용자 계정과 비밀번호를 입력합니다.
4. 연결 버튼을 클릭합니다.
"""
        st.success("예시 문서 처리 완료!")
        
        # 예시 텍스트 표시
        st.subheader("📘 예시 문서 내용:")
        st.text_area("문서 본문", sample_text, height=300)
        
        # 단어 수 계산
        words = len(sample_text.split())
        chars = len(sample_text)
        st.info(f"문서 통계: {words}개 단어, {chars}개 문자")