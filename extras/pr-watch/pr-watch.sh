#!/bin/bash
# Watches one PR (and optionally its Jira ticket) and turns each change into one wake mail.
# Usage: REPO=owner/name PR=123 ./pr-watch.sh   (see README.md for every variable)
# Bash 3.2 compatible (macOS default). Needs: gh (authenticated), jq, perl, python3 only when JIRA_API_SCRIPT is set.
set -u
R=${REPO:?set REPO=owner/name}; PR=${PR:?set PR=<number>}
ME=${ME:-$(gh api user --jq .login 2>/dev/null)}          # your own GitHub login: its comments are not reported
[ -n "$ME" ] || { echo "pr-watch: set ME=<your GitHub login> (gh api user failed)" >&2; exit 2; }
INTERVAL=${INTERVAL:-60}
ONCE=${ONCE:-}                                             # non-empty: one pass, then exit
MAIL_ROOT=${MAIL_ROOT:-$HOME/agent-mail}
BOX=${MAIL_BOX:-$MAIL_ROOT/ui-agent}                       # mailbox directory; wake mail goes to $BOX/wake
STATE=${STATE_DIR:-$HOME/.pr-watch}/state-$(printf '%s' "$R" | tr '/' '_')-$PR
JIRA=${JIRA:-}; JIRA_ME=${JIRA_ME:-}                       # optional ticket key; display name whose comments to ignore
JIRA_API_SCRIPT=${JIRA_API_SCRIPT:-}                       # optional: python script with `get <path>`; Jira is skipped when unset
mkdir -p "$STATE" "$BOX/tmp" "$BOX/wake" || exit 2

send() { # subject, body: write to tmp, then rename into wake so a reader never sees a partial file
  local ts rand name
  ts=$(perl -MTime::HiRes=gettimeofday -MPOSIX=strftime -e '($s,$u)=gettimeofday; printf "%s.%06dZ", strftime("%Y%m%dT%H%M%S",gmtime $s), $u')
  rand=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6); name=$ts-pr-watch-$rand.md
  printf -- '---\nfrom: pr-watch\nsubject: "%s"\nkind: pr-update\nabout: chat\n---\n%s\n' "$1" "$2" > "$BOX/tmp/$name"
  mv "$BOX/tmp/$name" "$BOX/wake/$name"
}
changed() { # key, value -> true when the value differs from the last one seen; first run only records
  local f="$STATE/$1"; if [ ! -f "$f" ]; then printf '%s' "$2" > "$f"; return 1; fi
  [ "$(cat "$f")" != "$2" ] && { printf '%s' "$2" > "$f"; return 0; }; return 1
}
newlines() { # file, current text -> lines in text that are not in file
  comm -13 <(sort "$1") <(sort <<<"$2") | grep -v '^$'
}

