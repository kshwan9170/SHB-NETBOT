
import streamlit as st
import os
from PyPDF2 import PdfReader

st.set_page_config(page_title="SHB-NetBot 파일 업로드 테스트", layout="centered")
st.title("📄 SHB-NetBot - 파일 업로드 테스트")

uploaded_file = st.file_uploader("문서를 업로드하세요 (PDF만 지원)", type=["pdf"])

if uploaded_file is not None:
    st.success(f"파일 '{uploaded_file.name}' 업로드 완료")

    # 파일을 메모리에 저장하지 않고 바로 처리
    try:
        reader = PdfReader(uploaded_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"

        st.subheader("📘 추출된 문서 내용:")
        st.text_area("문서 본문", text, height=300)

    except Exception as e:
        st.error(f"문서 처리 중 오류 발생: {e}")
