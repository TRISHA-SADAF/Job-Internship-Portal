
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from skill_matcher import match_score


def main():
    payload = json.loads(sys.argv[1])
    skills = payload.get('studentSkills', [])
    jobs = payload.get('jobs', [])
    results = []

    for job in jobs:
        score = match_score(skills, job.get('skillsRequired', []))
        results.append({
            'jobId': str(job.get('_id', job.get('id', ''))),
            **score
        })

    results.sort(key=lambda x: x['matchScore'], reverse=True)
    print(json.dumps(results))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'error': str(exc)}))
        sys.exit(1)
