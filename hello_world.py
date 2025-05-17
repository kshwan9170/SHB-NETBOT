import streamlit as st

# 기본 페이지 설정
st.set_page_config(
    page_title="SHB-NetBot",
    page_icon="🏦",
    layout="wide"
)

# 간단한 인사말 표시
st.title("신한은행 네트워크 지원 챗봇")
st.write("안녕하세요! 신한은행 네트워크 지원 AI 챗봇입니다.")
st.success("앱이 성공적으로 실행되었습니다.")

# 기본 UI 요소 표시
st.header("주요 기능")
col1, col2, col3 = st.columns(3)

with col1:
    st.subheader("챗봇 상담")
    st.write("네트워크 관련 질문에 답변을 제공합니다.")
    
with col2:
    st.subheader("문서 관리")
    st.write("네트워크 문서를 업로드하고 관리할 수 있습니다.")
    
with col3:
    st.subheader("고객 지원")
    st.write("문의사항 및 피드백을 등록할 수 있습니다.")