import os
from typing import List, Dict, Any, Optional
import json
import openai
from openai import OpenAI
from database import search_similar_docs

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

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
        # Prepare the system message based on whether we have context
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
        
        # Prepare the messages
        messages = [{"role": "system", "content": system_message}]
        
        # Add chat history if provided
        if chat_history:
            messages.extend(chat_history)
        
        # Add the current query
        messages.append({"role": "user", "content": query})
        
        # Get the response from OpenAI
        response = openai_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1000,
        )
        
        return response.choices[0].message.content
    
    except Exception as e:
        return f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}"
