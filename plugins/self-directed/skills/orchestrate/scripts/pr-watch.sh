#!/bin/bash
# Watches one PR (and optionally its Jira ticket) and turns each change into one wake mail.
# Usage: MAIL_BOX=<dir> REPO=owner/name PR=123 pr-watch.sh   (see pr-watch.md for every variable)
# Bash 3.2 compatible (macOS default). Needs: gh (authenticated), jq, perl; python3 only when JIRA_API_SCRIPT is set.
# A failed gh or jq call skips the whole pass: no mail, no state written, one line on stderr.
set -u
R=${REPO:?set REPO=owner/name}; PR=${PR:?set PR=<number>}
GH=${GH:-gh}                                               # the gh binary; point at a stub to simulate failures
ME=${ME:-$("$GH" api user --jq .login 2>/dev/null)}        # your own GitHub login: its comments are not reported
[ -n "$ME" ] || { echo "pr-watch: set ME=<your GitHub login> (gh api user failed)" >&2; exit 2; }
if [ -n "${MAIL_BOX:-}" ]; then BOX=$MAIL_BOX
elif [ -n "${MAIL_ROOT:-}" ] && [ -n "${MAIL_TO:-}" ]; then BOX=$MAIL_ROOT/$MAIL_TO
else echo "pr-watch: set MAIL_BOX=<mailbox dir> (or MAIL_ROOT and MAIL_TO); wake mail goes to <box>/wake" >&2; exit 2; fi
MAIL_ABOUT=${MAIL_ABOUT:-}                                 # optional value for an `about:` header line
INTERVAL=${INTERVAL:-60}
ONCE=${ONCE:-}                                             # non-empty: one pass, then exit
STATE=${STATE_DIR:-$HOME/.pr-watch}/state-$(printf '%s' "$R" | tr '/' '_')-$PR
JIRA=${JIRA:-}; JIRA_ME=${JIRA_ME:-}                       # optional ticket key; display name whose comments to ignore
JIRA_API_SCRIPT=${JIRA_API_SCRIPT:-}                       # optional: python script with `get <path>`; Jira is skipped when unset
mkdir -p "$STATE" "$BOX/tmp" "$BOX/wake" || exit 2
LME=$(printf '%s' "$ME" | tr 'A-Z' 'a-z')
case "$LME" in *[!a-z0-9_-]*) echo "pr-watch: ME has unexpected characters" >&2; exit 2;; esac

send() { # subject, body: write to tmp, then rename into wake so a reader never sees a partial file
  local ts rand name about=""
  ts=$(perl -MTime::HiRes=gettimeofday -MPOSIX=strftime -e '($s,$u)=gettimeofday; printf "%s.%06dZ", strftime("%Y%m%dT%H%M%S",gmtime $s), $u')
  rand=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6); name=$ts-pr-watch-$rand.md
  [ -n "$MAIL_ABOUT" ] && about="about: $MAIL_ABOUT
"
  printf -- '---\nfrom: pr-watch\nsubject: "%s"\nkind: pr-update\n%s---\n%s\n' "$1" "$about" "$2" > "$BOX/tmp/$name"
  mv "$BOX/tmp/$name" "$BOX/wake/$name"
}
changed() { # key, value -> true when the value differs from the last one seen; first run only records
  local f="$STATE/$1"; if [ ! -f "$f" ]; then printf '%s' "$2" > "$f"; return 1; fi
  [ "$(cat "$f")" != "$2" ] && { printf '%s' "$2" > "$f"; return 0; }; return 1
}
newlines() { # file, current text -> lines in text that are not in file
  comm -13 <(sort "$1") <(sort <<<"$2") | grep -v '^$'
}
fail() { echo "pr-watch: $1 failed; skipping this pass (no mail, no state written)" >&2; return 1; }

threads() { # all unresolved review threads not last answered by ME, paging until hasNextPage is false
  local after="" page nodes="" q
  q='query($o:String!,$n:String!,$p:Int!,$a:String){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100,after:$a){pageInfo{hasNextPage endCursor} nodes{id isResolved path comments(last:1){nodes{author{login} body}}}}}}}'
  while :; do
    if [ -n "$after" ]; then page=$("$GH" api graphql -f query="$q" -f o="${R%%/*}" -f n="${R##*/}" -F p="$PR" -f a="$after") || return 1
    else page=$("$GH" api graphql -f query="$q" -f o="${R%%/*}" -f n="${R##*/}" -F p="$PR") || return 1; fi
    jq -e '.data.repository.pullRequest.reviewThreads' <<<"$page" >/dev/null 2>&1 || return 1
    nodes="$nodes$(jq -r --arg me "$LME" '.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)|select((.comments.nodes[0].author.login // "")|ascii_downcase!=$me)|"thread \(.id) \(.path) last by \(.comments.nodes[0].author.login): \(.comments.nodes[0].body[0:200]|gsub("\n";" "))"' <<<"$page")
" || return 1
    [ "$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage' <<<"$page")" = true ] || break
    after=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor' <<<"$page")
  done
  printf '%s' "$nodes" | grep -v '^$'; return 0
}

