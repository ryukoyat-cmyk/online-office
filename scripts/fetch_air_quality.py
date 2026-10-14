"""Fetch AirKorea observations and official alerts; never infer alerts from PM values."""
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
REGION = '전주시 완산구'
REGION_CODE = '5211100000'
DISTRICT_URL = 'https://www.airkorea.or.kr/web/mMainSidoAirInfoSubAjax'
BASE = 'https://apis.data.go.kr/B552584/'
PUBLISHED_AIR_URL = 'https://ryukoyat-cmyk.github.io/online-office/data/air-quality.json'
MAX_RECORD_AGE = 24 * 60 * 60


def request_page(service, params, key):
    query = urlencode({'serviceKey': unquote(key), 'returnType': 'json', **params})
    for attempt in range(2):
        try:
            with urlopen(BASE + service + '?' + query, timeout=10) as response:
                raw = json.load(response)['response']
            if raw['header']['resultCode'] != '00':
                raise ValueError('API rejected request')
            body = raw['body']
            if not isinstance(body.get('items'), list):
                raise ValueError('Invalid item list')
            return body
        except Exception:
            # Do not log exception strings: HTTP errors may contain the secret URL.
            if attempt == 1:
                raise ValueError('AirKorea request failed') from None
            time.sleep(1)


def number(value, flag):
    if flag not in (None, ''):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError):
        return None


def district_observation(raw, now):
    """Use the official Wansan-gu record, without substituting a station or city."""
    if raw.get('errorCode') not in (None, '') or not isinstance(raw.get('list'), list):
        raise ValueError('Invalid district response')
    rows = [row for row in raw['list']
            if str(row.get('SGG_CODE', '')).strip() == REGION_CODE]
    if not rows:
        raise ValueError('Wansan-gu observation missing')
    row = max(rows, key=lambda item: item.get('ENG_DATA_TIME', ''))
    date, hour = row['ENG_DATA_TIME'].split(' : ')
    hour = int(hour)
    if not 0 <= hour <= 24:
        raise ValueError('Invalid observation hour')
    measured = datetime.fromisoformat(date).replace(tzinfo=KST) + timedelta(hours=hour)
    age = (now - measured).total_seconds()
    if not -300 <= age < 7200:
        raise ValueError('Stale district observation')
    values = {}
    for name, code in [('pm10', '10007'), ('pm25', '10008')]:
        grade = row.get(f'I{code}_VALUE_GRADE')
        value = number(row.get(f'I{code}_VALUE'), None)
        values[name] = value if grade in (1, 2, 3, 4) else None
    if all(value is None for value in values.values()):
        raise ValueError('District measurements unavailable')
    return {'measuredAt': measured.isoformat(), **values}


def fetch_district_observation(now):
    # This is the same public request used by AirKorea's city/district map.
    # Both PM values are included in one response, so their observation hour agrees.
    request = Request(DISTRICT_URL,
                      data=json.dumps({'itemCode': '10007'}).encode('utf-8'),
                      headers={'Content-Type': 'application/json;charset=UTF-8',
                               'Referer': 'https://www.airkorea.or.kr/web/main.do',
                               'X-Requested-With': 'XMLHttpRequest'})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=10) as response:
                return district_observation(json.load(response), now)
        except Exception:
            if attempt == 1:
                raise ValueError('AirKorea district request failed') from None
            time.sleep(1)


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


def usable_record(data, now):
    """Keep a real, dated Wansan-gu observation for at most one day."""
    try:
        measured = datetime.fromisoformat(data['measuredAt'])
        age = (now - measured).total_seconds()
        return (data.get('regionCode') == REGION_CODE and measured.utcoffset() is not None
                and -300 <= age < MAX_RECORD_AGE
                and any(number(data.get(key), None) is not None for key in ('pm10', 'pm25')))
    except (KeyError, TypeError, ValueError):
        return False


def previous_observation(now):
    destination = ROOT / 'data/air-quality.json'
    candidates = []
    try:
        candidates.append(json.loads(destination.read_text(encoding='utf-8')))
    except (OSError, ValueError):
        pass
    try:
        # Each Actions checkout starts with the empty seed JSON. The last Pages
        # deployment is the durable source of the previous successful observation.
        url = PUBLISHED_AIR_URL + '?t=' + str(int(now.timestamp()))
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=5) as response:
            candidates.append(json.load(response))
    except Exception:
        pass
    records = [data for data in candidates if isinstance(data, dict) and usable_record(data, now)]
    return max(records, key=lambda data: datetime.fromisoformat(data['measuredAt'])) if records else None


def main():
    now = datetime.now(KST)
    payload = {'status': 'error', 'region': REGION, 'regionCode': REGION_CODE,
               'source': '한국환경공단 에어코리아 시군구 대기질',
               'updatedAt': now.isoformat(), 'measuredAt': None, 'pm10': None, 'pm25': None,
               'alerts': {'status': 'error', 'checkedAt': None, 'active': []}}
    failures = []
    key = os.environ.get('AIRKOREA_API_KEY', '').strip()
    try:
        payload.update(fetch_district_observation(now))
        payload['status'] = 'ok' if all(payload[key] is not None for key in ('pm10', 'pm25')) else 'partial'
        payload['lastSuccessAt'] = now.isoformat()
    except Exception as error:
        failures.append(f'observation: {type(error).__name__}')
        previous = previous_observation(now)
        if previous:
            payload.update({key: previous.get(key) for key in ('measuredAt', 'pm10', 'pm25')})
            payload['status'] = 'cached'
            payload['lastSuccessAt'] = previous.get('lastSuccessAt') or previous.get('updatedAt')
    if key:
        try:
            # Include previous-year records, so a December alert remains active after New Year.
            rows = all_alerts(key, now.year) + all_alerts(key, now.year - 1)
            payload['alerts'] = {'status': 'ok', 'checkedAt': now.isoformat(), 'active': active_alerts(rows, now)}
        except Exception as error:
            failures.append(f'alerts: {type(error).__name__}')
    else:
        failures.append('AIRKOREA_API_KEY is not configured')
    destination = ROOT / 'data/air-quality.json'
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(destination)
    success = payload['status'] in ('ok', 'partial') and payload['alerts']['status'] == 'ok'
    print('Air quality update: ' + ('ok' if success else 'error; ' + '; '.join(failures or ['incomplete response'])))
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
