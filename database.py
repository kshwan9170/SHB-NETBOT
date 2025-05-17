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
COLLECTION_NAME = "uploaded_docs"  # 요구사항에 맞게 컬렉션명 변경

# Create embedding function
embedding_function = embedding_functions.OpenAIEmbeddingFunction(
    api_key=OPENAI_API_KEY,
    model_name="text-embedding-3-small"
)

# Flag to track migration status
MIGRATION_DONE = False

def initialize_database():
    """Initialize or connect to the ChromaDB vector database"""
    global MIGRATION_DONE
    
    # Make sure the directory exists
    Path(CHROMA_DB_DIRECTORY).mkdir(parents=True, exist_ok=True)
    
    # Create or connect to the database
    chroma_client = chromadb.PersistentClient(
        path=CHROMA_DB_DIRECTORY,
        settings=Settings(anonymized_telemetry=False)
    )
    
    # 마이그레이션이 필요한지 확인 (이전 컬렉션 존재 여부)
    old_collection_name = "shinhan_documents"
    migrate_data = False
    
    if not MIGRATION_DONE:
        try:
            # 이전 컬렉션 확인
            old_collection = chroma_client.get_collection(
                name=old_collection_name,
                embedding_function=embedding_function
            )
            
            # 이전 컬렉션에 데이터가 있는지 확인
            old_data = old_collection.get()
            if old_data and 'documents' in old_data and len(old_data['documents']) > 0:
                print(f"Found {len(old_data['documents'])} documents in old collection '{old_collection_name}'")
                migrate_data = True
        except Exception:
            # 이전 컬렉션이 없으면 마이그레이션 필요 없음
            migrate_data = False
    
    # 새 컬렉션 생성 또는 연결
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
    
    # 마이그레이션 실행 (필요한 경우)
    if migrate_data and not MIGRATION_DONE:
        try:
            old_data = old_collection.get()
            
            # 문서, ID, 메타데이터가 모두 존재하는지 확인
            if ('documents' in old_data and 'ids' in old_data and
                'metadatas' in old_data and len(old_data['documents']) > 0):
                
                print(f"Migrating {len(old_data['documents'])} documents to new collection '{COLLECTION_NAME}'")
                
                # 메타데이터가 None인 경우 빈 딕셔너리로 대체
                metadatas = []
                for i, metadata in enumerate(old_data['metadatas']):
                    if metadata is None:
                        metadatas.append({})
                    else:
                        metadatas.append(metadata)
                
                # 새 컬렉션에 데이터 추가
                collection.add(
                    documents=old_data['documents'],
                    ids=old_data['ids'],
                    metadatas=metadatas
                )
                
                print(f"Successfully migrated data to '{COLLECTION_NAME}'")
                MIGRATION_DONE = True
            
        except Exception as e:
            print(f"Migration error: {str(e)}")
    
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
    
    # Check if query contains "넥스지" or "nexg" or other nexg-related terms
    nexg_keywords = ["넥스지", "nexg", "vforce", "넥스쥐", "axgate", "엑스게이트"]
    is_nexg_query = any(keyword.lower() in query.lower() for keyword in nexg_keywords)
    
    documents = []
    
    if is_nexg_query:
        # First attempt: Search with nexg_guide filter
        try:
            results = collection.query(
                query_texts=[query],
                n_results=top_k,
                where={"doc_name": "nexg_guide"}
            )
            
            # Process results
            if results and 'documents' in results and results['documents'] and results['documents'][0]:
                for i, doc_text in enumerate(results['documents'][0]):
                    doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
                    documents.append(type('Document', (), {
                        'page_content': doc_text,
                        'metadata': doc_metadata
                    }))
        except Exception as e:
            print(f"Error during filtered document search: {e}")
        
        # If no results from filtered search, try without filter (fallback)
        if not documents:
            print(f"No results found with nexg filter, trying unfiltered search for: {query}")
            try:
                results = collection.query(
                    query_texts=[query],
                    n_results=top_k
                )
                
                # Process results
                if results and 'documents' in results and results['documents'] and results['documents'][0]:
                    for i, doc_text in enumerate(results['documents'][0]):
                        doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
                        documents.append(type('Document', (), {
                            'page_content': doc_text,
                            'metadata': doc_metadata
                        }))
            except Exception as e:
                print(f"Error during fallback document search: {e}")
    else:
        # Normal search without filter for non-nexg queries
        try:
            results = collection.query(
                query_texts=[query],
                n_results=top_k
            )
            
            # Process results
            if results and 'documents' in results and results['documents'] and results['documents'][0]:
                for i, doc_text in enumerate(results['documents'][0]):
                    doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
                    documents.append(type('Document', (), {
                        'page_content': doc_text,
                        'metadata': doc_metadata
                    }))
        except Exception as e:
            print(f"Error during standard document search: {e}")
    
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

def delete_document(doc_id: str):
    """
    문서 ID에 해당하는 모든 청크를 벡터 DB에서 삭제합니다
    
    Args:
        doc_id: 삭제할 문서의 ID (UUID)
    """
    try:
        collection = initialize_database()
        
        # 문서 ID로 관련 청크 찾기 - 메타데이터에서 doc_id 필드 검색
        results = collection.get(
            where={"doc_id": doc_id}
        )
        
        if results and results['ids'] and len(results['ids']) > 0:
            # 해당 ID의 모든 청크 삭제
            collection.delete(ids=results['ids'])
            print(f"Deleted {len(results['ids'])} chunks for document ID: {doc_id}")
            return True
        else:
            # 이전 버전 호환성: chunk_id에서 doc_id 형식으로 검색
            all_chunks = collection.get()
            target_ids = []
            
            if all_chunks and 'ids' in all_chunks and all_chunks['ids']:
                for i, chunk_id in enumerate(all_chunks['ids']):
                    # 청크 ID가 "doc_id-번호" 형식이므로 doc_id로 시작하는지 확인
                    if chunk_id.startswith(f"{doc_id}-"):
                        target_ids.append(chunk_id)
            
            if target_ids:
                collection.delete(ids=target_ids)
                print(f"Deleted {len(target_ids)} chunks with IDs starting with: {doc_id}")
                return True
            else:
                print(f"No chunks found for document ID: {doc_id}")
                return False
    except Exception as e:
        print(f"Error deleting document from database: {e}")
        return False

def reset_database():
    """Reset the database by removing the directory"""
    if os.path.exists(CHROMA_DB_DIRECTORY):
        shutil.rmtree(CHROMA_DB_DIRECTORY)
        print(f"Removed database directory: {CHROMA_DB_DIRECTORY}")
