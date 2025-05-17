import os
from typing import List, Dict, Any, Optional, Tuple
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
                
                total_docs = len(old_data['documents'])
                print(f"Migrating {total_docs} documents to new collection '{COLLECTION_NAME}'")
                
                # 청크 단위로 마이그레이션 (OpenAI API 토큰 제한 때문에)
                # 한 번에 최대 100개씩 처리
                BATCH_SIZE = 100
                batches = (total_docs + BATCH_SIZE - 1) // BATCH_SIZE  # 올림 나눗셈
                
                # 청크별 처리
                for batch_idx in range(batches):
                    start_idx = batch_idx * BATCH_SIZE
                    end_idx = min(start_idx + BATCH_SIZE, total_docs)
                    
                    print(f"Processing batch {batch_idx+1}/{batches} (documents {start_idx}-{end_idx-1})")
                    
                    # 현재 배치의 데이터 추출
                    batch_documents = old_data['documents'][start_idx:end_idx]
                    batch_ids = old_data['ids'][start_idx:end_idx]
                    batch_metadatas = old_data['metadatas'][start_idx:end_idx]
                    
                    # 메타데이터가 None인 경우 빈 딕셔너리로 대체
                    processed_metadatas = []
                    for metadata in batch_metadatas:
                        if metadata is None:
                            processed_metadatas.append({})
                        else:
                            processed_metadatas.append(metadata)
                    
                    # 새 컬렉션에 데이터 추가
                    collection.add(
                        documents=batch_documents,
                        ids=batch_ids,
                        metadatas=processed_metadatas
                    )
                    
                    print(f"Migrated batch {batch_idx+1}/{batches}")
                
                print(f"Successfully migrated all data to '{COLLECTION_NAME}'")
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
    top_k: int = 5,
    filter_doc: Optional[str] = None
) -> List[Any]:
    """
    Search for similar documents in the vector database
    
    Args:
        query: The query to search for
        top_k: Number of results to return
        filter_doc: Optional document name to filter results (e.g., "cisco_guide")
        
    Returns:
        List of document objects with page_content and metadata
    """
    # Initialize the database
    collection = initialize_database()
    
    # 필터링 조건 설정 (특정 문서 유형만 검색)
    where_filter = None
    if filter_doc:
        where_filter = {"doc_name": filter_doc}
        print(f"문서 필터링 적용: {filter_doc}")
    
    # Search for similar documents
    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where_filter
    )
    
    # Format the results to mimic langchain Document objects for compatibility
    documents = []
    if results and 'documents' in results and results['documents'] and len(results['documents'][0]) > 0:
        for i, doc_text in enumerate(results['documents'][0]):
            doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
            documents.append(type('Document', (), {
                'page_content': doc_text,
                'metadata': doc_metadata
            }))
        
        # 결과를 찾았을 때 로그
        print(f"검색 성공: {len(documents)}개 문서 찾음")
    else:
        # 결과가 없을 때 로그
        print(f"필터 '{filter_doc}'로 검색 결과 없음")
    
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
