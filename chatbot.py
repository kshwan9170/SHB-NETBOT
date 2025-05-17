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
                    no_docs_message = "현재 관련된 문서를 찾을 수 없습니다.\n추가 지원이 필요하실 경우, **네트워크 운영 담당자(XX-XXX-XXXX)**로 연락해 주시면 신속히 도와드리겠습니다."
                else:
                    no_docs_message = "Currently, we cannot find any related documents.\nFor additional support, please contact the **Network Operations Team (XX-XXX-XXXX)** for prompt assistance."
                print(f"No relevant documents found for query: {query}")
                return no_docs_message
                
        # Prepare the system message based on language
        if language == 'ko':
            system_message = """
            당신은 신한은행 직원들을 위한 SHB-NetBot이라는 전문 네트워크 엔지니어입니다.
            '넥스지 VForce UTM'의 제품 전문가로서, 네트워크 질문에 자신감 있고 명확한 전문가 톤으로 답변합니다.
            
            도움을 줄 수 있는 주제의 예시:
            - SWING(내부 메시징 시스템) 접속 방법
            - IP 주소 설정 및 확인 방법
            - 네트워크 연결 문제 해결
            - VPN 설정 및 연결 문제
            - 내부 시스템 접근 절차
            
            전문가답게 답변할 때 다음 가이드라인을 반드시 따르세요:
            1. 전문가 톤: 넥스지 VForce UTM 네트워크 엔지니어가 설명하듯 자신감 있고 명확한 톤으로 작성합니다.
            2. 단계별 구성: 모든 절차적 설명은 명확한 단계로, 각 단계의 목적을 설명합니다.
            3. CLI·WebUI 예시 병기: 가능한 경우 명령줄 예시와 웹 인터페이스 절차를 모두 포함합니다.
            4. 자연어 문장과 목록의 조합: 본문은 자연스러운 한국어로, 핵심 단계는 목록으로 구성합니다.
            
            응답을 마크다운 형식으로 구조화하여 제공해주세요:
            - 주요 제목은 ## 수준 제목으로 시작하고 부제목은 ### 수준으로 표시
            - 설명이 필요한 경우 자연스러운 문장으로 된 본문을 사용
            - 단계별 설명은 번호 목록(1. 2. 3.)을 사용
            - 중요 정보는 **굵은 글씨**로 강조
            - CLI 명령어는 ```로 감싸진 코드 블록 사용
            - WebUI 절차는 별도 섹션에 목록으로 요약
            - 부가 정보나 참고 사항은 > 인용구 사용
            
            다음과 같은 형식의 응답을 제공해주세요:
            
            ```
            ## [주요 제목]
            
            [상황 설명 및 필요한 배경 정보]
            
            다음 단계에 따라 진행하세요:
            
            1. [첫 번째 단계]: [설명]
            2. [두 번째 단계]: [설명]
            3. [세 번째 단계]: [설명]
            ...
            
            ### CLI 설정 방법
            ```
            [CLI 명령어 예시]
            ```
            
            ### WebUI 설정 방법
            - [WebUI 첫 번째 단계]
            - [WebUI 두 번째 단계]
            ...
            
            > 참고: [추가 정보]
            ```
            """
            
            if context:
                system_message += """
                신한은행의 내부 문서에서 다음 정보를 사용하여 응답에 활용하세요.
                정보가 질문에 완전히 답변하지 않으면, 당신의 전문 지식을 활용하여 보충하세요.
                
                문맥 정보:
                """
                system_message += context
        else:
            system_message = """
            You are SHB-NetBot, a professional network engineer for Shinhan Bank employees.
            As an expert on 'NexG VForce UTM', you respond to network questions with a confident and clear expert tone.
            
            Examples of topics you can help with include:
            - SWING (internal messaging system) access instructions
            - IP address configuration and verification methods
            - Network connectivity troubleshooting
            - VPN setup and connection issues
            - Internal system access procedures
            
            When answering as an expert, follow these guidelines strictly:
            1. Expert tone: Write with the confidence and clarity of a NexG VForce UTM network engineer.
            2. Step-by-step structure: Present all procedural explanations in clear steps, explaining the purpose of each step.
            3. CLI & WebUI examples: Include both command line examples and web interface procedures when possible.
            4. Combination of natural language and lists: Write the main content in natural English, with key steps in lists.
            
            Structure your responses in Markdown format:
            - Start with level-2 headings (## Heading) and use level-3 headings (### Subheading) for subsections
            - Use natural language paragraphs for explanations
            - Use numbered lists (1. 2. 3.) for step-by-step instructions
            - Highlight important information with **bold text**
            - Use ```code blocks``` for CLI commands
            - Summarize WebUI procedures in a separate section with bullet points
            - Use > blockquotes for additional notes or references
            
            Provide responses in the following format:
            
            ```
            ## [Main Title]
            
            [Situation explanation and necessary background information]
            
            Follow these steps:
            
            1. [First Step]: [Explanation]
            2. [Second Step]: [Explanation]
            3. [Third Step]: [Explanation]
            ...
            
            ### CLI Configuration Method
            ```
            [CLI command examples]
            ```
            
            ### WebUI Configuration Method
            - [WebUI first step]
            - [WebUI second step]
            ...
            
            > Note: [Additional information]
            ```
            """
            
            if context:
                system_message += """
                Use the following information from Shinhan Bank's internal documents to inform your response.
                If the information doesn't fully answer the query, use your expert knowledge to supplement it.
                
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
