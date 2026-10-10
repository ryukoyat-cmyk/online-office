"""Fetch AirKorea observations and official alerts; never infer alerts from PM values."""
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, unquote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
STATION = '삼천동'  # AirKorea: 전주시 완산구 용리로 107, PM10/PM2.5 both available.
BASE = 'https://apis.data.go.kr/B552584/'


def request_page(service, params, key):
    query = urlencode({'serviceKey': unquote(key), 'returnType': 'json', **params})
    for attempt in range(3):
        try:
            with urlopen(BASE + service + '?' + query, timeout=25) as response:
                raw = json.load(response)['response']
            if raw['header']['resultCode'] != '00':
                raise ValueError('API rejected request')
            body = raw['body']
            if not isinstance(body.get('items'), list):
                raise ValueError('Invalid item list')
            return body
        except Exception:
            # Do not log exception strings: HTTP errors may contain the secret URL.
            if attempt == 2:
                raise ValueError('AirKorea request failed') from None
            time.sleep(2 ** attempt)


def number(value, flag):
    if flag not in (None, ''):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError):
        return None


def observation(items):
    if not items:
        raise ValueError('No observations')
    item = max(items, key=lambda row: row.get('dataTime', ''))
    # AirKorea can label the day's final measurement 24:00.
    date, clock = item['dataTime'].split()
    measured = datetime.fromisoformat(date + 'T' + ('00:00' if clock == '24:00' else clock)).replace(tzinfo=KST)
    if clock == '24:00':
        measured += timedelta(days=1)
    return {'measuredAt': measured.isoformat(),
            'pm10': number(item.get('pm10Value'), item.get('pm10Flag')),
            'pm25': number(item.get('pm25Value'), item.get('pm25Flag'))}


def active_alerts(items, now):
    active = []
    for item in items:
        if item.get('districtName') not in ('전북', '전북특별자치도', '전라북도'):
            continue
        if item.get('moveName') not in ('중부', '중부권', '중부권역'):
            # A changed/new Jeonju region must not quietly become "no alerts".
            if item.get('moveName') not in ('서부', '서부권', '서부권역', '동부', '동부권', '동부권역'):
                raise ValueError('Unrecognized Jeonbuk alert region')
            continue
        if item.get('itemCode') not in ('PM10', 'PM25') or item.get('issueGbn') not in ('주의보', '경보'):
            raise ValueError('Unrecognized alert')
        issued = datetime.fromisoformat(item['issueDate'] + 'T' + item['issueTime']).replace(tzinfo=KST)
        clear_date, clear_time = item.get('clearDate'), item.get('clearTime')
        empty = (None, '', '-', 'null')
        if (clear_date in empty) != (clear_time in empty):
            raise ValueError('Incomplete clearance')
        cleared = None if clear_date in empty else datetime.fromisoformat(clear_date + 'T' + clear_time).replace(tzinfo=KST)
        if cleared and cleared < issued:
            raise ValueError('Invalid clearance')
        if issued <= now and (cleared is None or cleared > now):
            active.append({'pollutant': item['itemCode'], 'level': item['issueGbn'], 'issuedAt': issued.isoformat()})
    return active


def all_alerts(key, year):
    rows = []
    for page in range(1, 21):
        body = request_page('UlfptcaAlarmInqireSvc/getUlfptcaAlarmInfo',
                            {'year': year, 'numOfRows': 1000, 'pageNo': page}, key)
        rows.extend(body['items'])
        total = int(body['totalCount'])
        if len(rows) >= total:
            return rows
        if not body['items']:
            raise ValueError('Incomplete alert pagination')
    raise ValueError('Alert pagination limit')


def main():
    now = datetime.now(KST)
    payload = {'status': 'error', 'station': STATION, 'source': '한국환경공단 에어코리아',
               'updatedAt': now.isoformat(), 'measuredAt': None, 'pm10': None, 'pm25': None,
               'alerts': {'status': 'error', 'checkedAt': None, 'active': []}}
    key = os.environ.get('AIRKOREA_API_KEY', '').strip()
    if key:
        try:
            body = request_page('ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty',
                                {'stationName': STATION, 'dataTerm': 'DAILY', 'ver': '1.3', 'numOfRows': 24, 'pageNo': 1}, key)
            payload.update(observation(body['items']))
            payload['status'] = 'ok' if payload['pm10'] is not None and payload['pm25'] is not None else 'error'
        except Exception:
            pass
        try:
            # Include previous-year records, so a December alert remains active after New Year.
            rows = all_alerts(key, now.year) + all_alerts(key, now.year - 1)
            payload['alerts'] = {'status': 'ok', 'checkedAt': now.isoformat(), 'active': active_alerts(rows, now)}
        except Exception:
            pass
    destination = ROOT / 'data/air-quality.json'
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(destination)
    success = payload['status'] == 'ok' and payload['alerts']['status'] == 'ok'
    print('Air quality update: ' + ('ok' if success else 'error; check AIRKOREA_API_KEY and access to both APIs'))
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
