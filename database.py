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
) -> bool:
    """
    Add document chunks to the vector database
    
    Args:
        chunks: List of dictionaries containing text chunks and metadata
               Each dict should have: {"text": str, "doc_id": str, "chunk_id": str, "metadata": dict}
               
    Returns:
        Boolean indicating whether documents were added (True) or not (False)
    """
    if not chunks:
        return False
    
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
    return True

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
    
    # 키워드 필터링을 위한 정의
    keyword_filters = {
        "nexg": ["넥스지", "nexg", "vforce", "넥스쥐", "axgate", "엑스게이트", "브이포스", "v-force", "vforceㅡ", "브이포스-utm"],
        "cisco": ["시스코", "cisco", "nexus", "넥서스", "aci", "스위치", "라우터", "switch", "router"],
        "alteon": ["알티온", "alteon", "radware", "라드웨어", "로드밸런서", "load balancer", "lb"],
    }
    
    # 사용자 질문에서 장비 유형 키워드 감지
    detected_vendors = []
    for vendor, keywords in keyword_filters.items():
        if any(keyword.lower() in query.lower() for keyword in keywords):
            detected_vendors.append(vendor)
    
    documents = []
    
    # 1단계: 검색 전략 - 특정 파일명/메타데이터 우선 필터링
    if detected_vendors:
        print(f"메타데이터 필터링 검색 시도: {', '.join(detected_vendors)}")
        
        # 각 벤더별로 필터링 시도
        for vendor in detected_vendors:
            # 필터링 조건 정의
            try:
                # 파일명에 키워드가 포함된 문서 필터링
                # ChromaDB는 $contains 연산자를 지원하지 않으므로 
                # 키워드 기반 매칭은 후처리 로직으로 처리
                print(f"{vendor} 키워드로 검색을 시도합니다")
                
                # 일단 전체 검색 실행
                results = collection.query(
                    query_texts=[query],
                    n_results=top_k
                )
                
                # 검색 결과가 있으면 벤더 키워드 포함 여부를 확인하여 필터링
                if results and 'documents' in results and results['documents'] and results['documents'][0]:
                    filtered_indices = []
                    
                    # 메타데이터와 내용에서 키워드 필터링
                    for i, doc_text in enumerate(results['documents'][0]):
                        meta = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] and i < len(results['metadatas'][0]) else {}
                        source = meta.get('source', '')
                        doc_name = meta.get('doc_name', '')
                        
                        # 메타데이터나 내용에 벤더 키워드가 포함된 경우 필터링
                        # 문자열 체크 전 타입 확인 및 안전한 소문자 변환
                        if (source and isinstance(source, str) and vendor.lower() in source.lower()) or \
                           (doc_name and isinstance(doc_name, str) and vendor.lower() in doc_name.lower()) or \
                           (doc_text and isinstance(doc_text, str) and vendor.lower() in doc_text.lower()):
                            filtered_indices.append(i)
                    
                    if filtered_indices:
                        print(f"{vendor} 관련 문서에서 {len(filtered_indices)} 개의 결과를 찾았습니다")
                        # 필터링된 결과만 사용
                        filtered_docs = [results['documents'][0][i] for i in filtered_indices]
                        filtered_meta = [results['metadatas'][0][i] for i in filtered_indices] if 'metadatas' in results and results['metadatas'] else []
                        
                        # results 객체 업데이트
                        results['documents'][0] = filtered_docs
                        if 'metadatas' in results and results['metadatas']:
                            results['metadatas'][0] = filtered_meta
                
                # 결과 처리
                if results and 'documents' in results and results['documents'] and results['documents'][0]:
                    print(f"{vendor} 관련 문서에서 {len(results['documents'][0])} 개의 결과를 찾았습니다.")
                    for i, doc_text in enumerate(results['documents'][0]):
                        doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
                        documents.append(type('Document', (), {
                            'page_content': doc_text,
                            'metadata': doc_metadata
                        }))
                    
                    # 충분한 결과를 찾았으면 더 이상 검색하지 않음
                    if len(documents) >= top_k:
                        print(f"{len(documents)} 개의 결과를 찾아 검색 완료")
                        return documents[:top_k]
                        
            except Exception as e:
                print(f"{vendor} 문서 검색 중 오류 발생: {str(e)}")
    
    # 2단계: Fallback - 필터링 결과가 없거나 충분하지 않은 경우 전체 검색
    if not documents or len(documents) < top_k:
        print(f"벤더 필터링 검색 결과가 없어 전체 문서 검색을 시도합니다: {query}")
        try:
            results = collection.query(
                query_texts=[query],
                n_results=top_k
            )
            
            # 결과 처리
            if results and 'documents' in results and results['documents'] and results['documents'][0]:
                print(f"전체 문서 검색에서 {len(results['documents'][0])} 개의 결과를 찾았습니다.")
                
                # 기존 결과에 추가 (중복 제거)
                existing_texts = set(doc.page_content for doc in documents)
                
                for i, doc_text in enumerate(results['documents'][0]):
                    # 중복 검사
                    if doc_text not in existing_texts:
                        doc_metadata = results['metadatas'][0][i] if 'metadatas' in results and results['metadatas'] else {}
                        documents.append(type('Document', (), {
                            'page_content': doc_text,
                            'metadata': doc_metadata
                        }))
                        existing_texts.add(doc_text)
        except Exception as e:
            print(f"전체 문서 검색 중 오류 발생: {str(e)}")
    
    # 최종 결과는 최대 top_k 개수로 제한
    return documents[:top_k]

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

