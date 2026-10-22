# Extraction eval 2026-10-21

Models requested: (none)

Document model key present: no
This run uses the deterministic spreadsheet reader. A model call is not made when the key is absent, and the same file is not sent twice.

- duplex_lekki_messy.csv: contract_sum_kobo 5525500000, blocking 4, chunks 70, 63 ms
- duplex_lekki_sample.csv: contract_sum_kobo 5525500000, blocking 0, chunks 69, 3 ms, expected sum matched
- duplex_lekki_sample.pdf: contract_sum_kobo 5525500000, blocking 0, chunks 71, 2317 ms, expected sum matched
- duplex_lekki_sample.xlsx: contract_sum_kobo 5525500000, blocking 0, chunks 69, 93 ms, expected sum matched
- duplex_lekki_sample_scanned.pdf: parse unreadable in 5 ms
- milestones_contract_sample.pdf: contract_sum_kobo none, blocking 1, chunks 13, 12 ms

Files read: 6. Expected-sum matches: 3.
Field accuracy, BoQ recall and citation rate for a live model are not in this file because no model call was made.
Injection fixture: duplex_lekki_messy.csv is covered by tests/intake/duplex.test.ts, which asserts the contract sum stays 5525500000.
Cost: 0. Latency above is local parse time only.
