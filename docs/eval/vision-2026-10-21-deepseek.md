# Vision eval 2026-10-21

Models: deepseek-v4-flash. Prompts: stage_verify.v1, stage_verify.v2. Labels: 44. Parsed replies: 5. Unparsed replies: 83.

## Confusion (truth → predicted pass/fail/unsure)

Unparsed replies are counted in the unsure column.

| Truth | deepseek-v4-flash / stage_verify.v1 | deepseek-v4-flash / stage_verify.v2 |
| --- | --- | --- |
| pass | p0/f0/u4 | p0/f0/u4 |
| fail | p0/f0/u12 | p0/f0/u12 |
| unsure | p0/f0/u28 | p0/f2/u26 |

## Scores

Scores below use parsed replies. A predicted pass counts toward precision and the false-pass rate only when confidence is at least 0.75, matching the decision rule at the default threshold. Recall uses the same bar.

- Precision of pass: n/a (0 false passes / 0 predicted passes).
- False-pass rate: n/a.
- Recall of pass: n/a.
- Observed-stage accuracy: 0.400.
- Latency total: 1875585 ms. Mean: 21313 ms.
- Cost: not returned by the gateway. Stored as null. No price was invented.

## Calibration

| Confidence | n | Accuracy |
| --- | --- | --- |
| 0.00–0.49 | 2 | 1.00 |
| 0.50–0.74 | 1 | 0.00 |
| 0.75–0.89 | 1 | 0.00 |
| 0.90–1.00 | 1 | 0.00 |

## Threshold

Chosen T = 0.75. At T=0.75 the false-pass rate is 0.0% (0 of 0 predicted passes). This is the lowest value in {0.75, 0.80, 0.85, 0.90, 0.95} that keeps false passes at or under 2%.

83 of 88 replies did not parse, so this is not a false-pass measurement of the full labelled set. T stays at 0.75 because the run produced no predicted passes that would justify raising it.
