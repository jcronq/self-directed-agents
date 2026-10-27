# Optional: Stop hook that requires evidence for completion claims

If an agent's final message says it's done, fixed or merged and gives no test count, SHA, PR number, artifact
path or explicit "not verified", Claude Code tells it once to add the evidence. It never blocks twice in a row.

It's a heuristic (a regex), so it's not installed by default. To enable it, add this to `~/.claude/settings.json`
(or to a project's `.claude/settings.json`):

```json
{ "hooks": { "Stop": [ { "matcher": "", "hooks": [
  { "type": "command", "command": "python3 /ABSOLUTE/PATH/self-directed-agents/extras/stop-evidence-hook/check_evidence.py" }
] } ] } }
```
