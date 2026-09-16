"""Evaluate a Phase 7 acceptance run. Never changes production configuration.

Capacity (Phase 6, rdp_capacity.py) answers "how many desktops fit". This
answers the different question Phase 7 asks: does the link stay correct for
hours, and through failures we deliberately cause.

The run itself is manual — it needs real browsers, real Windows hosts, a real
deploy and a real gateway kill. This script only judges the recorded evidence,
so "the acceptance suite passed" is a reproducible verdict rather than an
opinion.

Usage:
    python scripts/rdp_acceptance.py results.json --limits infrastructure/load-test/acceptance.example.json

Exit code 0 only when every required scenario passed and the endurance
thresholds held.
"""
import argparse
import json
import math
from pathlib import Path

# Each maps to a "done when" clause of Phase 7. A run that never exercised one
# of these is incomplete, not passing — silence is never evidence.
REQUIRED_SCENARIOS = {
    'duplicate_tab': 'Second tab refused or deliberate switch; never a black screen.',
    'force_stop': 'Admin force-stop frees the machine only after the tunnel is confirmed closed.',
    'grace_expiry': 'Tunnel lost, lock held for the grace window, then auto-released.',
    'api_deploy_mid_session': 'Live desktops survive a control-plane restart.',
    'gateway_loss': 'A media node is killed; new placements route around it.',
    'coordinator_failover': 'Coordinator leader dies; another instance takes over grace/reconcile.',
}


def positive(value):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError('Expected a finite positive measurement')
    return value


def integer(value, minimum=0):
    number = int(value)
    if number < minimum or str(number) != str(value):
        raise ValueError('Invalid count')
    return number


def field(run, key):
    """Absent evidence is invalid evidence, and reads as one error type."""
    if key not in run:
        raise ValueError(f'run.{key} is missing')
    return run[key]


def evaluate(results, limits):
    """Return a verdict for one acceptance run."""
    run = results.get('run')
    if not isinstance(run, dict):
        raise ValueError('Missing "run" summary')

    duration = positive(field(run, 'duration_minutes'))
    concurrency = integer(field(run, 'peak_concurrent_desktops'), 1)
    minutes = positive(field(run, 'session_minutes'))
    attempts = integer(field(run, 'connect_attempts'), 1)
    failures = integer(field(run, 'connect_failures'))
    reconnects = integer(field(run, 'reconnect_attempts'), 1)
    reconnect_failures = integer(field(run, 'reconnect_failures'))
    drops = integer(field(run, 'unexpected_disconnects'))
    media_path = str(run.get('media_path', '')).strip().lower()

    if failures > attempts or reconnect_failures > reconnects:
        raise ValueError('Failures exceed attempts')
    if media_path not in {'direct', 'proxy'}:
        raise ValueError('run.media_path must be "direct" or "proxy"')

    endurance = {
        'run too short': duration >= limits['min_duration_minutes'],
        'too few concurrent desktops': concurrency >= limits['min_peak_concurrent'],
        'insufficient concurrent exposure': minutes >= concurrency * duration,
        'connection failures': failures / attempts <= limits['max_failure_rate'],
        'reconnect failures': reconnect_failures / reconnects <= limits['max_failure_rate'],
        'unexpected disconnect rate':
            drops / (minutes / 60) <= limits['max_drops_per_session_hour'],
    }
    if limits.get('require_direct_media', True):
        # Pixels through FastAPI cannot survive a deploy, so a run on the proxy
        # path cannot prove the thing this phase exists to prove.
        endurance['media still proxied through the API'] = media_path == 'direct'

    seen = {}
    for entry in results.get('scenarios') or []:
        if not isinstance(entry, dict):
            raise ValueError('Each scenario must be an object')
        name = str(entry.get('name') or '').strip()
        if name not in REQUIRED_SCENARIOS:
            raise ValueError(f'Unknown scenario: {name or "(unnamed)"}')
        if name in seen:
            raise ValueError(f'Duplicate scenario: {name}')
        if 'passed' not in entry:
            raise ValueError(f'Scenario {name} records no outcome')
        if not str(entry.get('evidence') or '').strip():
            raise ValueError(f'Scenario {name} records no evidence')
        seen[name] = bool(entry['passed'])

    scenarios = []
    for name, intent in sorted(REQUIRED_SCENARIOS.items()):
        scenarios.append({
            'name': name,
            'intent': intent,
            'status': 'passed' if seen.get(name) else 'not run' if name not in seen else 'failed',
        })

    # A deploy that "survived" on the proxy path is a false pass — the run was
    # not actually testing the split media plane.
    if seen.get('api_deploy_mid_session') and media_path != 'direct':
        endurance['deploy survival claimed on the proxy path'] = False

    reasons = [name for name, ok in endurance.items() if not ok]
    reasons += [
        f'scenario {s["name"]} {s["status"]}'
        for s in scenarios if s['status'] != 'passed'
    ]
    return {
        'passed': not reasons,
        'media_path': media_path,
        'peak_concurrent_desktops': concurrency,
        'duration_minutes': duration,
        'scenarios': scenarios,
        'failures': reasons,
        'note': 'Acceptance only. Capacity caps come from rdp_capacity.py.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('results', type=Path)
    parser.add_argument('--limits', required=True, type=Path)
    args = parser.parse_args()
    try:
        limits = json.loads(args.limits.read_text())
        for key in ('min_duration_minutes', 'min_peak_concurrent'):
            positive(limits[key])
        for key in ('max_failure_rate',):
            if not 0 <= limits[key] < 1:
                raise ValueError(f'Invalid {key}')
        rate = limits['max_drops_per_session_hour']
        if not math.isfinite(rate) or rate < 0:
            raise ValueError('Invalid drop rate')
        result = evaluate(json.loads(args.results.read_text()), limits)
    except (ValueError, KeyError, OSError, TypeError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
