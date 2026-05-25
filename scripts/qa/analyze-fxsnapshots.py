#!/usr/bin/env python3
"""
Analyze Firefox .fxsnapshot heap snapshots (gzip-compressed binary format).

This script does not require Firefox internals/protobuf schemas. It extracts
high-signal string/type tokens from the decompressed payload and compares growth
across snapshots to highlight likely leak vectors (observers, DOM nodes, RTC,
UI overlays, etc.).

Usage:
  python scripts/qa/analyze-fxsnapshots.py \
    --glob "/home/andy/Downloads/*.fxsnapshot" \
    --top 30 \
        --slope-top 20 \
        --csv /tmp/fxsnapshot-summary.csv \
        --ws-log "/home/andy/Downloads/ws-traffic-*.log"
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from glob import glob
from typing import Iterable, Iterator

# Extract plain ASCII tokens and UTF-16LE tokens from raw binary chunks.
ASCII_RE = re.compile(rb"[A-Za-z_:$][A-Za-z0-9_:$.\-/ ]{2,100}")
UTF16_RE = re.compile(rb"(?:[A-Za-z0-9_:$.\-/ ]\x00){4,101}")

# Keep only high-signal tokens to avoid noise and huge dictionaries.
HIGH_SIGNAL_SUBSTRINGS = (
    "Observer",
    "Element",
    "Document",
    "Window",
    "Node",
    "Event",
    "Promise",
    "Function",
    "Map",
    "Set",
    "Array",
    "RTC",
    "Audio",
    "Popover",
    "Tooltip",
    "Panel",
    "Dialog",
    "Mutation",
    "Resize",
    "Intersection",
    "MediaQuery",
    "CSS",
    "HTML",
    "LiveKit",
    "PeerConnection",
    "WebSocket",
)


@dataclass
class SnapshotStats:
    path: str
    mtime: float
    compressed_bytes: int
    decompressed_bytes: int
    token_counts: Counter[str]

    @property
    def basename(self) -> str:
        return os.path.basename(self.path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze .fxsnapshot growth locally")
    parser.add_argument(
        "--glob",
        default="/home/andy/Downloads/*.fxsnapshot",
        help="Glob pattern for .fxsnapshot files",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=25,
        help="Top-N growth tokens to print",
    )
    parser.add_argument(
        "--csv",
        default="",
        help="Optional CSV output path for per-snapshot category summary",
    )
    parser.add_argument(
        "--slope-top",
        type=int,
        default=20,
        help="Top-N tokens ranked by positive slope over time",
    )
    parser.add_argument(
        "--ws-log",
        default="",
        help="Optional WebSocket log file/glob (DevTools export/text) for event-rate analysis",
    )
    parser.add_argument(
        "--har",
        default="",
        help="Optional HAR file/glob for WebSocket frame-rate analysis",
    )
    return parser.parse_args()


def normalize_token(token: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_:$./\- ]+", "", token)
    token = token.strip().strip("-._:/")
    token = re.sub(r"\s+", " ", token)
    return token


def is_high_signal_token(token: str) -> bool:
    if len(token) < 3 or len(token) > 100:
        return False

    if token.startswith("Y "):
        return False

    if token.count(" ") > 1:
        return False

    if re.fullmatch(r"[A-Z](?: [A-Za-z0-9]+)+", token):
        return False

    alpha_count = sum(1 for char in token if char.isalpha())
    if alpha_count < 4:
        return False

    if "http" in token:
        return False

    if token.islower() and len(token) < 10:
        return False

    if " " in token and re.fullmatch(r"[A-Z0-9 ]+", token):
        return False

    if token.endswith("H") and len(token) <= 60 and " " not in token:
        return True

    return any(sub in token for sub in HIGH_SIGNAL_SUBSTRINGS)


def iter_tokens_from_bytes(data: bytes) -> Iterator[str]:
    for match in ASCII_RE.finditer(data):
        raw = match.group(0)
        token = normalize_token(raw.decode("ascii", errors="ignore"))
        if is_high_signal_token(token):
            yield token

    for match in UTF16_RE.finditer(data):
        raw = match.group(0)
        token = normalize_token(raw.decode("utf-16le", errors="ignore"))
        if is_high_signal_token(token):
            yield token


def analyze_snapshot(path: str) -> SnapshotStats:
    token_counts: Counter[str] = Counter()
    decompressed_bytes = 0

    # Keep overlap so regex matches crossing chunk boundaries are preserved.
    overlap = b""
    overlap_keep = 256

    with gzip.open(path, "rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break

            decompressed_bytes += len(chunk)
            data = overlap + chunk
            for token in iter_tokens_from_bytes(data):
                token_counts[token] += 1

            overlap = data[-overlap_keep:]

    return SnapshotStats(
        path=path,
        mtime=os.path.getmtime(path),
        compressed_bytes=os.path.getsize(path),
        decompressed_bytes=decompressed_bytes,
        token_counts=token_counts,
    )


def format_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    v = float(value)
    for unit in units:
        if v < 1024 or unit == units[-1]:
            return f"{v:.1f}{unit}"
        v /= 1024
    return f"{value}B"


def sum_category(counter: Counter[str], needle_set: Iterable[str]) -> int:
    needles = tuple(needle_set)
    total = 0
    for token, count in counter.items():
        if any(needle in token for needle in needles):
            total += count
    return total


def category_summary(counter: Counter[str]) -> dict[str, int]:
    return {
        "observer_tokens": sum_category(counter, ["Observer", "Mutation", "Resize", "Intersection"]),
        "dom_tokens": sum_category(counter, ["Element", "Document", "Node", "HTML", "CSS"]),
        "rtc_audio_tokens": sum_category(counter, ["RTC", "PeerConnection", "Audio", "LiveKit"]),
        "ui_overlay_tokens": sum_category(counter, ["Popover", "Tooltip", "Panel", "Dialog"]),
        "event_tokens": sum_category(counter, ["Event", "Promise", "Function"]),
    }


def print_timeline(stats: list[SnapshotStats]) -> None:
    print("\nSnapshot Timeline")
    print("=" * 90)
    print(
        f"{'snapshot':<18} {'time':<20} {'compressed':>12} {'decompressed':>14} {'signals':>10}"
    )
    for s in stats:
        dt = datetime.fromtimestamp(s.mtime).strftime("%Y-%m-%d %H:%M:%S")
        signal_count = sum(s.token_counts.values())
        print(
            f"{s.basename:<18} {dt:<20} {format_bytes(s.compressed_bytes):>12} {format_bytes(s.decompressed_bytes):>14} {signal_count:>10}"
        )


def print_category_deltas(stats: list[SnapshotStats]) -> None:
    print("\nCategory Growth (relative to first snapshot)")
    print("=" * 90)
    baseline = category_summary(stats[0].token_counts)

    headers = [
        "snapshot",
        "observer",
        "dom",
        "rtc_audio",
        "ui_overlay",
        "event",
    ]
    print(f"{headers[0]:<18} {headers[1]:>10} {headers[2]:>10} {headers[3]:>10} {headers[4]:>10} {headers[5]:>10}")

    for s in stats:
        cats = category_summary(s.token_counts)
        print(
            f"{s.basename:<18} "
            f"{cats['observer_tokens'] - baseline['observer_tokens']:>10} "
            f"{cats['dom_tokens'] - baseline['dom_tokens']:>10} "
            f"{cats['rtc_audio_tokens'] - baseline['rtc_audio_tokens']:>10} "
            f"{cats['ui_overlay_tokens'] - baseline['ui_overlay_tokens']:>10} "
            f"{cats['event_tokens'] - baseline['event_tokens']:>10}"
        )


def print_top_growth(stats: list[SnapshotStats], top_n: int) -> None:
    baseline = stats[0].token_counts
    latest = stats[-1].token_counts

    deltas: list[tuple[str, int, int, int]] = []
    all_tokens = set(baseline) | set(latest)
    for token in all_tokens:
        b = baseline.get(token, 0)
        l = latest.get(token, 0)
        d = l - b
        if d > 0:
            deltas.append((token, d, b, l))

    deltas.sort(key=lambda row: row[1], reverse=True)

    print("\nTop Token Growth (first -> latest)")
    print("=" * 90)
    print(f"{'delta':>8} {'baseline':>8} {'latest':>8} token")
    for token, delta, b, l in deltas[:top_n]:
        print(f"{delta:>8} {b:>8} {l:>8} {token}")


def minutes_from_baseline(stats: list[SnapshotStats]) -> list[float]:
    baseline = stats[0].mtime
    return [max(0.0, (s.mtime - baseline) / 60.0) for s in stats]


def linear_slope(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    var_x = sum((x - mean_x) ** 2 for x in xs)
    if var_x == 0:
        return 0.0

    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    return cov / var_x


def print_growth_velocity(stats: list[SnapshotStats]) -> None:
    print("\nGrowth Velocity Between Snapshots")
    print("=" * 90)
    print(
        f"{'from -> to':<39} {'minutes':>8} {'delta(MB)':>12} {'MB/min':>10} {'signal/min':>12}"
    )

    for left, right in zip(stats, stats[1:]):
        minutes = max(1e-9, (right.mtime - left.mtime) / 60.0)
        delta_bytes = right.decompressed_bytes - left.decompressed_bytes
        delta_mb = delta_bytes / (1024 * 1024)
        signal_delta = sum(right.token_counts.values()) - sum(left.token_counts.values())
        signal_rate = signal_delta / minutes
        print(
            f"{left.basename} -> {right.basename:<18} "
            f"{minutes:>8.2f} {delta_mb:>12.2f} {delta_mb / minutes:>10.2f} {signal_rate:>12.2f}"
        )


def print_top_slopes(stats: list[SnapshotStats], top_n: int) -> None:
    xs = minutes_from_baseline(stats)
    all_tokens: set[str] = set()
    for s in stats:
        all_tokens.update(s.token_counts.keys())

    ranked: list[tuple[str, float, int, int]] = []
    for token in all_tokens:
        ys = [s.token_counts.get(token, 0) for s in stats]
        slope = linear_slope(xs, [float(v) for v in ys])
        delta = ys[-1] - ys[0]
        if slope > 0 and delta > 0:
            ranked.append((token, slope, delta, ys[-1]))

    ranked.sort(key=lambda row: row[1], reverse=True)

    print("\nTop Positive Token Slopes")
    print("=" * 90)
    print(f"{'slope/min':>10} {'delta':>8} {'latest':>8} token")
    for token, slope, delta, latest in ranked[:top_n]:
        print(f"{slope:>10.3f} {delta:>8} {latest:>8} {token}")


TIME_RE = re.compile(r"(\d{2}:\d{2}:\d{2}\.\d{3})")
EVENT_TYPE_RE = re.compile(r'"type"\s*:\s*"([A-Z0-9:_-]+)"')
ESCAPED_EVENT_TYPE_RE = re.compile(r'\\"type\\"\\s*:\\s*\\"([A-Z0-9:_-]+)\\"')


def parse_clock_seconds(line: str) -> float | None:
    match = TIME_RE.search(line)
    if not match:
        return None

    hh, mm, ss_ms = match.group(1).split(":")
    ss, ms = ss_ms.split(".")
    return int(hh) * 3600 + int(mm) * 60 + int(ss) + int(ms) / 1000.0


def extract_event_name(line: str) -> str | None:
    escaped = ESCAPED_EVENT_TYPE_RE.findall(line)
    if escaped:
        if escaped[0] == "WS:EVENT" and len(escaped) > 1:
            return escaped[1]
        return escaped[0]

    plain = EVENT_TYPE_RE.findall(line)
    if plain:
        if plain[0] == "WS:EVENT" and len(plain) > 1:
            return plain[1]
        return plain[0]

    return None


def iter_ws_lines(path_glob_or_file: str) -> Iterator[str]:
    paths = sorted(glob(path_glob_or_file))
    if not paths and os.path.exists(path_glob_or_file):
        paths = [path_glob_or_file]

    for path in paths:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                yield line.rstrip("\n")


def print_ws_rate_summary(path_glob_or_file: str) -> None:
    lines = list(iter_ws_lines(path_glob_or_file))
    if not lines:
        print("\nWS Event Rate Analysis")
        print("=" * 90)
        print("No WS log lines found for --ws-log input.")
        return

    event_counts: Counter[str] = Counter()
    times: list[float] = []

    for line in lines:
        event_name = extract_event_name(line)
        if not event_name:
            continue

        event_counts[event_name] += 1
        t = parse_clock_seconds(line)
        if t is not None:
            times.append(t)

    if not event_counts:
        print("\nWS Event Rate Analysis")
        print("=" * 90)
        print("No parseable WS event entries found in --ws-log input.")
        return

    duration_minutes = None
    if len(times) >= 2:
        min_t = min(times)
        max_t = max(times)
        raw = max_t - min_t
        if raw < 0:
            raw += 24 * 3600
        duration_minutes = max(1e-9, raw / 60.0)

    total = sum(event_counts.values())
    presence_total = sum(v for k, v in event_counts.items() if k.startswith("PRESENCE:"))
    audio_total = sum(v for k, v in event_counts.items() if k.startswith("AUDIO:"))
    ws_total = sum(v for k, v in event_counts.items() if k.startswith("WS:"))

    print("\nWS Event Rate Analysis")
    print("=" * 90)
    print(f"Parsed events: {total}")
    if duration_minutes is not None:
        print(f"Observed duration: {duration_minutes:.2f} minutes")
        print(f"Average rate: {total / duration_minutes:.2f} events/min ({total / (duration_minutes * 60):.2f}/sec)")

    print(
        f"Category split: PRESENCE={presence_total}, AUDIO={audio_total}, WS={ws_total}, OTHER={total - presence_total - audio_total - ws_total}"
    )

    print("\nTop WS Event Types")
    print("-" * 90)
    for event_name, count in event_counts.most_common(15):
        if duration_minutes is None:
            print(f"{count:>8} {event_name}")
        else:
            print(f"{count:>8} {count / duration_minutes:>10.2f}/min {event_name}")

    if duration_minutes is not None and total / duration_minutes > 60:
        print(
            "\nHeuristic: High WS throughput detected (>60 events/min). If memory rises mostly during "
            "speaking indicators/presence updates, event churn can contribute via retained closures, "
            "buffers, or UI subscriptions."
        )


def parse_iso_timestamp_to_seconds(iso_value: str) -> float | None:
    try:
        dt = datetime.fromisoformat(iso_value)
    except ValueError:
        return None
    return dt.timestamp()


def iter_har_paths(path_glob_or_file: str) -> list[str]:
    paths = sorted(glob(path_glob_or_file))
    if not paths and os.path.exists(path_glob_or_file):
        paths = [path_glob_or_file]
    return paths


def parse_har_frame_entry(frame: object) -> tuple[float | None, str | None]:
    if not isinstance(frame, dict):
        return None, None

    payload = frame.get("data") or frame.get("payloadData") or frame.get("message") or ""
    if not isinstance(payload, str):
        payload = str(payload)

    event_name = extract_event_name(payload)
    timestamp_value = frame.get("time") or frame.get("timestamp")
    timestamp = None
    if isinstance(timestamp_value, (int, float)):
        timestamp = float(timestamp_value)
    elif isinstance(timestamp_value, str):
        timestamp = parse_iso_timestamp_to_seconds(timestamp_value)

    return timestamp, event_name


def print_har_ws_summary(path_glob_or_file: str) -> None:
    paths = iter_har_paths(path_glob_or_file)
    print("\nHAR WS Analysis")
    print("=" * 90)

    if not paths:
        print("No HAR files matched for --har input.")
        return

    any_frames = False

    for path in paths:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                har = json.load(fh)
        except Exception as error:
            print(f"{os.path.basename(path)}: failed to parse HAR ({error})")
            continue

        entries = ((har.get("log") or {}).get("entries") or []) if isinstance(har, dict) else []
        if not isinstance(entries, list):
            entries = []

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            request = entry.get("request") or {}
            if not isinstance(request, dict):
                continue

            url = request.get("url")
            if not isinstance(url, str) or not url.startswith("ws"):
                continue

            display_url = url.split("?", 1)[0]

            frames = entry.get("_webSocketMessages") or entry.get("_webSocketFrames") or []
            if not isinstance(frames, list) or not frames:
                print(f"{os.path.basename(path)} | {display_url}: no frame payloads in HAR entry")
                continue

            any_frames = True
            parsed: list[tuple[float | None, str | None]] = [parse_har_frame_entry(frame) for frame in frames]

            events = [event_name for _, event_name in parsed if event_name]
            event_counts = Counter(events)

            times = [timestamp for timestamp, _ in parsed if timestamp is not None]
            duration_minutes = None
            if len(times) >= 2:
                raw_seconds = max(times) - min(times)
                if raw_seconds > 0:
                    duration_minutes = raw_seconds / 60.0

            print(f"{os.path.basename(path)} | {display_url}")
            print(f"  frames: {len(frames)} parseable-events: {sum(event_counts.values())}")
            if duration_minutes is not None:
                rate = sum(event_counts.values()) / max(1e-9, duration_minutes)
                print(f"  duration: {duration_minutes:.2f} min rate: {rate:.2f} events/min")

            midpoint = len(parsed) // 2
            first_half_events = [event_name for _, event_name in parsed[:midpoint] if event_name]
            second_half_events = [event_name for _, event_name in parsed[midpoint:] if event_name]
            first_count = len(first_half_events)
            second_count = len(second_half_events)
            print(f"  half split events: first={first_count} second={second_count}")

            first_presence = sum(1 for name in first_half_events if name.startswith("PRESENCE:"))
            second_presence = sum(1 for name in second_half_events if name.startswith("PRESENCE:"))
            if first_count > 0 or second_count > 0:
                print(
                    "  presence events: "
                    f"first={first_presence} ({(first_presence / max(1, first_count)) * 100:.1f}%) "
                    f"second={second_presence} ({(second_presence / max(1, second_count)) * 100:.1f}%)"
                )

            top_items = event_counts.most_common(8)
            if top_items:
                print("  top events:")
                for name, count in top_items:
                    print(f"    {count:>6} {name}")

    if not any_frames:
        print(
            "No websocket frame payload arrays found in the HAR files. Firefox HAR export often includes "
            "only WS handshake metadata. Use DevTools WS message copy/export for per-message analysis."
        )


def write_csv(stats: list[SnapshotStats], csv_path: str) -> None:
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "snapshot",
                "mtime",
                "compressed_bytes",
                "decompressed_bytes",
                "observer_tokens",
                "dom_tokens",
                "rtc_audio_tokens",
                "ui_overlay_tokens",
                "event_tokens",
                "total_signal_tokens",
            ]
        )

        for s in stats:
            cats = category_summary(s.token_counts)
            writer.writerow(
                [
                    s.basename,
                    int(s.mtime),
                    s.compressed_bytes,
                    s.decompressed_bytes,
                    cats["observer_tokens"],
                    cats["dom_tokens"],
                    cats["rtc_audio_tokens"],
                    cats["ui_overlay_tokens"],
                    cats["event_tokens"],
                    sum(s.token_counts.values()),
                ]
            )


def main() -> int:
    args = parse_args()
    paths = sorted(glob(args.glob), key=os.path.getmtime)

    if not paths:
        print(f"No files matched: {args.glob}", file=sys.stderr)
        return 1

    print(f"Analyzing {len(paths)} snapshot(s)...")
    stats = [analyze_snapshot(path) for path in paths]

    print_timeline(stats)
    print_category_deltas(stats)
    print_growth_velocity(stats)
    print_top_growth(stats, args.top)
    print_top_slopes(stats, args.slope_top)

    if args.ws_log:
        print_ws_rate_summary(args.ws_log)

    if args.har:
        print_har_ws_summary(args.har)

    if args.csv:
        write_csv(stats, args.csv)
        print(f"\nWrote CSV summary: {args.csv}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
