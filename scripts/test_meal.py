import unittest
from fetch_meal import parse_response


class MealTests(unittest.TestCase):
    def test_menu_and_allergen_cleanup(self):
        data = {'mealServiceDietInfo': [
            {'head': [{'RESULT': {'CODE': 'INFO-000'}}]},
            {'row': [{'MMEAL_SC_CODE': '2', 'DDISH_NM': '쌀밥<br/>된장국 (5.6.)<br />사과&amp;배', 'CAL_INFO': '630 Kcal'}]}
        ]}
        self.assertEqual(parse_response(data), (['쌀밥', '된장국', '사과&배'], '630 Kcal'))

    def test_no_meal(self):
        self.assertEqual(parse_response({'RESULT': {'CODE': 'INFO-200'}}), ([], ''))

    def test_error_is_not_no_meal(self):
        with self.assertRaises(ValueError):
            parse_response({'RESULT': {'CODE': 'ERROR-300'}})

    def test_malformed_response_is_not_no_meal(self):
        with self.assertRaises(ValueError):
            parse_response({})


if __name__ == '__main__':
    unittest.main()
