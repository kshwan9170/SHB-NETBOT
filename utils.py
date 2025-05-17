from typing import List, Dict, Any, Optional

def format_chat_message(message: Dict[str, str]) -> str:
    """
    Format a chat message for display
    
    Args:
        message: Dictionary with 'role' and 'content' keys
        
    Returns:
        Formatted message string
    """
    role = message.get("role", "unknown")
    content = message.get("content", "")
    
    if role == "user":
        return f"**사용자**: {content}"
    elif role == "assistant":
        return f"**AI**: {content}"
    else:
        return f"**{role}**: {content}"

def get_chat_history(
    chat_history: List[Dict[str, str]], 
    max_messages: int = 5
) -> List[Dict[str, str]]:
    """
    Get the most recent chat history
    
    Args:
        chat_history: Full chat history
        max_messages: Maximum number of messages to include
        
    Returns:
        List of recent chat messages
    """
    # Skip the first message if it's the welcome message (from assistant)
    start_idx = 1 if (len(chat_history) > 0 and chat_history[0]["role"] == "assistant") else 0
    
    # Take only the most recent messages
    recent_history = chat_history[start_idx:][-max_messages*2:]
    
    return recent_history