pass() { # one polling pass; returns 1 (having changed nothing) when any fetch fails, 2 when the PR is closed
  local v head checks state url review cm_i cm_l cm_r cm mine_i mine_l mine_r mine un th ms jc="" new t line
  # --- fetch everything first; any failure skips the pass before any mail or state write ---
  v=$("$GH" pr view "$PR" --repo "$R" --json state,headRefOid,mergeable,reviewDecision,statusCheckRollup,url) || { fail "gh pr view"; return 1; }
  ms=$("$GH" pr view "$PR" --repo "$R" --json mergeStateStatus --jq .mergeStateStatus) || { fail "gh pr view (merge state)"; return 1; }
  head=$(jq -r '.headRefOid[0:7]' <<<"$v") || { fail "jq"; return 1; }
  checks=$(jq -r '[.statusCheckRollup[]|.name+"="+(.conclusion // .status)]|sort|join("; ")' <<<"$v") || { fail "jq"; return 1; }
  state=$(jq -r .state <<<"$v") || { fail "jq"; return 1; }
  url=$(jq -r .url <<<"$v") || { fail "jq"; return 1; }
  review=$(jq -r '(.reviewDecision // "none")+" / "+.mergeable' <<<"$v") || { fail "jq"; return 1; }
  cm_i=$("$GH" api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|"\(.user.login|ascii_downcase)\tissue \(.id) \(.user.login) \(.created_at): \(.body[0:300]|gsub("\n";" "))"') || { fail "gh api issue comments"; return 1; }
  cm_l=$("$GH" api --paginate "repos/$R/pulls/$PR/comments" --jq '.[]|"\(.user.login|ascii_downcase)\tinline \(.id) \(.user.login) \(.created_at) \(.path):\(.line): \(.body[0:300]|gsub("\n";" "))"') || { fail "gh api inline comments"; return 1; }
  cm_r=$("$GH" api --paginate "repos/$R/pulls/$PR/reviews" --jq '.[]|"\(.user.login|ascii_downcase)\treview \(.id) \(.user.login) \(.submitted_at) \(.state): \(.body[0:300]|gsub("\n";" "))"') || { fail "gh api reviews"; return 1; }
  mine_i=$("$GH" api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase=="'"$LME"'")|.created_at') || { fail "gh api issue comments"; return 1; }
  mine_l=$("$GH" api --paginate "repos/$R/pulls/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase=="'"$LME"'")|.created_at') || { fail "gh api inline comments"; return 1; }
  mine_r=$("$GH" api --paginate "repos/$R/pulls/$PR/reviews" --jq '.[]|select(.user.login|ascii_downcase=="'"$LME"'")|.submitted_at') || { fail "gh api reviews"; return 1; }
  th=$(threads) || { fail "gh api graphql (review threads)"; return 1; }
  if [ -n "$JIRA" ] && [ -n "$JIRA_API_SCRIPT" ]; then
    jc=$(python3 "$JIRA_API_SCRIPT" get "/rest/api/3/issue/$JIRA/comment?orderBy=created&maxResults=100" | jq -r --arg me "$JIRA_ME" '.comments[]|select(.author.displayName!=$me)|"\(.id) \(.author.displayName)"') || { fail "jira"; return 1; }
  fi
  # comments by anyone but ME (lines are "<login>\t<text>")
  cm=$(printf '%s\n%s\n%s\n' "$cm_i" "$cm_l" "$cm_r" | grep -v '^$' | awk -F'\t' -v me="$LME" '$1!=me{print $2}')
  mine=$(printf '%s\n%s\n%s\n' "$mine_i" "$mine_l" "$mine_r" | grep -v '^$' | sort | tail -1)

  # --- everything fetched: now mail and record ---
  changed head "$head" && send "PR $PR: new head $head" "New commit on $url: head is now $head. Approvals on the old head may be dismissed; re-check before saying ready to merge."
  changed checks "$head $checks" && send "PR $PR: checks changed" "Head $head. Checks: $checks. $url"
  changed review "$review" && send "PR $PR: review or mergeable changed" "reviewDecision / mergeable: $review. $url"
  if [ -f "$STATE/comments" ]; then
    new=$(newlines "$STATE/comments" "$cm")
    [ -n "$new" ] && send "PR $PR: new comment or review" "$new"
  else # first pass: report what is still unanswered (newer than my latest comment or review), never silently baseline
    un=$(while IFS= read -r line; do
           t=$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z' <<<"$line" | head -1)
           [ -n "$line" ] && [ "$t" \> "$mine" ] && printf '%s\n' "$line"
         done <<<"$cm")
    [ -n "$un" ] && send "PR $PR: comments with no reply from you at start" "$un"
  fi
  printf '%s\n' "$cm" > "$STATE/comments"
  if [ -n "$JIRA" ] && [ -n "$JIRA_API_SCRIPT" ]; then
    if [ -f "$STATE/jira" ]; then
      new=$(newlines "$STATE/jira" "$jc")
      [ -n "$new" ] && send "$JIRA: new Jira comment" "New comment(s) on $JIRA (id author): $new"
    fi
    printf '%s\n' "$jc" > "$STATE/jira"
  fi
  if [ ! -f "$STATE/threads" ]; then
    [ -n "$th" ] && send "PR $PR: unresolved review threads at start" "$th"
  else
    new=$(newlines "$STATE/threads" "$th")
    [ -n "$new" ] && send "PR $PR: unresolved review thread changed or new" "$new"
  fi
  printf '%s\n' "$th" > "$STATE/threads"
  changed merge "$ms" && send "PR $PR: merge state changed" "mergeStateStatus is now $ms. $url"
  if [ "$state" != OPEN ]; then send "PR $PR is $state" "$url is $state. The watcher stops."; return 2; fi
  return 0
}

while true; do
  pass; rc=$?
  [ $rc -eq 2 ] && exit 0
  if [ -n "$ONCE" ]; then exit $rc; fi
  sleep "$INTERVAL"
done
