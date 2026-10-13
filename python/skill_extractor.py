
SKILLS = [
    'python', 'java', 'javascript', 'typescript', 'c++', 'c',
    'html', 'css', 'react', 'node.js', 'express', 'mongodb',
    'sql', 'mysql', 'git', 'github', 'excel', 'communication',
    'data analysis', 'machine learning', 'artificial intelligence',
    'problem solving', 'teamwork', 'networking', 'cybersecurity',
    'linux', 'aws', 'power bi', 'figma'
]


def extract_skills(text):
    lowered = text.lower()
    found = []

    for skill in SKILLS:
        if skill in lowered:
            found.append(
                skill.title()
                if skill not in {'c++', 'c', 'node.js', 'power bi'}
                else skill
            )

    return sorted(set(found), key=str.lower)
