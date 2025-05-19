import os
import document_processor
import database
from pprint import pprint

def test_procedure_guide_processing():
    """Test the enhanced Excel procedure guide processing"""
    print("=" * 60)
    print("Testing Excel Procedure Guide Processing")
    print("=" * 60)
    
    # Path to the test Excel file
    excel_file_path = 'attached_assets/업무 안내 가이드_2025.05.19.xlsx'
    
    # Process the document
    print(f"\nProcessing Excel file: {excel_file_path}")
    chunks = document_processor.process_document(excel_file_path)
    
    # Display summary of chunks
    print(f"\nExtracted {len(chunks)} chunks from the Excel file")
    
    # Show metadata from a few chunks
    print("\nSample chunk metadata (first 3 chunks):")
    for i, chunk in enumerate(chunks[:3]):
        print(f"\nChunk {i+1}:")
        print(f"  Text (first 50 chars): {chunk['text'][:50]}...")
        print("  Metadata:")
        for key, value in chunk['metadata'].items():
            print(f"    {key}: {value}")
    
    # Count procedure guide chunks
    procedure_guide_chunks = [c for c in chunks if c['text'].startswith('[업무 안내]')]
    print(f"\nNumber of procedure guide chunks: {len(procedure_guide_chunks)}")
    
    # Test database integration
    print("\n" + "=" * 60)
    print("Testing Database Integration")
    print("=" * 60)
    
    # Add chunks to database
    print("\nAdding chunks to database...")
    success = database.add_document_embeddings(chunks)
    print(f"Database update success: {success}")
    
    # Test queries with different filters
    test_queries = [
        ("IP 주소는 어떻게 신청하나요?", {"content_type": "procedure_guide"}),
        ("LAN 공사 신청 방법을 알려주세요", {"content_type": "procedure_guide"}),
        ("자리 이동 시 필요한 절차는?", {"content_type": "procedure_guide"}),
        ("IP 사용자를 확인하는 방법", {"content_type": "procedure_guide"}),
        ("무선 DGW 문제 해결 방법", {"content_type": "procedure_guide"})
    ]
    
    print("\nTesting search queries with filters:")
    for query, filter in test_queries:
        print("\n" + "-" * 40)
        print(f"Query: '{query}'")
        print(f"Filter: {filter}")
        
        # Search with filter
        results = database.search_similar_docs(query, top_k=2, filter=filter)
        
        # Show results
        print(f"Found {len(results)} results:")
        for i, result in enumerate(results):
            print(f"\nResult {i+1}:")
            print(f"  Content: {result.page_content[:100]}...")
            print("  Metadata:")
            for key, value in result.metadata.items():
                print(f"    {key}: {value}")

if __name__ == "__main__":
    test_procedure_guide_processing()