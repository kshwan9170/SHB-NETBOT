import os
from typing import List, Dict, Any, Optional, Tuple
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

def retrieve_relevant_documents(query: str, top_k: int = 5) -> Tuple[List[Any], str]:
    """
    질문과 관련된 문서를 검색하고 컨텍스트 문자열로 포맷팅합니다.
    
    Args:
        query: 사용자 질문
        top_k: 검색할 상위 문서 수
        
    Returns:
        (문서 리스트, 컨텍스트 문자열) 튜플
    """
    try:
        # 관련 문서 검색
        docs = search_similar_docs(query, top_k=top_k)
        
        # 문서가 없으면 빈 컨텍스트 반환
        if not docs or len(docs) == 0:
            return [], ""
        
        # 검색된 문서를 컨텍스트 문자열로 포맷팅
        context_str = "Context:\n"
        for i, doc in enumerate(docs):
            context_str += f"- ({i+1}) \"{doc.page_content}\"\n\n"
        
        return docs, context_str
    except Exception as e:
        print(f"ERROR: RAG pipeline failed during document retrieval: {str(e)}")
        return [], ""

def get_chatbot_response(
    query: str, 
    context: Optional[str] = None, 
    chat_history: Optional[List[Dict[str, str]]] = None,
    model: str = "gpt-3.5-turbo",
    use_rag: bool = True
) -> str:
    """
    Get a response from the chatbot for the given query
    
    Args:
        query: User's query
        context: Optional context from retrieved documents
        chat_history: Optional chat history
        model: OpenAI model to use
        use_rag: Whether to use RAG pipeline
        
    Returns:
        Response from the chatbot
    """
    if not OPENAI_API_KEY:
        return "Error: OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable."
    
    try:
        # 사용자 질문의 언어 감지
        language = detect_language(query)
        
        # RAG 파이프라인 적용 (필요시)
        retrieved_docs = []
        if use_rag and not context:
            retrieved_docs, context = retrieve_relevant_documents(query, top_k=5)
            if not context:
                if language == 'ko':
                    no_docs_message = "관련 문서를 찾지 못했습니다. 다른 키워드로 질문해 주세요."
                else:
                    no_docs_message = "No relevant documents found. Please try asking with different keywords."
                print(f"No relevant documents found for query: {query}")
                
        # Prepare the system message based on language
        if language == 'ko':
            system_message = """
            당신은 신한은행 직원들을 위한 SHB-NetBot이라는 네트워크 전문가입니다.
            당신은 "넥스지 VForce UTM"의 네트워크 엔지니어처럼 행동하며, 자신감 있고 전문적인 답변을 제공합니다.
            
            중요: 응답을 다음과 같은 형식으로 구성해주세요:
            
            1. 전문가 톤: 자신감 있고 명확하게 설명하되, 친절한 태도를 유지합니다.
            
            2. 단계별 구성: 명확한 단계로 정보를 나누어 제공합니다.
               예) 1) 글로벌 설정 모드 진입, 2) 인터페이스 선택, 3) IP 할당 및 활성화, 4) 설정 저장
            
            3. CLI와 WebUI 예시 모두 제공: 
               - CLI 명령어는 코드 블록으로 명확하게 표시
               - WebUI 사용법은 간결한 단계로 요약
            
            4. 자연어 문장과 불릿 포인트 혼용:
               - 본문은 자연스러운 한국어로 설명
               - 핵심 단계나 기능은 불릿 리스트로 강조
            
            응답의 구조:
            - 먼저 개요와 해결책을 요약하여 시작합니다.
            - 그 다음 단계별 지침을 제공합니다.
            - CLI 명령어 예시를 코드 블록(```)으로 보여줍니다.
            - 필요하다면 Web UI 접근법도 설명합니다.
            - 주의사항이나 팁을 마지막에 추가합니다.
            
            모든 응답은 마크다운 형식으로 작성하여 가독성을 높이세요.
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
            You are SHB-NetBot, a network expert assistant for Shinhan Bank employees.
            Act as if you're a network engineer for "NexG VForce UTM" devices, providing confident and professional answers.
            
            Important: Structure your responses in the following format:
            
            1. Expert tone: Explain with confidence and clarity while maintaining a friendly attitude.
            
            2. Step-by-step structure: Divide information into clear stages.
               Example: 1) Enter global config mode, 2) Select interface, 3) Assign IP and activate, 4) Save configuration
            
            3. Provide both CLI and WebUI examples:
               - Display CLI commands clearly in code blocks
               - Summarize WebUI procedures in concise steps
            
            4. Mix natural language with bullet points:
               - Explain main concepts in natural flowing English
               - Highlight key steps or features with bullet lists
            
            Response structure:
            - Begin with an overview and summary of the solution
            - Provide step-by-step instructions next
            - Show CLI command examples in code blocks (```)
            - Explain Web UI approach if applicable
            - Add cautions or tips at the end
            
            Format all responses in Markdown to enhance readability.
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
