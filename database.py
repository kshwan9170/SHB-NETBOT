import os
from typing import List, Dict, Any, Optional
import json
from pathlib import Path
import shutil

# Vector database
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions

# OpenAI embedding model
import openai
from openai import OpenAI

# Initialize OpenAI client for embeddings
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# ChromaDB configuration
CHROMA_DB_DIRECTORY = "./chroma_db"
COLLECTION_NAME = "shinhan_documents"

# Create embedding function
embedding_function = embedding_functions.OpenAIEmbeddingFunction(
    api_key=OPENAI_API_KEY,
    model_name="text-embedding-3-small"
)

def initialize_database():
    """Initialize or connect to the ChromaDB vector database"""
    # Make sure the directory exists
    Path(CHROMA_DB_DIRECTORY).mkdir(parents=True, exist_ok=True)
    
    # Create or connect to the database
    chroma_client = chromadb.PersistentClient(
        path=CHROMA_DB_DIRECTORY,
        settings=Settings(anonymized_telemetry=False)
    )
    
    # Create or get the collection
    try:
        collection = chroma_client.get_collection(
            name=COLLECTION_NAME,
            embedding_function=embedding_function
        )
        print(f"Connected to existing collection: {COLLECTION_NAME}")
    except Exception:
        collection = chroma_client.create_collection(
            name=COLLECTION_NAME,
            embedding_function=embedding_function
        )
        print(f"Created new collection: {COLLECTION_NAME}")
    
    return collection

def add_document_embeddings(
    chunks: List[Dict[str, Any]]
):
    """
    Add document chunks to the vector database
    
    Args:
        chunks: List of dictionaries containing text chunks and metadata
               Each dict should have: {"text": str, "doc_id": str, "chunk_id": str, "metadata": dict}
    """
    if not chunks:
        return
    
    # Initialize the database
    collection = initialize_database()
    
    # Extract data from chunks
    texts = [chunk["text"] for chunk in chunks]
    ids = [chunk["chunk_id"] for chunk in chunks]
    metadatas = [chunk["metadata"] for chunk in chunks]
    
    # Add documents to the collection
    collection.add(
        documents=texts,
        ids=ids,
        metadatas=metadatas
    )
    
    print(f"Added {len(chunks)} document chunks to the database")

def search_similar_docs(
    query: str, 
    top_k: int = 3
) -> List[Any]:
    """
    Search for similar documents in the vector database
    
    Args:
        query: The query to search for
        top_k: Number of results to return
        
    Returns:
        List of document objects with page_content and metadata
    """
    # Initialize the database
    collection = initialize_database()
    
    # Search for similar documents
    results = collection.query(
        query_texts=[query],
        n_results=top_k,
    )
    
    # Format the results to mimic langchain Document objects for compatibility
    documents = []
    if results and 'documents' in results and results['documents']:
        for i, doc_text in enumerate(results['documents'][0]):
            doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
            documents.append(type('Document', (), {
                'page_content': doc_text,
                'metadata': doc_metadata
            }))
    
    return documents

def get_database_status():
    """
    Get status information about the database
    
    Returns:
        Dictionary with status information
    """
    try:
        # Initialize the database
        collection = initialize_database()
        
        # Get all IDs
        all_ids = collection.get()['ids']
        
        # Count unique documents based on metadata.source
        all_metadata = collection.get()['metadatas']
        unique_sources = set()
        for metadata in all_metadata:
            if metadata and 'source' in metadata:
                unique_sources.add(metadata['source'])
        
        return {
            "chunk_count": len(all_ids),
            "document_count": len(unique_sources)
        }
    except Exception as e:
        print(f"Error getting database status: {e}")
        return {
            "chunk_count": 0,
            "document_count": 0
        }

def reset_database():
    """Reset the database by removing the directory"""
    if os.path.exists(CHROMA_DB_DIRECTORY):
        shutil.rmtree(CHROMA_DB_DIRECTORY)
        print(f"Removed database directory: {CHROMA_DB_DIRECTORY}")
