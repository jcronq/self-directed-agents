#!/bin/bash
# Offline test for pr-watch.sh with a stub gh. Run: bash tests/pr-watch.test.sh
S="$(cd "$(dirname "$0")/.." && pwd)/plugins/self-directed/skills/orchestrate/scripts/pr-watch.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; fails=0
cat > "$T/gh" <<'STUB'
#!/bin/bash
# GH_MODE=ok: an open PR with one unanswered comment and one paged thread list; GH_MODE=fail: every call fails
[ "${GH_MODE:-ok}" = fail ] && { echo "stub gh: simulated failure" >&2; exit 1; }
args="$*"; jqf=""; prev=""; for a in "$@"; do [ "$prev" = --jq ] && jqf=$a; prev=$a; done
out() { if [ -n "$jqf" ]; then printf '%s' "$1" | jq -r "$jqf"; else printf '%s' "$1"; fi; }
case "$args" in
  *graphql*) case "$args" in *a=C1*) out '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[{"id":"T2","isResolved":false,"path":"b","comments":{"nodes":[{"author":{"login":"rev"},"body":"two"}]}}]}}}}}';;
    *) out '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":true,"endCursor":"C1"},"nodes":[{"id":"T1","isResolved":false,"path":"a","comments":{"nodes":[{"author":{"login":"rev"},"body":"one"}]}}]}}}}}';; esac;;
  *issues/*/comments*) out '[{"id":1,"user":{"login":"Rev"},"created_at":"2026-01-02T00:00:00Z","body":"question?"}]';;
  *pulls/*/comments*|*pulls/*/reviews*) out '[]';;
  *mergeStateStatus*) out '{"mergeStateStatus":"CLEAN"}';;
  *"pr view"*) out '{"state":"OPEN","headRefOid":"abcdef1234567","mergeable":"MERGEABLE","reviewDecision":null,"statusCheckRollup":[],"url":"u"}';;
  *) echo "stub gh: unhandled $args" >&2; exit 1;;
esac
STUB
chmod +x "$T/gh"
run() { rm -rf "$T/box" "$T/state"; env GH="$T/gh" GH_MODE=$1 PR=1 REPO=o/r ONCE=1 ME=me MAIL_BOX="$T/box" STATE_DIR="$T/state" "${@:2}" bash "$S" 2>"$T/err"; rc=$?
  nstate=$(find "$T/state" -type f | wc -l | tr -d ' '); nmail=$(find "$T/box/wake" -type f 2>/dev/null | wc -l | tr -d ' '); }
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1 (rc=$rc state=$nstate mail=$nmail)"; fails=$((fails+1)); fi; }
run fail;  check "failing gh: exit 1, no state, no mail, stderr line" '[ $rc -eq 1 ] && [ $nstate -eq 0 ] && [ $nmail -eq 0 ] && grep -q "skipping this pass" "$T/err"'
run ok;    check "good run: exit 0, state written" '[ $rc -eq 0 ] && [ $nstate -ge 6 ]'
check "good run: unanswered comment and both thread pages mailed at start" 'grep -rq "comments with no reply" "$T/box/wake" && grep -rq "thread T2" "$T/box/wake" && grep -rq "thread T1" "$T/box/wake"'
check "mail has no about line unless MAIL_ABOUT is set" '! grep -rq "^about:" "$T/box/wake"'
run ok MAIL_ABOUT=chat; check "MAIL_ABOUT adds the about line" 'grep -rq "^about: chat" "$T/box/wake"'
env GH="$T/gh" PR=1 REPO=o/r ME=me STATE_DIR="$T/s2" bash "$S" 2>"$T/err"; rc=$?; check "no MAIL_BOX: exit 2 with a clear error" '[ $rc -eq 2 ] && grep -q MAIL_BOX "$T/err"'
[ $fails -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
