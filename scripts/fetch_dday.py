"""Compute upcoming events (D-day) from data/dday-source.json.

The event list is maintained directly in this repository (edit
data/dday-source.json on GitHub whenever the school calendar changes) —
no external service or credentials are required.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))


def load_source():
    path = ROOT / 'data' / 'dday-source.json'
    with path.open(encoding='utf-8') as f:
        return json.load(f)


def parse_events(rows, today):
    events = []
    for row in rows:
        label = row.get('label', '').strip()
        raw_date = row.get('date', '').strip()
        if not label or not raw_date:
            continue
        try:
            target = datetime.strptime(raw_date, '%Y-%m-%d').date()
        except ValueError:
            continue
        events.append({'label': label, 'date': raw_date, 'dday': (target - today).days})
    events.sort(key=lambda e: e['dday'])
    return events


def main():
    now = datetime.now(KST)
    today = now.date()
    payload = {'updatedAt': now.isoformat(), 'status': 'error', 'events': []}
    try:
        rows = load_source()
        events = parse_events(rows, today)
        upcoming = [e for e in events if e['dday'] >= 0]
        payload['events'] = upcoming[:3] if upcoming else events[-1:]
        payload['status'] = 'ok'
    except Exception as exc:
        print(f'D-day compute failed: {exc!r}', file=sys.stderr)
    path = ROOT / 'data' / 'dday.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print('D-day update: ' + payload['status'])
    return 1 if payload['status'] == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
