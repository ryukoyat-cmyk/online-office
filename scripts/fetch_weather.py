"""Fetch today's Jeonju weather from Open-Meteo (no API key required)."""
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))

ADDRESS = '전북특별시 전주시 완산구 대동로 33'
LOCATION_LABEL = '전주시 완산구'
# Fallback center of Jeonju, used if the address lookup below fails for any reason.
FALLBACK_LATITUDE, FALLBACK_LONGITUDE = 35.8242, 127.1480

# WMO weather codes -> (Korean label, icon category)
WEATHER_CODES = {
    0: ('맑음', 'clear'),
    1: ('대체로 맑음', 'clear'),
    2: ('구름 조금', 'cloudy'),
    3: ('흐림', 'cloudy'),
    45: ('안개', 'fog'), 48: ('안개', 'fog'),
    51: ('약한 이슬비', 'rain'), 53: ('이슬비', 'rain'), 55: ('강한 이슬비', 'rain'),
    56: ('약한 어는 비', 'rain'), 57: ('어는 비', 'rain'),
    61: ('약한 비', 'rain'), 63: ('비', 'rain'), 65: ('강한 비', 'rain'),
    66: ('약한 어는 비', 'rain'), 67: ('어는 비', 'rain'),
    71: ('약한 눈', 'snow'), 73: ('눈', 'snow'), 75: ('강한 눈', 'snow'),
    77: ('눈날림', 'snow'),
    80: ('약한 소나기', 'rain'), 81: ('소나기', 'rain'), 82: ('강한 소나기', 'rain'),
    85: ('약한 눈소나기', 'snow'), 86: ('눈소나기', 'snow'),
    95: ('뇌우', 'storm'), 96: ('우박 동반 뇌우', 'storm'), 99: ('우박 동반 뇌우', 'storm'),
}


def geocode_address(address):
    """Resolve a street address to (lat, lon) via Nominatim. Returns None on failure."""
    params = {'q': address, 'format': 'json', 'limit': 1, 'countrycodes': 'kr'}
    request = Request(
        'https://nominatim.openstreetmap.org/search?' + urlencode(params),
        headers={'User-Agent': 'jeonju-elementary-online-office/1.0 (school portal weather widget)'},
    )
    with urlopen(request, timeout=15) as response:
        results = json.load(response)
    if not results:
        return None
    return float(results[0]['lat']), float(results[0]['lon'])


def parse_response(data):
    current = data['current']
    daily = data['daily']
    label, icon = WEATHER_CODES.get(int(current['weather_code']), ('알 수 없음', 'cloudy'))
    return {
        'temperature': round(current['temperature_2m']),
        'tempMax': round(daily['temperature_2m_max'][0]),
        'tempMin': round(daily['temperature_2m_min'][0]),
        'description': label,
        'icon': icon,
        'isDay': bool(current['is_day']),
    }


def main():
    now = datetime.now(KST)
    date = now.strftime('%Y%m%d')

    try:
        coords = geocode_address(ADDRESS)
    except Exception:
        coords = None
    latitude, longitude = coords if coords else (FALLBACK_LATITUDE, FALLBACK_LONGITUDE)

    params = {
        'latitude': latitude, 'longitude': longitude,
        'current': 'temperature_2m,weather_code,is_day',
        'daily': 'temperature_2m_max,temperature_2m_min',
        'timezone': 'Asia/Seoul',
    }
    payload = {'location': LOCATION_LABEL, 'date': date, 'updatedAt': now.isoformat(), 'status': 'error'}
    for attempt in range(3):
        try:
            with urlopen('https://api.open-meteo.com/v1/forecast?' + urlencode(params), timeout=25) as response:
                raw = json.load(response)
            payload.update(parse_response(raw))
            payload['status'] = 'ok'
            break
        except Exception:
            if attempt < 2:
                time.sleep(2 ** attempt)
    path = ROOT / 'data' / 'weather.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print('Weather update: ' + payload['status'] + ' (' + date + ')')
    return 1 if payload['status'] == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
