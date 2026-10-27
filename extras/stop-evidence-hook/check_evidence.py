#!/usr/bin/env python3
"""Claude Code Stop hook: block once if the final message claims completion without evidence.

Evidence means a test count, a commit SHA, a PR/issue number, or an artifact path.
Blocks at most once per stop (it respects stop_hook_active), so it can't loop.
"""
import json
import os
import re
import sys

CLAIM = re.compile(r"\b(done|completed?|finished|fixed|merged|shipped|all (tests|checks) pass(ed)?|ready to (merge|ship))\b", re.I)
EVIDENCE = re.compile(
    r"\d+\s+(passed|failed|tests?)\b"          # 812 passed
    r"|\bpassed[:=]\s*\d+"                     # passed: 812
    r"|\b[0-9a-f]{7,40}\b"                     # commit sha
    r"|\b(PR|pull|issue)\s*#?\d+|#\d{2,}"     # PR 123 / #123
    r"|\S+\.(png|jpe?g|log|txt|json|html)\b"   # artifact paths
    r"|\bnot (verified|checked|run)\b|\bskipped\b|\bunverified\b",  # honest disclaimers count too
    re.I,
)


def last_assistant_text(path):
    text = ""
    if not path or not os.path.exists(path):
        return text
    with open(path) as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            parts = d.get("message", {}).get("content") or []
            t = " ".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text")
            if t.strip():
                text = t
    return text


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    if data.get("stop_hook_active"):
        return 0
    msg = last_assistant_text(data.get("transcript_path", ""))
    if CLAIM.search(msg) and not EVIDENCE.search(msg):
        print(json.dumps({
            "decision": "block",
            "reason": "Your final message claims completion without evidence. Add the test counts from this run, "
                      "commit SHAs / PR links, live-check artifacts, or say plainly what was not verified.",
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
