"""Fetch today's Jeonju Elementary lunch; no credentials are written to disk."""
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))


def parse_response(data):
    result = data.get('RESULT', {})
    if result.get('CODE') == 'INFO-200':
        return [], ''
    blocks = data.get('mealServiceDietInfo', [])
    if not blocks:
        raise ValueError('Unexpected NEIS response')
    codes = [head['RESULT']['CODE'] for block in blocks for head in block.get('head', []) if 'RESULT' in head]
    if codes != ['INFO-000']:
        raise ValueError('NEIS returned an error')
    rows = [row for block in blocks for row in block.get('row', [])]
    lunches = [row for row in rows if str(row.get('MMEAL_SC_CODE')) == '2']
    if len(lunches) != 1:
        raise ValueError('Expected exactly one lunch')
    row = lunches[0]
    meals = []
    for item in re.split(r'<br\s*/?>', row['DDISH_NM'], flags=re.I):
        item = html.unescape(re.sub(r'<[^>]+>', '', item))
        item = re.sub(r'\s*\([\d.\s]+\)', '', item).strip()
        if item:
            meals.append(item)
    if not meals:
        raise ValueError('Empty lunch menu')
    return meals, row.get('CAL_INFO', '')


def main():
    now = datetime.now(KST)
    date = now.strftime('%Y%m%d')
    params = {'Type':'json', 'pIndex':1, 'pSize':100, 'ATPT_OFCDC_SC_CODE':'P10',
              'SD_SCHUL_CODE':'8332185', 'MMEAL_SC_CODE':'2', 'MLSV_YMD':date}
    key = os.environ.get('NEIS_API_KEY', '').strip()
    if key:
        params['KEY'] = key
    payload = {'school':'전주초등학교', 'date':date, 'updatedAt':now.isoformat(),
               'status':'error', 'meals':[], 'calorie':''}
    for attempt in range(3):
        try:
            with urlopen('https://open.neis.go.kr/hub/mealServiceDietInfo?' + urlencode(params), timeout=25) as response:
                raw = json.load(response)
            payload['meals'], payload['calorie'] = parse_response(raw)
            payload['status'] = 'ok' if payload['meals'] else 'empty'
            break
        except Exception:
            if attempt < 2:
                time.sleep(2 ** attempt)
    path = ROOT / 'data' / 'meal.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print('Meal update: ' + payload['status'] + ' (' + date + ')')
    return 1 if payload['status'] == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
