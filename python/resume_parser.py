
from pathlib import Path


def extract_text(file_path):
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == '.pdf':
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        return '\n'.join(
            page.extract_text() or '' for page in reader.pages
        )

    if suffix == '.docx':
        from docx import Document
        doc = Document(str(path))
        return '\n'.join(p.text for p in doc.paragraphs)

    raise ValueError('Only PDF and DOCX resumes are supported for text analysis.')
