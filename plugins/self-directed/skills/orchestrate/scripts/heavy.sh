#!/bin/sh
# heavy: run a heavy job (full test suite, build, browser run, dependency
# install, dev server or app instance) under a machine-wide cap shared by every
# agent of this user. It waits for one of HEAVY_SLOTS slots (default 2), runs
# the command under `nice -n 10`, and frees the slot when the command exits.
#
#   heavy npm test --workspaces
#   HEAVY_SLOTS=1 heavy npx playwright test
#
# Each slot is a symlink under HEAVY_DIR (default /tmp/heavy-slots-<uid>) whose
# target is the holder's pid. `ln -s` is atomic and fails if the slot exists, so
# a slot is never seen without its pid. A slot whose holder is dead is reclaimed
# under a short per-slot lock that re-reads the pid first, so two waiters can't
# both reclaim it.
#
# Limits: if the holder's pid is reused by an unrelated process, the slot looks
# held until that process exits (conservative). If `heavy` itself is killed
# with SIGKILL, its child may keep running briefly after the slot is reclaimed.

[ "$#" -gt 0 ] || { echo "usage: heavy <command> [args...]" >&2; exit 2; }

slots=${HEAVY_SLOTS:-2}
case $slots in ""|*[!0-9]*|0) echo "heavy: HEAVY_SLOTS must be a positive number" >&2; exit 2 ;; esac
dir=${HEAVY_DIR:-/tmp/heavy-slots-$(id -u)}
mkdir -p "$dir" 2>/dev/null
[ -d "$dir" ] && [ -O "$dir" ] || { echo "heavy: $dir is not a directory owned by you" >&2; exit 2; }
chmod 700 "$dir"

# reclaim <slot> <dead-pid>: remove the slot only if it still names that pid.
reclaim() {
  lock="$1.reclaim"
  if ! mkdir "$lock" 2>/dev/null; then
    # A reclaim lock left by a killed process is cleared after a minute.
    [ -n "$(find "$lock" -prune -mmin +1 2>/dev/null)" ] && rmdir "$lock" 2>/dev/null
    return 1
  fi
  [ "$(readlink "$1" 2>/dev/null)" = "$2" ] && rm -f "$1"
  rmdir "$lock"
}

waited=0
while :; do
  i=1
  while [ "$i" -le "$slots" ]; do
    slot="$dir/slot-$i"
    if ln -s "$$" "$slot" 2>/dev/null; then
      trap 'rm -f "$slot"' EXIT
      trap 'exit 130' INT
      trap 'exit 143' TERM
      trap 'exit 129' HUP
      nice -n 10 "$@"
      exit $?
    fi
    holder=$(readlink "$slot" 2>/dev/null)
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null && reclaim "$slot" "$holder"; then
      continue # the slot was freed: try it again
    fi
    i=$((i + 1))
  done
  [ "$waited" -eq 0 ] && echo "heavy: all $slots slots busy, waiting..." >&2
  waited=1
  sleep 2
done
