# Checklist eval 2026-10-22

Model gpt-6.1-sol. Prompts stage_verify.v3 and stage_verify.v2. Photos 6. T stays 0.75. No chain transaction. v3 asks twice and passes only when both runs pass. Confidence for v3 is yes answers divided by the checklist. v3 seconds in the table are the two runs added. The average below is per call.

| File | Prompt | Claimed | Expected | Predicted | False pass | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| real-01.jpg | stage_verify.v2 | 2 | fail | fail | no | 179.4 |
| real-02.jpg | stage_verify.v2 | 4 | pass | fail | no | 229.9 |
| real-01.jpg | stage_verify.v3 | 2 | fail | unsure | no | 119.4 |
| real-02.jpg | stage_verify.v3 | 4 | pass | fail | no | 193.5 |
| real-03.jpg | stage_verify.v2 | 5 | pass | fail | no | 224.6 |
| real-04.jpg | stage_verify.v2 | 5 | fail | unparsed | no | 238.6 |
| real-03.jpg | stage_verify.v3 | 5 | pass | pass | no | 167 |
| real-04.jpg | stage_verify.v3 | 5 | fail | fail | no | 135.9 |
| real-05.jpg | stage_verify.v2 | 6 | pass | unsure | no | 172.6 |
| real-05.jpg | stage_verify.v3 | 6 | pass | pass | no | 170.1 |
| real-06.jpg | stage_verify.v2 | 7 | fail | unparsed | no | 239.4 |
| real-06.jpg | stage_verify.v3 | 7 | fail | fail | no | 143.7 |

## stage_verify.v3

Parsed 6 of 6. Correct pass/fail 4. False passes 0. Average 77.5 seconds per call.

## stage_verify.v2

Parsed 4 of 6. Correct pass/fail 1. False passes 0. Average 214.1 seconds per call.
