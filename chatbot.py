import os
from typing import List, Dict, Any, Optional
import json
import openai
import re
from openai import OpenAI
from database import search_similar_docs

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

def detect_language(text: str) -> str:
    """
    텍스트의 언어를 감지합니다.
    
    Args:
        text: 감지할 텍스트
    
    Returns:
        언어 코드 ('ko' 또는 'en')
    """
    # 한글 문자가 포함되어 있는지 확인
    if re.search(r'[가-힣]', text):
        return 'ko'
    else:
        return 'en'

def get_chatbot_response(
    query: str, 
    context: Optional[str] = None, 
    chat_history: Optional[List[Dict[str, str]]] = None,
    model: str = "gpt-3.5-turbo"
) -> str:
    """
    Get a response from the chatbot for the given query
    
    Args:
        query: User's query
        context: Optional context from retrieved documents
        chat_history: Optional chat history
        model: OpenAI model to use
        
    Returns:
        Response from the chatbot
    """
    if not OPENAI_API_KEY:
        return "Error: OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable."
    
    try:
        # 사용자 질문의 언어 감지
        language = detect_language(query)
        
        # Prepare the system message based on language
        if language == 'ko':
            system_message = """
            당신은 신한은행 직원들을 위한 SHB-NetBot이라는 도움이 되는 비서입니다.
            네트워크 관련 질문에 정확하고 전문적인 답변을 제공합니다.
            도움을 줄 수 있는 주제의 예시:
            - SWING(내부 메시징 시스템) 접속 방법
            - IP 주소 확인 방법
            - 네트워크 연결 문제 해결
            - VPN 설정 및 연결 문제
            - 내부 시스템 접근 절차
            
            항상 공손하고, 직접적이며, 도움이 되도록 답변해주세요. 답을 모른다면, 명확하게 말해주세요.
            답변을 적절한 간격과 구조로 명확하게 포맷팅해 주세요.
            """
            
            if context:
                system_message += """
                신한은행의 내부 문서에서 다음 정보를 사용하여 응답에 활용하세요.
                정보가 질문에 완전히 답변하지 않으면, 당신의 지식을 활용하여 보충하세요.
                
                문맥 정보:
                """
                system_message += context
        else:
            system_message = """
            You are SHB-NetBot, a helpful assistant for Shinhan Bank employees.
            You provide accurate and professional responses about network-related queries.
            Examples of topics you can help with include:
            - SWING (internal messaging system) access instructions
            - How to check IP addresses
            - Network connectivity troubleshooting
            - VPN setup and connection issues
            - Internal system access procedures
            
            Always be polite, direct, and helpful. If you don't know the answer, say so clearly.
            Format your responses clearly with proper spacing and structure.
            """
            
            if context:
                system_message += """
                Use the following information from Shinhan Bank's internal documents to inform your response.
                If the information doesn't fully answer the query, use your knowledge to supplement it.
                
                CONTEXT INFORMATION:
                """
                system_message += context
        
        # 메시지 목록 준비
        messages = []
        messages.append({"role": "system", "content": system_message})
        
        # 채팅 기록 추가
        if chat_history:
            for msg in chat_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role in ["user", "assistant"]:
                    messages.append({"role": role, "content": content})
        
        # 현재 질문 추가
        messages.append({"role": "user", "content": query})
        
        # OpenAI에서 응답 받기
        response = openai_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
        )
        
        # 응답 처리
        response_content = response.choices[0].message.content
        
        # None 값인 경우 대비 (거의 발생하지 않음)
        if not response_content:
            if language == 'ko':
                return "죄송합니다. 응답을 생성할 수 없습니다. 나중에 다시 시도해주세요."
            else:
                return "Sorry, I couldn't generate a response. Please try again later."
        
        return response_content
    
    except Exception as e:
        # 오류 메시지도 언어에 맞게 반환
        language = detect_language(query)
        if language == 'ko':
            return f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}"
        else:
            return f"An error occurred while generating chatbot response: {str(e)}"
