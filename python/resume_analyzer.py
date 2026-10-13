
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from resume_parser import extract_text
from skill_extractor import extract_skills


def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: resume_analyzer.py <resume-file>')

    text = extract_text(sys.argv[1])

    print(json.dumps({
        'skills': extract_skills(text),
        'wordCount': len(text.split()),
        'summary': text[:1500]
    }))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'error': str(exc)}))
        sys.exit(1)
