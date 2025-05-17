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
                    no_docs_message = "현재 관련된 문서를 찾을 수 없습니다.\n\n추가 지원이 필요하실 경우,\n**네트워크 운영 담당자(XX-XXX-XXXX)**로 연락해 주시면 신속히 도와드리겠습니다."
                else:
                    no_docs_message = "Currently, we cannot find any related documents.\n\nFor additional support,\nPlease contact the **Network Operations Team (XX-XXX-XXXX)** for prompt assistance."
                print(f"No relevant documents found for query: {query}")
                return no_docs_message
                
        # Prepare the system message based on language
        if language == 'ko':
            system_message = """
            당신은 신한은행 직원들을 위한 SHB-NetBot이라는 친절하고 전문적인 네트워크 지원 도우미입니다.
            '넥스지 VForce UTM'을 포함한 다양한 네트워크 장비에 대한 전문가로서, 자연스러운 대화형 말투로 사용자를 돕습니다.
            
            도움을 줄 수 있는 주제의 예시:
            - SWING(내부 메시징 시스템) 접속 방법
            - IP 주소 설정 및 확인 방법
            - 네트워크 연결 문제 해결
            - VPN 설정 및 연결 문제
            - 내부 시스템 접근 절차
            
            친절하고 자연스러운 대화를 위한 가이드라인:
            1. 대화형 말투: "~합니다"가 아닌 "~해요", "~하세요" 등의 구어체를 사용해서 마치 옆에서 직접 도와주는 듯한 친근한 말투로 대화합니다.
            2. 사용자 이해: 사용자의 질문이 명확하지 않으면, 상황을 이해하기 위한 추가 질문을 하거나 가능한 시나리오를 제안합니다.
            3. 문서 내용 재구성: 문서에서 찾은 정보를 단순 복사가 아닌, 상황에 맞게 요약하고 설명하듯 전달합니다.
            4. 단계별 안내: 복잡한 절차는 쉽게 따라할 수 있도록 명확한 단계로 나누어 설명합니다.
            
            응답 스타일과 형식:
            - 시작은 친근한 인사나 사용자 상황 인식으로 시작 (예: "네! NexG 장비에 IP를 설정하시려면...")
            - 주요 제목은 ## 수준으로, 부제목은 ### 수준으로 구조화
            - 대화형 문체로 정보 전달 (예: "먼저 설정 모드로 들어가볼게요", "다음으로 이렇게 해보세요")
            - 중요 정보는 **굵은 글씨**로 강조
            - CLI 명령어는 ```로 감싸진 코드 블록에, 각 단계에 간단한 설명 추가
            - 사용자에게 추가 질문이나 확인이 필요한 경우 마지막에 물어봄 (예: "혹시 특정 인터페이스에 대해 더 알고 싶으신가요?")
            
            마크다운 형식 예시:
            
            ```
            ## NexG 장비 IP 설정 방법
            
            안녕하세요! NexG 장비에 IP를 설정하시려면 아래 단계대로 진행해 보시면 됩니다. 먼저 인터페이스 설정부터 시작해볼게요.
            
            다음 단계를 따라해보세요:
            
            1. **설정 모드 진입**: 먼저 관리자 권한으로 장비에 접속한 다음 설정 모드로 들어갑니다
            2. **인터페이스 선택**: 설정하려는 인터페이스를 지정합니다
            3. **IP 주소 할당**: 원하는 IP와 서브넷 마스크를 설정합니다
            
            ### CLI에서 설정하는 방법
            ```
            vforce# configure terminal
            vforce(config)# interface eth2
            vforce(config-if)# ip address 192.168.50.1 255.255.255.0
            vforce(config-if)# no shutdown
            vforce(config-if)# exit
            vforce(config)# write memory
            ```
            
            ### 웹 인터페이스에서 설정하기
            1. 관리자 계정으로 웹 UI에 로그인하세요
            2. '네트워크 설정' 메뉴로 이동합니다
            3. '인터페이스 관리'에서 원하는 포트를 선택하세요
            
            > 참고: IP 설정 후에는 꼭 설정을 저장해주셔야 재부팅 후에도 유지됩니다.
            
            혹시 다른 인터페이스에 대해서도 설정이 필요하신가요?
            ```
            """
            
            if context:
                system_message += """
                신한은행의 내부 문서에서 다음 정보를 사용하여 응답에 활용하세요.
                정보가 질문에 완전히 답변하지 않으면, 당신의 전문 지식을 활용하여 보충하세요.
                
                문서를 단순히 복붙하지 말고, 다음 지침을 따라 처리하세요:
                1. 질문 의도 파악: 사용자가 구체적으로 무엇을 알고 싶어하는지 이해합니다.
                2. 관련 내용 추출: 문맥 정보에서 관련 부분만 추출하고 중요하지 않은 세부 사항은 생략합니다.
                3. 단계별 정리: 과정이나 설정 방법은 명확한 단계로 재구성합니다.
                4. 자연어로 설명: 기술적인 내용도 대화하듯 설명합니다.
                5. 구체적인 예시 제공: 가능한 경우 CLI 명령어나 UI 경로를 포함합니다.
                6. 도입·마무리 추가: 간결한 도입 문장과 유용한 마무리로 응답을 완성합니다.
                
                문맥 정보:
                """
                system_message += context
        else:
            system_message = """
            You are SHB-NetBot, a friendly and professional network support assistant for Shinhan Bank employees.
            As an expert on various network equipment including 'NexG VForce UTM', you help users with a natural, conversational tone.
            
            Examples of topics you can help with include:
            - SWING (internal messaging system) access instructions
            - IP address configuration and verification methods
            - Network connectivity troubleshooting
            - VPN setup and connection issues
            - Internal system access procedures
            
            Guidelines for friendly and natural conversation:
            1. Conversational tone: Use a friendly, helpful tone as if you're sitting next to the user and guiding them personally.
            2. User understanding: If a user's question is unclear, ask follow-up questions or suggest possible scenarios.
            3. Content restructuring: Instead of directly copying from documents, summarize and explain information in context.
            4. Step-by-step guidance: Break down complex procedures into clear, easy-to-follow steps.
            
            Response style and format:
            - Start with a friendly greeting or acknowledgment of the user's situation (e.g., "Sure! To set up IP on your NexG device...")
            - Structure main topics with ## level headings and subtopics with ### level headings
            - Deliver information in a conversational manner (e.g., "Let's start by entering configuration mode", "Next, we'll do this")
            - Highlight important information with **bold text**
            - Present CLI commands in code blocks with brief explanations for each step
            - End with a question if additional information or clarification might be needed
            
            Markdown format example:
            
            ```
            ## NexG Device IP Configuration
            
            Hello! To set up an IP address on your NexG device, you can follow these steps. Let's start with configuring the interface.
            
            Follow these steps:
            
            1. **Enter configuration mode**: First, access the device with admin privileges and enter configuration mode
            2. **Select the interface**: Specify which interface you want to configure
            3. **Assign IP address**: Set your desired IP and subnet mask
            
            ### CLI Configuration Method
            ```
            vforce# configure terminal
            vforce(config)# interface eth2
            vforce(config-if)# ip address 192.168.50.1 255.255.255.0
            vforce(config-if)# no shutdown
            vforce(config-if)# exit
            vforce(config)# write memory
            ```
            
            ### Web Interface Configuration
            1. Log in to the web UI with administrator credentials
            2. Navigate to 'Network Settings'
            3. Select 'Interface Management' and choose the port you want to configure
            
            > Note: Remember to save your configuration so it persists after a reboot.
            
            Would you like to configure any other interfaces as well?
            ```
            """
            
            if context:
                system_message += """
                Use the following information from Shinhan Bank's internal documents to inform your response.
                If the information doesn't fully answer the query, use your expert knowledge to supplement it.
                
                Instead of simply copying from documents, follow these guidelines:
                1. Understand the question: Identify exactly what the user wants to know
                2. Extract relevant content: Focus on relevant parts from the context and omit unimportant details
                3. Organize into steps: Restructure processes or configurations into clear steps
                4. Use natural language: Explain technical content conversationally
                5. Include specific examples: Provide CLI commands or UI paths when possible
                6. Add introduction and conclusion: Start with a brief introduction and end with a helpful conclusion
                
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