def get_all_document_ids():
    """
    벡터 데이터베이스에 저장된 모든 문서 ID를 가져옵니다
    
    Returns:
        Set of unique document IDs
    """
    try:
        # 데이터베이스 연결
        collection = initialize_database()
        
        # 메타데이터에서 문서 ID 추출
        doc_ids = set()
        
        # 모든 메타데이터 가져오기
        try:
            results = collection.get()
            
            if results and 'metadatas' in results and results['metadatas']:
                for metadata in results['metadatas']:
                    if metadata and 'doc_id' in metadata:
                        doc_ids.add(metadata['doc_id'])
        except Exception as e:
            print(f"메타데이터 조회 오류: {str(e)}")
        
        # 청크 ID에서 문서 ID 추출 (이전 버전 호환성)
        try:
            all_ids = collection.get()['ids']
            for chunk_id in all_ids:
                if '-' in chunk_id:
                    doc_id = chunk_id.split('-')[0]
                    doc_ids.add(doc_id)
        except Exception as e:
            print(f"청크 ID 처리 오류: {str(e)}")
            
        return doc_ids
    except Exception as e:
        print(f"문서 ID 목록 조회 오류: {str(e)}")
        return set()

def update_document_embeddings(doc_id: str, chunks: List[Dict[str, Any]]) -> bool:
    """
    문서의 기존 임베딩을 삭제하고 새로운 임베딩으로 교체합니다
    
    Args:
        doc_id: 업데이트할 문서의 ID (UUID)
        chunks: 새로운 텍스트 청크와 메타데이터 목록
               각 딕셔너리는 {"text": str, "doc_id": str, "chunk_id": str, "metadata": dict} 형식
               
    Returns:
        업데이트 성공 여부 (True/False)
    """
    if not chunks:
        return False
    
    try:
        # 벡터 데이터베이스 연결
        collection = initialize_database()
        
        # 1. 기존 문서 청크 삭제
        delete_result = delete_document(doc_id)
        
        # 2. 새로운 청크 추가
        # 데이터 추출
        texts = [chunk["text"] for chunk in chunks]
        ids = [chunk["chunk_id"] for chunk in chunks]
        metadatas = [chunk["metadata"] for chunk in chunks]
        
        # 새 임베딩 추가
        collection.add(
            documents=texts,
            ids=ids,
            metadatas=metadatas
        )
        
        print(f"Updated document {doc_id} with {len(chunks)} chunks")
        return True
        
    except Exception as e:
        print(f"Error updating document embeddings: {e}")
        return False

def reset_database():
    """Reset the database by removing the directory"""
    if os.path.exists(CHROMA_DB_DIRECTORY):
        shutil.rmtree(CHROMA_DB_DIRECTORY)
        print(f"Removed database directory: {CHROMA_DB_DIRECTORY}")
