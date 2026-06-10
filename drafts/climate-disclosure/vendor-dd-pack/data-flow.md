---
slug: climate-vendor-dd-data-flow
date: 2026-06-11
register: doctrine
relates_to: docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md
audience: the risk team at a firm or reporting entity, pre-signature
---

verified-from:
- docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md (pipeline stages, library locations)
- src/services/climate/ingest/classify.js (staging behaviour, threshold, failure codes)
- src/services/climate/calculators/ (deterministic engine, golden fixtures)
- climate-testing/zoo/results-pass1-2026-06-10.md (zero-silent-failure staging evidence)

# Data flow: from source document to auditor pack

The path every document takes, and exactly where a language model is and is never involved.

```
source documents (invoices, meter reads, statements)
      |  email to the engagement ingest address, or workbook upload
      v
ingest: attachment extracted, sha256 fingerprinted, staged
      |
      v
classification: document type, facility, period, scope  <-- LLM step 1
      |  below-confidence results STAGE for human review;
      |  they never auto-commit (threshold 0.8, closed boundary)
      v
evidence register: append-only hash chain, dedicated project
      |
      v
calculation: deterministic code, exact integer arithmetic   <-- NO model
      |  factors from the published government tables, cited per row
      v
draft statements: clause-mapped prose citing register rows  <-- LLM step 2
      |  every factual sentence cites evidence ids; a database
      |  constraint rejects uncited drafted rows
      v
auditor pack: register export, methodology memo, drafts,
coverage report, integrity manifest. Byte-reproducible.     <-- NO model
```

**Where a model is involved.** Two places only: classifying a source document into the schema, and drafting narrative prose. Both outputs are grounded: a classification below the confidence threshold goes to a human-review queue rather than into the register (measured behaviour: in the 48-document corpus test of 2026-06-10, every uncertain document staged and zero entered a number silently), and a draft sentence cannot be saved without citing the register rows behind it.

**Where a model is never involved.** Every number. Emissions arithmetic runs in deterministic code with exact scaled-integer maths, tested against the Australian Government's published NGA Factors 2025 worked examples to the sixth decimal place. Hashing, chain verification and pack assembly are plain cryptography and plain code. A factor change produces new calculation runs with the old runs preserved as superseded history.

**What leaves the engagement project.** Document text sent to the model provider for the two LLM steps, under commercial terms that prohibit training on it (see the subprocessor register). Everything else, the documents, the register, the calculations and the pack, stays in the engagement's own Sydney project.
