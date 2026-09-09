"""Fetch upcoming events (D-day) from the '방학' sheet tab via a Google service account.

Requires the GOOGLE_SERVICE_ACCOUNT_JSON secret (the full service account key JSON)
and the `google-auth` package. The spreadsheet must be shared with the service
account's email address as a Viewer.
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as AuthRequest
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
SPREADSHEET_ID = '1S9G-9O20as8rz_Sob7lVXcKczfeWxuiYNlxr-MALDlk'
SHEET_RANGE = "'방학'!A2:B"
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']


def get_access_token():
    key_json = os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']
    info = json.loads(key_json)
    credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    credentials.refresh(AuthRequest())
    return credentials.token


def fetch_rows(token):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{SHEET_RANGE}'
    request = Request(url, headers={'Authorization': f'Bearer {token}'})
    with urlopen(request, timeout=20) as response:
        data = json.load(response)
    return data.get('values', [])


def parse_events(rows, today):
    events = []
    for row in rows:
        if len(row) < 2:
            continue
        label, raw_date = row[0].strip(), row[1].strip()
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
    for attempt in range(3):
        try:
            token = get_access_token()
            rows = fetch_rows(token)
            events = parse_events(rows, today)
            upcoming = [e for e in events if e['dday'] >= 0]
            payload['events'] = upcoming[:3] if upcoming else events[-1:]
            payload['status'] = 'ok'
            break
        except Exception:
            if attempt < 2:
                time.sleep(2 ** attempt)
    path = ROOT / 'data' / 'dday.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print('D-day update: ' + payload['status'])
    return 1 if payload['status'] == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
