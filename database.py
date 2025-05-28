import os
from typing import List, Dict, Any, Optional
import json
from pathlib import Path
import shutil

# Vector database
import chromadb
from chromadb.config import Settings
#from chromadb.utils import embedding_functions
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

# OpenAI embedding model
import openai
#from openai import OpenAI ##2025-05-29 12:58 수정 (##처리)


# Initialize OpenAI client for embeddings
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
#openai_client = OpenAI(api_key=OPENAI_API_KEY) ##2025-05-29 12:58 수정 (##처리)
openai.api_key = OPENAI_API_KEY

# ChromaDB configuration
CHROMA_DB_DIRECTORY = "./chroma_db"
COLLECTION_NAME = "uploaded_docs"  # 요구사항에 맞게 컬렉션명 변경

# Create embedding function
embedding_function = OpenAIEmbeddingFunction(
    api_key=OPENAI_API_KEY,
    model_name="text-embedding-ada-002"
)

# 마이그레이션 상태를 저장할 파일 경로
MIGRATION_STATUS_FILE = os.path.join(CHROMA_DB_DIRECTORY, "migration_completed.flag")

def initialize_database():
    """Initialize or connect to the ChromaDB vector database"""
    # Make sure the directory exists
    Path(CHROMA_DB_DIRECTORY).mkdir(parents=True, exist_ok=True)
    
    # 마이그레이션 완료 여부 확인 (파일 기반)
    migration_completed = os.path.exists(MIGRATION_STATUS_FILE)
    
    # Create or connect to the database
    chroma_client = chromadb.PersistentClient(
        path=CHROMA_DB_DIRECTORY,
        settings=Settings(anonymized_telemetry=False)
    )
    
    # 마이그레이션이 필요한지 확인 (이전 컬렉션 존재 여부)
    old_collection_name = "shinhan_documents"
    migrate_data = False
    old_collection = None
    
    if not migration_completed:
        try:
            # 이전 컬렉션 확인
            old_collection = chroma_client.get_collection(
                name=old_collection_name,
                embedding_function=embedding_function
            )
            
            # 이전 컬렉션에 데이터가 있는지 확인
            try:
                old_data = old_collection.get()
                if old_data and 'documents' in old_data and old_data['documents'] and len(old_data['documents']) > 0:
                    print(f"Found {len(old_data['documents'])} documents in old collection '{old_collection_name}'")
                    migrate_data = True
            except Exception as e:
                print(f"Error checking old collection: {e}")
                migrate_data = False
        except Exception:
            # 이전 컬렉션이 없으면 마이그레이션 필요 없음
            print("이전 컬렉션이 없습니다. 마이그레이션 불필요.")
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
    if migrate_data and not migration_completed and old_collection is not None:
        try:
            old_data = old_collection.get()
            
            # 문서, ID, 메타데이터가 모두 존재하는지 확인
            if ('documents' in old_data and 'ids' in old_data and
                'metadatas' in old_data and old_data['documents'] and len(old_data['documents']) > 0):
                
                print(f"Migrating {len(old_data['documents'])} documents to new collection '{COLLECTION_NAME}'")
                
                # 메타데이터가 None인 경우 빈 딕셔너리로 대체
                metadatas = []
                for i, metadata in enumerate(old_data['metadatas']):
                    if metadata is None:
                        metadatas.append({})
                    else:
                        metadatas.append(metadata)
                
                # 새 컬렉션에 데이터 추가 (배치 처리)
                batch_size = 100  # 한 번에 처리할 문서 수 (토큰 제한 문제 해결)
                total_docs = len(old_data['documents'])
                
                for i in range(0, total_docs, batch_size):
                    end_idx = min(i + batch_size, total_docs)
                    print(f"마이그레이션 배치 {i//batch_size + 1}/{(total_docs + batch_size - 1)//batch_size}: 문서 {i} ~ {end_idx-1}")
                    
                    try:
                        collection.add(
                            documents=old_data['documents'][i:end_idx],
                            ids=old_data['ids'][i:end_idx],
                            metadatas=metadatas[i:end_idx]
                        )
                    except Exception as e:
                        print(f"배치 {i//batch_size + 1} 마이그레이션 중 오류 발생: {str(e)}")
                        # 오류가 발생해도 계속 진행
                
                print(f"마이그레이션이 성공적으로 완료되었습니다: '{COLLECTION_NAME}'")
                
                # 마이그레이션 완료 표시 (파일 생성)
                with open(MIGRATION_STATUS_FILE, 'w') as f:
                    f.write("Migration completed")
                print("마이그레이션 완료 플래그 설정됨")
            
        except Exception as e:
            print(f"마이그레이션 오류: {str(e)}")
    
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
    
    # 배치 처리를 위한 설정
    batch_size = 100  # 한 번에 처리할 문서 수 (토큰 제한 문제 해결)
    
    # 전체 청크 수
    total_chunks = len(chunks)
    success_count = 0
    
    print(f"처리할 총 문서 청크 수: {total_chunks}")
    
    # 배치 단위로 처리
    for i in range(0, total_chunks, batch_size):
        end_idx = min(i + batch_size, total_chunks)
        current_batch = chunks[i:end_idx]
        
        # 현재 배치에서 데이터 추출
        texts = [chunk["text"] for chunk in current_batch]
        ids = [chunk["chunk_id"] for chunk in current_batch]
        metadatas = [chunk["metadata"] for chunk in current_batch]
        
        try:
            # 현재 배치 추가
            collection.add(
                documents=texts,
                ids=ids,
                metadatas=metadatas
            )
            success_count += len(current_batch)
            print(f"배치 {i//batch_size + 1}/{(total_chunks + batch_size - 1)//batch_size} 추가 완료: {i}~{end_idx-1} 청크")
        except Exception as e:
            print(f"배치 {i//batch_size + 1} 추가 중 오류 발생: {str(e)}")
            # 오류가 발생해도 계속 진행
    
    print(f"총 {success_count}/{total_chunks} 청크가 성공적으로 추가되었습니다.")
    
    print(f"Added {len(chunks)} document chunks to the database")
    return True

