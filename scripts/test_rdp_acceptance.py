import unittest

from rdp_acceptance import REQUIRED_SCENARIOS, evaluate


class AcceptanceTests(unittest.TestCase):
    limits = dict(min_duration_minutes=120, min_peak_concurrent=10,
                  max_failure_rate=.01, max_drops_per_session_hour=.02,
                  require_direct_media=True)

    def results(self, *, run=None, skip=(), fail=()):
        summary = dict(duration_minutes=240, peak_concurrent_desktops=10,
                       session_minutes=2400, connect_attempts=200,
                       connect_failures='0', reconnect_attempts=50,
                       reconnect_failures='0', unexpected_disconnects='0',
                       media_path='direct')
        summary.update(run or {})
        scenarios = [
            {'name': name, 'passed': name not in fail, 'evidence': 'log excerpt'}
            for name in REQUIRED_SCENARIOS if name not in skip
        ]
        return {'run': summary, 'scenarios': scenarios}

    def test_complete_run_passes(self):
        self.assertTrue(evaluate(self.results(), self.limits)['passed'])

    def test_missing_scenario_is_not_a_pass(self):
        verdict = evaluate(self.results(skip=('gateway_loss',)), self.limits)
        self.assertFalse(verdict['passed'])
        self.assertIn('scenario gateway_loss not run', verdict['failures'])

    def test_failed_scenario_blocks(self):
        verdict = evaluate(self.results(fail=('force_stop',)), self.limits)
        self.assertFalse(verdict['passed'])

    def test_proxy_path_cannot_prove_deploy_survival(self):
        verdict = evaluate(self.results(run=dict(media_path='proxy')), self.limits)
        self.assertFalse(verdict['passed'])
        self.assertIn('media still proxied through the API', verdict['failures'])

    def test_endurance_thresholds(self):
        for change in [dict(duration_minutes=60), dict(peak_concurrent_desktops=2),
                       dict(session_minutes=100), dict(connect_failures='9'),
                       dict(reconnect_failures='9'), dict(unexpected_disconnects='50')]:
            with self.subTest(change=change):
                self.assertFalse(evaluate(self.results(run=change), self.limits)['passed'])

    def test_invalid_evidence_rejected(self):
        bad = [
            {'scenarios': []},
            self.results() | {'run': {}},
            self.results() | {'scenarios': [{'name': 'nope', 'passed': True, 'evidence': 'x'}]},
            self.results() | {'scenarios': [{'name': 'force_stop', 'passed': True}]},
            self.results() | {'scenarios': [
                {'name': 'force_stop', 'passed': True, 'evidence': ' '}]},
            self.results(run=dict(media_path='sideways')),
            self.results(run=dict(connect_failures='500')),
        ]
        for results in bad:
            with self.subTest(results=results), self.assertRaises(ValueError):
                evaluate(results, self.limits)

    def test_duplicate_scenario_rejected(self):
        results = self.results()
        results['scenarios'].append(results['scenarios'][0])
        with self.assertRaises(ValueError):
            evaluate(results, self.limits)


if __name__ == '__main__':
    unittest.main()
