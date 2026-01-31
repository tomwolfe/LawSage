import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).parent.parent
sys.path.append(str(root_dir))

from api.services.document_processor import DocumentProcessor
from api.services.vector_store import VectorStoreService

def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        sys.exit(1)

    vector_service = VectorStoreService(api_key=api_key)
    data_dir = root_dir / "data"
    
    if not data_dir.exists():
        print(f"Error: Data directory {data_dir} does not exist.")
        sys.exit(1)

    files = list(data_dir.glob("*"))
    if not files:
        print(f"No files found in {data_dir}")
        return

    for file_path in files:
        if file_path.suffix.lower() in [".pdf", ".docx", ".txt"]:
            print(f"Processing {file_path.name}...")
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                
                if file_path.suffix.lower() == ".pdf":
                    text = DocumentProcessor.extract_text_from_pdf(content)
                elif file_path.suffix.lower() == ".docx":
                    text = DocumentProcessor.extract_text_from_docx(content)
                else:
                    text = content.decode("utf-8", errors="ignore")
                
                if not text.strip():
                    print(f"Warning: No text extracted from {file_path.name}")
                    continue

                chunks = DocumentProcessor.chunk_text(text)
                metadatas = [{"source": file_path.name, "jurisdiction": "California"}] * len(chunks) # Defaulting to California for now
                vector_service.add_documents(chunks, metadatas=metadatas)
                print(f"Added {len(chunks)} chunks from {file_path.name}")
            except Exception as e:
                print(f"Error processing {file_path.name}: {e}")

if __name__ == "__main__":
    main()
