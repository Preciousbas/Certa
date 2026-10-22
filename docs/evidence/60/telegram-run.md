# Prompt 60 — Telegram run

Phone screenshots were not taken in this session. The handler suite in `src/bot/handlers.test.ts` drives every flow against a mocked update and an in-memory database. It does not open Telegram and it does not send messages to a real chat.

Flows covered by that suite: start, how it works, role menus, join (invalid, expired, used, valid), create project, upload batch, accept, ask for a change, fund, photo stage list, verdict lines B-VF-1 through B-VF-7, certify, reject, approve under the cap, approve over the cap, double approve, decline, contractor blocked from approve, release failure, dispute, variation, wallet, technical details, project switch.

A live pass on a phone still needs to be recorded here with one image per flow.
