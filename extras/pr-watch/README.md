# Optional: PR watcher that wakes the agent

Polls one PR (and optionally its Jira ticket) and writes one wake mail per change, so the agent that owns the PR
hears about every review, comment and check instead of discovering them days later (manual §8).

It mails on: a new head, changed checks, a changed review decision or mergeable state, a changed merge state, new
comments, inline comments and reviews from anyone but you, and unresolved review threads. It does not baseline
what already exists: on the first pass it mails the unresolved threads and the comments newer than your own latest
comment or review ("no reply from you at start"). When the PR is no longer open it mails once and exits.

```bash
REPO=owner/name PR=123 extras/pr-watch/pr-watch.sh            # loops every 60 s until the PR closes
REPO=owner/name PR=123 ONCE=1 extras/pr-watch/pr-watch.sh     # one pass, then exit
```

Needs `gh` (authenticated), `jq`, `perl`, and bash 3.2 or later. Run one watcher per PR you own, in the background.

| Variable | Default | Meaning |
|---|---|---|
| `REPO` | required | `owner/name` |
| `PR` | required | PR number |
| `ME` | `gh api user --jq .login` | Your GitHub login; its comments are not reported (matched case-insensitively) |
| `INTERVAL` | `60` | Seconds between passes |
| `ONCE` | unset | Any value: one pass, then exit |
| `MAIL_ROOT` | `~/agent-mail` | Root of the mailboxes |
| `MAIL_BOX` | `$MAIL_ROOT/ui-agent` | The mailbox directory to wake |
| `STATE_DIR` | `~/.pr-watch` | State goes in `$STATE_DIR/state-<repo>-<pr>/` |
| `JIRA`, `JIRA_ME`, `JIRA_API_SCRIPT` | unset | Optional Jira part, see below |

## Mail protocol (a dependency)

The script assumes a file-based agent mailbox: each wake mail is a markdown file with a small front-matter header
(`from`, `subject`, `kind: pr-update`, `about`), written to `$MAIL_BOX/tmp/<name>.md` and then renamed into
`$MAIL_BOX/wake/` so a reader never sees a half-written file. Something on the other side must watch `wake/` and
start or resume the agent. Both directories are created if missing. If your setup differs, change `send()`.

## Jira (optional)

Set `JIRA=KEY-123`, `JIRA_ME="Your Display Name"` (your own comments are ignored) and `JIRA_API_SCRIPT=/path/api.py`
(a script that answers `python3 api.py get <rest path>` with the Jira REST JSON). When `JIRA` or `JIRA_API_SCRIPT`
is unset, the Jira part is skipped. The first pass records existing Jira comments as the baseline.

## Dry run

```bash
T=$(mktemp -d)
REPO=owner/name PR=123 ONCE=1 MAIL_BOX=$T/box STATE_DIR=$T/state extras/pr-watch/pr-watch.sh
ls $T/box/wake $T/state/*
```
