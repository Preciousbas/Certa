# Experiments

15 Oct 2026. No vision model key is set, so this is a text-note comparison, not a photo-model ROC.

The set is `packages/ai/evals/cases.json`: 20 site notes, 10 slab and 10 blockwork. Stage identification is scored against the labelled stage index. A release is scored separately. Only `slab-06` ("Pour finished yesterday") is labelled finished. The other 19 notes describe unfinished work.

`recommend_release` here is the existing `decide()` rule: confidence at least 0.85 and `completed: true`. It does not move money.

| Prompt | Stage accuracy | False releases | Missed finishes | Recommend release |
|---|---|---|---|---|
| Loose notes | 80.0% (16/20) | 15 | 0 | 16 |
| Strict notes | 80.0% (16/20) | 2 | 0 | 3 |

Both prompts miss the same four notes: `slab-09`, `blk-06`, `blk-09`, `blk-10`.

The loose prompt treats a clear stage mention as finished, so it recommends release on 15 unfinished notes. The strict prompt requires the words finished, complete, or poured, and it lowers the score when the note is unclear or names a safety problem. It still recommends release on two unfinished notes, because "poured" appears in notes that are not the labelled finish.

Raising the bar from 0.85 to a higher number would not fix the loose prompt. Those 15 misses are scored 0.9. The error is the rule that a recognised stage is a finished stage.