def search_similar_docs(
    query: str, 
    top_k: int = 3,
    filter: Optional[Dict[str, str]] = None
) -> List[Any]:
    """
    Search for similar documents in the vector database
    
    Args:
        query: The query to search for
        top_k: Number of results to return
        filter: Optional metadata filter dictionary (e.g., {"content_type": "procedure_guide"})
        
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
            
    # 메타데이터 필터 로직
    where_clause = {}
    
    # 벤더 필터링을 위한 where 조건
    if detected_vendors:
        # where_clause["vendor"] = {"$in": detected_vendors}
        print(f"장비 유형 필터링: {detected_vendors}")
    
    # 추가 필터링 (예: 특정 컨텐츠 타입으로 제한)
    if filter:
        for key, value in filter.items():
            where_clause[key] = value
            
    # 필터링 조건이 있는 경우 로그 출력
    if where_clause:
        print(f"메타데이터 필터 적용: {where_clause}")
    
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
                    n_results=top_k,
                    where=where_clause if where_clause else None
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
            # 메타데이터 필터 적용 (있는 경우)
            version_where = where_clause.copy() if where_clause else {}
            
            # 가이드 버전 필터 특별 처리 - 특정 버전 또는 최신 버전
            version_specified = False
            if "guide_version" in version_where and version_where["guide_version"] != "latest":
                version_specified = True
                print(f"특정 버전 가이드 검색: {version_where['guide_version']}")
            
            results = collection.query(
                query_texts=[query],
                n_results=top_k,
                where=version_where if version_where else None
            )
            
            # 만약 특정 버전 검색 결과가 없으면 최신 버전으로 대체 검색
            if version_specified and (not results or 'documents' not in results or not results['documents'] or not results['documents'][0]):
                print(f"특정 버전({version_where['guide_version']})에서 결과를 찾지 못해 최신 버전으로 검색합니다")
                
                # guide_version을 'latest'로 변경하여 다시 검색
                version_where["guide_version"] = "latest"
                results = collection.query(
                    query_texts=[query],
                    n_results=top_k,
                    where=version_where if version_where else None
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
        doc_id: 삭제할 문서의 ID (UUID 또는 파일명의 첫 부분)
    Returns:
        삭제 성공 여부 (True/False)
    """
    try:
        collection = initialize_database()
        deleted_chunks = 0
        
        # 1단계: 메타데이터에서 doc_id 필드로 검색
        try:
            results = collection.get(
                where={"doc_id": doc_id}
            )
            
            if results and results['ids'] and len(results['ids']) > 0:
                # 해당 ID의 모든 청크 삭제
                chunk_ids = results['ids']
                collection.delete(ids=chunk_ids)
                deleted_chunks += len(chunk_ids)
                print(f"Deleted {len(chunk_ids)} chunks for document ID: {doc_id}")
        except Exception as metadata_err:
            print(f"메타데이터 검색 중 오류: {str(metadata_err)}")
        
        # 2단계: 메타데이터에서 source 필드에 doc_id가 포함된 항목 검색
        try:
            # source 필드가 있는 모든 메타데이터 가져오기
            all_data = collection.get()
            if all_data and 'metadatas' in all_data and all_data['metadatas']:
                source_match_ids = []
                
                for i, metadata in enumerate(all_data['metadatas']):
                    # 메타데이터에 source가 있고 doc_id가 포함된 경우
                    if metadata and 'source' in metadata and isinstance(metadata['source'], str):
                        source = metadata['source']
                        if doc_id in source:
                            # 해당 청크 ID 추가
                            if i < len(all_data['ids']):
                                source_match_ids.append(all_data['ids'][i])
                
                if source_match_ids:
                    collection.delete(ids=source_match_ids)
                    deleted_chunks += len(source_match_ids)
                    print(f"Deleted {len(source_match_ids)} chunks with source containing: {doc_id}")
        except Exception as source_err:
            print(f"소스 필드 검색 중 오류: {str(source_err)}")
        
        # 3단계: 이전 버전 호환성 - 청크 ID에서 doc_id 형식으로 검색
        try:
            all_chunks = collection.get()
            target_ids = []
            
            if all_chunks and 'ids' in all_chunks and all_chunks['ids']:
                for chunk_id in all_chunks['ids']:
                    # 청크 ID가 "doc_id-번호" 형식이므로 doc_id로 시작하는지 확인
                    if isinstance(chunk_id, str) and (
                        chunk_id.startswith(f"{doc_id}-") or 
                        chunk_id.startswith(f"{doc_id}_")
                    ):
                        target_ids.append(chunk_id)
            
            if target_ids:
                collection.delete(ids=target_ids)
                deleted_chunks += len(target_ids)
                print(f"Deleted {len(target_ids)} chunks with IDs starting with: {doc_id}")
        except Exception as chunk_err:
            print(f"청크 ID 검색 중 오류: {str(chunk_err)}")
        
        # 삭제 결과 반환
        if deleted_chunks > 0:
            print(f"총 {deleted_chunks}개의 청크가 문서 ID {doc_id}와 관련하여 삭제되었습니다.")
            return True
        else:
            print(f"문서 ID {doc_id}에 해당하는 청크를 찾을 수 없습니다.")
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
