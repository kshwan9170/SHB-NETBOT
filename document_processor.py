import os
from pathlib import Path
import tempfile
import re
import uuid
from typing import List, Dict, Any, Optional, Tuple

# Document processing libraries
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

try:
    import docx
except ImportError:
    docx = None

try:
    from pptx import Presentation
except ImportError:
    Presentation = None
    
try:
    import pandas as pd
except ImportError:
    pd = None

def process_document(file_path: str) -> List[Dict[str, Any]]:
    """
    Process a document file and extract text chunks with metadata
    
    Args:
        file_path: Path to the document file
        
    Returns:
        List of dictionaries containing text chunks and metadata
    """
    file_extension = Path(file_path).suffix.lower()
    filename = os.path.basename(file_path)
    doc_id = str(uuid.uuid4())
    
    chunks = []
    
    if file_extension == '.pdf':
        raw_chunks = extract_text_from_pdf(file_path)
    elif file_extension == '.docx':
        raw_chunks = extract_text_from_docx(file_path)
    elif file_extension == '.pptx':
        raw_chunks = extract_text_from_pptx(file_path)
    elif file_extension == '.xlsx' or file_extension == '.xls':
        raw_chunks = extract_text_from_excel(file_path)
    elif file_extension == '.txt':
        raw_chunks = extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file extension: {file_extension}")
    
    # Add metadata to each chunk
    for i, chunk in enumerate(raw_chunks):
        chunks.append({
            "doc_id": doc_id,
            "chunk_id": f"{doc_id}-{i}",
            "text": chunk,
            "metadata": {
                "filename": filename,
                "file_type": file_extension[1:],  # Remove the dot
                "chunk_index": i
            }
        })
    
    return chunks

def extract_text_from_pdf(file_path: str) -> List[str]:
    """Extract text from PDF files"""
    if PyPDF2 is None:
        raise ImportError("PyPDF2 is required for PDF processing")
    
    text_chunks = []
    
    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                page_text = page.extract_text()
                
                if page_text:
                    # Clean and chunk the text
                    chunks = chunk_text(page_text)
                    for chunk in chunks:
                        if len(chunk.strip()) > 20:  # Only keep meaningful chunks
                            text_chunks.append(chunk)
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
    
    return text_chunks

def extract_text_from_docx(file_path: str) -> List[str]:
    """Extract text from DOCX files"""
    if docx is None:
        raise ImportError("python-docx is required for DOCX processing")
    
    text_chunks = []
    
    try:
        doc = docx.Document(file_path)
        full_text = ""
        
        for para in doc.paragraphs:
            if para.text.strip():
                full_text += para.text + "\n"
        
        # Process tables separately to preserve structure
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_text:
                    full_text += row_text + "\n"
        
        chunks = chunk_text(full_text)
        for chunk in chunks:
            if len(chunk.strip()) > 20:
                text_chunks.append(chunk)
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
    
    return text_chunks

def extract_text_from_pptx(file_path: str) -> List[str]:
    """Extract text from PPTX files"""
    if Presentation is None:
        raise ImportError("python-pptx is required for PPTX processing")
    
    text_chunks = []
    
    try:
        prs = Presentation(file_path)
        full_text = ""
        
        for slide in prs.slides:
            slide_text = ""
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    slide_text += shape.text + "\n"
            
            if slide_text.strip():
                full_text += "--- Slide ---\n" + slide_text + "\n"
        
        chunks = chunk_text(full_text)
        for chunk in chunks:
            if len(chunk.strip()) > 20:
                text_chunks.append(chunk)
    except Exception as e:
        print(f"Error extracting text from PPTX: {e}")
    
    return text_chunks

def extract_text_from_txt(file_path: str) -> List[str]:
    """Extract text from TXT files"""
    text_chunks = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
            
            if content:
                chunks = chunk_text(content)
                for chunk in chunks:
                    if len(chunk.strip()) > 20:
                        text_chunks.append(chunk)
    except UnicodeDecodeError:
        # Try with different encoding if utf-8 fails
        try:
            with open(file_path, 'r', encoding='cp949') as file:  # Common Korean encoding
                content = file.read()
                
                if content:
                    chunks = chunk_text(content)
                    for chunk in chunks:
                        if len(chunk.strip()) > 20:
                            text_chunks.append(chunk)
        except Exception as e:
            print(f"Error extracting text from TXT with cp949 encoding: {e}")
    except Exception as e:
        print(f"Error extracting text from TXT: {e}")
    
    return text_chunks

def extract_text_from_excel(file_path: str) -> List[str]:
    """Extract text from Excel files"""
    if pd is None:
        raise ImportError("pandas and openpyxl are required for Excel processing")
    
    text_chunks = []
    
    try:
        # Read all sheets
        excel_file = pd.ExcelFile(file_path)
        
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            
            # Convert DataFrame to string representations
            sheet_text = f"--- Sheet: {sheet_name} ---\n"
            
            # Add header row
            header_row = " | ".join([str(col) for col in df.columns])
            sheet_text += header_row + "\n"
            
            # Add separator
            sheet_text += "-" * len(header_row) + "\n"
            
            # Add data rows
            for _, row in df.iterrows():
                row_text = " | ".join([str(val) if not pd.isna(val) else "" for val in row])
                sheet_text += row_text + "\n"
            
            # Add empty line between sheets
            sheet_text += "\n"
            
            # Chunk the sheet text
            chunks = chunk_text(sheet_text)
            for chunk in chunks:
                if len(chunk.strip()) > 20:
                    text_chunks.append(chunk)
    except Exception as e:
        print(f"Error extracting text from Excel: {e}")
    
    return text_chunks

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """
    Split text into overlapping chunks of approximately chunk_size characters
    
    Args:
        text: The text to split into chunks
        chunk_size: Target size of each chunk
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of text chunks
    """
    # Clean the text
    text = re.sub(r'\s+', ' ', text).strip()
    
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        # Find the end of the chunk
        end = start + chunk_size
        
        if end >= len(text):
            chunks.append(text[start:])
            break
        
        # Try to end at a sentence or paragraph boundary
        sentence_end = text.rfind('. ', start, end)
        para_end = text.rfind('\n', start, end)
        
        # Choose the latest boundary found within the range
        if sentence_end > start + chunk_size // 2:
            end = sentence_end + 2  # Include the period and space
        elif para_end > start + chunk_size // 2:
            end = para_end + 1  # Include the newline
        
        chunks.append(text[start:end])
        start = end - overlap  # Create overlap with the next chunk
    
    return chunks
