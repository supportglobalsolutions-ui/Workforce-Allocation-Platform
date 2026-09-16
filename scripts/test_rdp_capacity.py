import unittest
from rdp_capacity import evaluate


class CapacityTests(unittest.TestCase):
    limits = dict(min_steady_minutes=30, first_frame_p95_ms=5000,
                  reconnect_p95_ms=5000, max_failure_rate=.01,
                  max_drops_per_session_hour=.02, max_cpu_percent=75,
                  max_memory_percent=80, reserve_fraction=.2)

    def row(self, concurrency=10, **changes):
        row = dict(concurrency=str(concurrency), steady_minutes='30',
                   session_minutes=str(concurrency * 30), connect_attempts=str(concurrency),
                   connect_failures='0', first_frame_p95_ms='1000',
                   reconnect_attempts=str(concurrency), reconnect_failures='0',
                   reconnect_p95_ms='2000', unexpected_disconnects='0',
                   peak_cpu_percent='50', peak_memory_percent='60')
        return row | changes

    def test_reserves_headroom(self):
        report = evaluate([self.row()], self.limits)
        self.assertEqual(report['recommended_cap'], 8)
        self.assertEqual(
            report['recommended_settings'],
            {'RDP_MAX_LIVE_SESSIONS': 8, 'RDP_GATEWAY_CAPACITY': 8},
        )

    def test_failure_blocks_later_higher_stage(self):
        rows = [self.row(), self.row(20, connect_failures='1'), self.row(30)]
        self.assertEqual(evaluate(rows, self.limits)['recommended_cap'], 8)

    def test_latency_drops_resources_and_exposure_fail(self):
        for changes in [dict(first_frame_p95_ms='6000'), dict(reconnect_failures='1'),
                        dict(unexpected_disconnects='1'), dict(peak_cpu_percent='90'),
                        dict(peak_memory_percent='90'), dict(session_minutes='29'),
                        dict(steady_minutes='1')]:
            with self.subTest(changes=changes):
                self.assertIsNone(evaluate([self.row(**changes)], self.limits)['recommended_cap'])

    def test_missing_or_invalid_evidence_rejected(self):
        for rows in [[], [self.row(first_frame_p95_ms='nan')],
                     [self.row(connect_failures='11')], [self.row(), self.row()],
                     [self.row(reconnect_attempts='0')]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                evaluate(rows, self.limits)


if __name__ == '__main__':
    unittest.main()
