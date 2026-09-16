"""Evaluate measured ramp stages. Never changes production configuration."""
import argparse
import csv
import json
import math
from pathlib import Path


def positive(value):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError("Expected a finite positive measurement")
    return value


def integer(value, minimum=0):
    number = int(value)
    if number < minimum or str(number) != str(value):
        raise ValueError("Invalid count")
    return number


def evaluate(rows, limits):
    """Each row summarizes one sustained plateau, including failed attempts."""
    if not rows:
        raise ValueError("No measured stages")
    stages, previous, eligible = [], 0, True
    cap = None
    for row in rows:
        concurrency = integer(row['concurrency'], 1)
        if concurrency <= previous:
            raise ValueError("Stages must have strictly increasing concurrency")
        previous = concurrency
        attempts = integer(row['connect_attempts'], concurrency)
        failures = integer(row['connect_failures'])
        reconnects = integer(row['reconnect_attempts'], concurrency)
        reconnect_failures = integer(row['reconnect_failures'])
        if failures > attempts or reconnect_failures > reconnects:
            raise ValueError("Failures exceed attempts")
        minutes = positive(row['session_minutes'])
        duration = positive(row['steady_minutes'])
        first = positive(row['first_frame_p95_ms'])
        reconnect = positive(row['reconnect_p95_ms'])
        drops = integer(row['unexpected_disconnects'])
        cpu = positive(row['peak_cpu_percent'])
        memory = positive(row['peak_memory_percent'])
        if cpu > 100 or memory > 100:
            raise ValueError("Use host CPU/memory percentages normalized to 0..100")
        reasons = []
        checks = {
            'insufficient soak': duration >= limits['min_steady_minutes'],
            'insufficient concurrent exposure': minutes >= concurrency * duration,
            'connection failures': failures / attempts <= limits['max_failure_rate'],
            'reconnect failures': reconnect_failures / reconnects <= limits['max_failure_rate'],
            'first frame latency': first <= limits['first_frame_p95_ms'],
            'reconnect latency': reconnect <= limits['reconnect_p95_ms'],
            'unexpected disconnect rate': drops / (minutes / 60) <= limits['max_drops_per_session_hour'],
            'CPU headroom': cpu <= limits['max_cpu_percent'],
            'memory headroom': memory <= limits['max_memory_percent'],
        }
        reasons = [name for name, ok in checks.items() if not ok]
        eligible = eligible and not reasons
        if eligible:
            cap = math.floor(concurrency * (1 - limits['reserve_fraction'])) or None
        stages.append({'concurrency': concurrency, 'passed': not reasons, 'failures': reasons})
    return {
        'recommended_cap': cap,
        # These are intentionally recommendations only. The evaluator never
        # edits a live .env because a CSV is evidence, not deployment approval.
        # On a single media host both settings have the same measured ceiling;
        # Phase 7 uses per-node values inside RDP_GATEWAYS instead.
        'recommended_settings': (
            {
                'RDP_MAX_LIVE_SESSIONS': cap,
                'RDP_GATEWAY_CAPACITY': cap,
            }
            if cap is not None
            else None
        ),
        'stages': stages,
        'note': 'Candidate only: direct media path and failure acceptance must also pass.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('measurements', type=Path)
    parser.add_argument('--limits', required=True, type=Path)
    args = parser.parse_args()
    try:
        limits = json.loads(args.limits.read_text())
        for key in ('min_steady_minutes', 'first_frame_p95_ms', 'reconnect_p95_ms',
                    'max_cpu_percent', 'max_memory_percent'):
            positive(limits[key])
        for key in ('max_failure_rate', 'reserve_fraction'):
            if not 0 <= limits[key] < 1:
                raise ValueError(f'Invalid {key}')
        if not math.isfinite(limits['max_drops_per_session_hour']) or limits['max_drops_per_session_hour'] < 0:
            raise ValueError('Invalid drop rate')
        with args.measurements.open(newline='') as stream:
            result = evaluate(list(csv.DictReader(stream)), limits)
    except (ValueError, KeyError, OSError, TypeError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    return 0 if all(stage['passed'] for stage in result['stages']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
