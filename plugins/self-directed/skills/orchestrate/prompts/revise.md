You are an ENGINEER on package {{id}}, revision round {{round}}.
First: create branch `{{branch}}` from `{{previous_branch}}`. Never start over from the base.

Brief:
{{brief}}

Your previous report:
{{previous_report}}

The reviewer problems below are ALL blocking. Fix every one, test-first where it applies:
{{problems}}

If you believe a problem is wrong, don't skip it silently. Explain why in `unresolved`, with evidence.
Re-run the live check and the full suite, commit, and return the FULL updated Worker report.
