import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from fetch_air_quality import KST, REGION_CODE, district_observation, fetch_district_observation, active_alerts, all_alerts, request_page, usable_record, previous_observation, main


class AirQualityTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 14, 8, 30, tzinfo=KST)
        self.row = {'SGG_CODE': REGION_CODE + '  ', 'ENG_DATA_TIME': '2026-10-14 : 08',
                    'I10007_VALUE': '57', 'I10007_VALUE_GRADE': 2,
                    'I10008_VALUE': '37', 'I10008_VALUE_GRADE': 3}

    def test_wansan_record_is_used_instead_of_station_or_city(self):
        city = {**self.row, 'SGG_CODE': '5211000000', 'I10007_VALUE': '99'}
        result = district_observation({'list': [city, self.row]}, self.now)
        self.assertEqual(result, {'measuredAt': '2026-10-14T08:00:00+09:00',
                                  'pm10': 57, 'pm25': 37})
        with self.assertRaises(ValueError):
            district_observation({'list': [city]}, self.now)

    def test_newest_hour_and_midnight(self):
        old = {**self.row, 'ENG_DATA_TIME': '2026-10-14 : 07', 'I10007_VALUE': '80'}
        self.assertEqual(district_observation({'list': [self.row, old]}, self.now)['pm10'], 57)
        midnight = {**self.row, 'ENG_DATA_TIME': '2026-10-13 : 24'}
        result = district_observation({'list': [midnight]}, datetime(2026, 10, 14, 0, 30, tzinfo=KST))
        self.assertEqual(result['measuredAt'], '2026-10-14T00:00:00+09:00')

    def test_stale_missing_invalid_and_future_values_are_rejected(self):
        for update in [{'I10007_VALUE': 'NaN', 'I10008_VALUE': '-'},
                       {'I10007_VALUE_GRADE': 5, 'I10008_VALUE_GRADE': 5}, {'ENG_DATA_TIME': '2026-10-14 : 09'},
                       {'ENG_DATA_TIME': '2026-10-14 : 06'}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                district_observation({'list': [{**self.row, **update}]}, self.now)
        with self.assertRaises(ValueError):
            district_observation({'errorCode': 'failed', 'list': [self.row]}, self.now)

    def test_failed_requests_raise_after_last_retry(self):
        with patch('fetch_air_quality.urlopen', side_effect=OSError('do not expose URL')), patch('fetch_air_quality.time.sleep'):
            with self.assertRaises(ValueError):
                fetch_district_observation(self.now)
            with self.assertRaises(ValueError):
                request_page('unused', {}, 'unused')

    def test_one_missing_pollutant_does_not_erase_the_other(self):
        result = district_observation({'list': [{**self.row, 'I10008_VALUE': '-'}]}, self.now)
        self.assertEqual(result['pm10'], 57)
        self.assertIsNone(result['pm25'])

    def test_previous_record_has_a_strict_region_and_age_limit(self):
        data = {'status': 'ok', 'regionCode': REGION_CODE, 'measuredAt': '2026-10-14T08:00:00+09:00',
                'pm10': 57, 'pm25': 37}
        self.assertTrue(usable_record(data, self.now + timedelta(hours=8)))
        self.assertFalse(usable_record(data, self.now + timedelta(hours=24)))
        self.assertFalse(usable_record({**data, 'regionCode': '5211300000'}, self.now))
        self.assertFalse(usable_record({**data, 'measuredAt': '2026-10-14T08:00:00'}, self.now))

    def test_failed_observation_preserves_measurement_time_and_reports_failure(self):
        import tempfile
        import json
        from pathlib import Path
        old = {'regionCode': REGION_CODE, 'measuredAt': self.now.isoformat(), 'pm10': 57, 'pm25': 37,
               'lastSuccessAt': self.now.isoformat()}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'data').mkdir()
            with patch('fetch_air_quality.ROOT', root), patch.dict('os.environ', {'AIRKOREA_API_KEY': ''}), \
                    patch('fetch_air_quality.fetch_district_observation', side_effect=ValueError('unavailable')), \
                    patch('fetch_air_quality.previous_observation', return_value=old):
                self.assertEqual(main(), 1)
                result = json.loads((root / 'data/air-quality.json').read_text(encoding='utf-8'))
            self.assertEqual(result['status'], 'cached')
            self.assertEqual(result['measuredAt'], old['measuredAt'])
            self.assertEqual(result['pm10'], 57)
            self.assertEqual(result['lastSuccessAt'], old['lastSuccessAt'])
            self.assertEqual(result['alerts']['status'], 'error')

    def test_release_region_and_year_boundary(self):
        now = datetime(2026, 1, 1, 8, tzinfo=KST)
        row = {'districtName': '전북', 'moveName': '중부권', 'itemCode': 'PM25', 'issueGbn': '주의보',
               'issueDate': '2025-12-31', 'issueTime': '23:00', 'clearDate': '', 'clearTime': ''}
        self.assertEqual(len(active_alerts([row], now)), 1)
        self.assertEqual(active_alerts([{**row, 'clearDate': '2026-01-01', 'clearTime': '07:00'}], now), [])
        self.assertEqual(active_alerts([{**row, 'moveName': '서부권'}], now), [])
        with self.assertRaises(ValueError):
            active_alerts([{**row, 'clearDate': '2026-01-01'}], now)
        with self.assertRaises(ValueError):
            active_alerts([{**row, 'moveName': '새권역'}], now)

    def test_pagination_cannot_hide_active_alerts(self):
        with patch('fetch_air_quality.request_page', side_effect=[{'items': [1], 'totalCount': 2}, {'items': [2], 'totalCount': 2}]):
            self.assertEqual(all_alerts('unused', 2026), [1, 2])
        with patch('fetch_air_quality.request_page', return_value={'items': [], 'totalCount': 1}):
            with self.assertRaises(ValueError):
                all_alerts('unused', 2026)


if __name__ == '__main__':
    unittest.main()