while true; do
  v=$(gh pr view "$PR" --repo "$R" --json state,headRefOid,mergeable,reviewDecision,statusCheckRollup,url 2>/dev/null) || { [ -n "$ONCE" ] && { echo "pr-watch: gh pr view failed" >&2; exit 1; }; sleep "$INTERVAL"; continue; }
  head=$(jq -r '.headRefOid[0:7]' <<<"$v")
  checks=$(jq -r '[.statusCheckRollup[]|.name+"="+(.conclusion // .status)]|sort|join("; ")' <<<"$v")
  state=$(jq -r .state <<<"$v")
  url=$(jq -r .url <<<"$v")
  changed head "$head" && send "PR $PR: new head $head" "New commit on $url: head is now $head. Approvals on the old head may be dismissed; re-check before saying ready to merge."
  changed checks "$head $checks" && send "PR $PR: checks changed" "Head $head. Checks: $checks. $url"
  changed review "$(jq -r '(.reviewDecision // "none")+" "+.mergeable' <<<"$v")" && send "PR $PR: review or mergeable changed" "reviewDecision/mergeable: $(jq -r '(.reviewDecision // "none")+" / "+.mergeable' <<<"$v"). $url"

  # Comments, inline comments and reviews by anyone but ME. New ones are mailed; the first pass also mails
  # the ones that are still unanswered (newer than my latest comment or review), never silently baselines them.
  cm=$( { gh api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase!="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|"issue \(.id) \(.user.login) \(.created_at): \(.body[0:300]|gsub("\n";" "))"'
          gh api --paginate "repos/$R/pulls/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase!="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|"inline \(.id) \(.user.login) \(.created_at) \(.path):\(.line): \(.body[0:300]|gsub("\n";" "))"'
          gh api --paginate "repos/$R/pulls/$PR/reviews" --jq '.[]|select(.user.login|ascii_downcase!="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|"review \(.id) \(.user.login) \(.submitted_at) \(.state): \(.body[0:300]|gsub("\n";" "))"'; } 2>/dev/null)
  if [ -f "$STATE/comments" ]; then
    new=$(newlines "$STATE/comments" "$cm")
    [ -n "$new" ] && send "PR $PR: new comment or review" "$new"
  else
    mine=$( { gh api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase=="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|.created_at'
              gh api --paginate "repos/$R/pulls/$PR/comments" --jq '.[]|select(.user.login|ascii_downcase=="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|.created_at'
              gh api --paginate "repos/$R/pulls/$PR/reviews" --jq '.[]|select(.user.login|ascii_downcase=="'"$(tr 'A-Z' 'a-z' <<<"$ME")"'")|.submitted_at'; } 2>/dev/null | sort | tail -1)
    un=$(while IFS= read -r line; do
           t=$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z' <<<"$line" | head -1)
           [ -n "$line" ] && [ "$t" \> "$mine" ] && printf '%s\n' "$line"
         done <<<"$cm")
    [ -n "$un" ] && send "PR $PR: comments with no reply from you at start" "$un"
  fi
  printf '%s\n' "$cm" > "$STATE/comments"

  if [ -n "$JIRA" ] && [ -n "$JIRA_API_SCRIPT" ]; then
    jc=$(python3 "$JIRA_API_SCRIPT" get "/rest/api/3/issue/$JIRA/comment?orderBy=created&maxResults=100" 2>/dev/null | jq -r --arg me "$JIRA_ME" '.comments[]|select(.author.displayName!=$me)|"\(.id) \(.author.displayName)"' 2>/dev/null)
    if [ -f "$STATE/jira" ]; then
      new=$(newlines "$STATE/jira" "$jc")
      [ -n "$new" ] && send "$JIRA: new Jira comment" "New comment(s) on $JIRA (id author): $new"
    fi
    printf '%s\n' "$jc" > "$STATE/jira"
  fi

  # Unresolved review threads block merges and need a reply; reported at start too, never only as baseline.
  th=$(gh api graphql -f query='query($o:String!,$n:String!,$p:Int!){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100){nodes{id isResolved path comments(last:1){nodes{author{login} body}}}}}}}' -f o="${R%%/*}" -f n="${R##*/}" -F p="$PR" --jq '.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)|"thread \(.id) \(.path) last by \(.comments.nodes[0].author.login): \(.comments.nodes[0].body[0:200]|gsub("\n";" "))"' 2>/dev/null)
  if [ ! -f "$STATE/threads" ]; then
    [ -n "$th" ] && send "PR $PR: unresolved review threads at start" "$th"
  else
    new=$(newlines "$STATE/threads" "$th")
    [ -n "$new" ] && send "PR $PR: unresolved review thread changed or new" "$new"
  fi
  printf '%s\n' "$th" > "$STATE/threads"

  ms=$(gh pr view "$PR" --repo "$R" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null)
  changed merge "$ms" && send "PR $PR: merge state changed" "mergeStateStatus is now $ms. $url"
  if [ "$state" != OPEN ]; then send "PR $PR is $state" "$url is $state. The watcher stops."; exit 0; fi
  [ -n "$ONCE" ] && exit 0
  sleep "$INTERVAL"
done
