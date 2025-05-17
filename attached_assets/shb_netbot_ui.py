
import streamlit as st

st.set_page_config(page_title="SHB-NetBot", layout="centered")
st.title("🤖 SHB-NetBot")
st.markdown("신한은행 내부 네트워크 챗봇입니다. 네트워크 관련 질문을 입력해보세요.")

st.markdown("---")

if "chat_history" not in st.session_state:
    st.session_state.chat_history = [
        {"role": "bot", "message": "안녕하세요! 신한은행 네트워크 챗봇입니다. 네트워크 관련 질문이 있으시면 언제든지 물어보세요."}
    ]

# 말풍선 스타일 CSS 추가
st.markdown("""
<style>
.user-bubble {
    background-color: #DCF8C6;
    padding: 10px 15px;
    border-radius: 20px;
    margin: 5px 0;
    align-self: flex-end;
    max-width: 70%;
    margin-left: auto;
}

.bot-bubble {
    background-color: #f1f0f0;
    padding: 10px 15px;
    border-radius: 20px;
    margin: 5px 0;
    align-self: flex-start;
    max-width: 70%;
    margin-right: auto;
}

.chat-container {
    display: flex;
    flex-direction: column;
}
</style>
""", unsafe_allow_html=True)

# 채팅 기록 출력
for chat in st.session_state.chat_history:
    bubble_class = "user-bubble" if chat["role"] == "user" else "bot-bubble"
    st.markdown(f'<div class="chat-container"><div class="{bubble_class}">{chat["message"]}</div></div>', unsafe_allow_html=True)

# 입력창
user_input = st.text_input("메시지를 입력하세요...", key="input")

if st.button("보내기"):
    if user_input.strip() != "":
        # 사용자 입력 저장
        st.session_state.chat_history.append({"role": "user", "message": user_input})

        # 간단한 예시 응답 (실제론 OpenAI API 호출)
        response = "이 부분에 GPT 응답을 넣을 수 있습니다."
        st.session_state.chat_history.append({"role": "bot", "message": response})

        # 입력창 초기화
        st.session_state.input = ""
