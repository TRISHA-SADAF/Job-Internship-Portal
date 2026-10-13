
def match_score(student_skills, required_skills):
    student = {
        str(x).strip().lower()
        for x in (student_skills or [])
    }

    required = {
        str(x).strip().lower()
        for x in (required_skills or [])
        if str(x).strip()
    }

    matched = sorted(required & student)
    score = round(len(matched) / len(required) * 100) if required else 0

    return {
        'matchScore': score,
        'matchedSkills': matched
    }
