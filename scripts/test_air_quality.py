import unittest
from datetime import datetime
from unittest.mock import patch
from fetch_air_quality import KST, observation, active_alerts, all_alerts


class AirQualityTests(unittest.TestCase):
    def test_invalid_values_and_instrument_flags(self):
        value = observation([{'dataTime': '2026-10-10 24:00', 'pm10Value': 'NaN', 'pm25Value': '20', 'pm25Flag': '점검'}])
        self.assertIsNone(value['pm10'])
        self.assertIsNone(value['pm25'])
        self.assertEqual(value['measuredAt'], '2026-10-11T00:00:00+09:00')

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
