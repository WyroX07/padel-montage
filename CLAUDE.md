# padel-montage

Desktop editor that auto-detects padel rallies in raw match footage, lets the user adjust the cut, and burns in a score overlay. Detection precision is the top priority.

## Layout
- `engine/` Python 3.12 package `padel_engine` (ingest, detection, evaluation). Tests: `cd engine && ruff check . && pytest -q`.
- `eval/` ground-truth annotations (`padel-rallies/v1` JSON) and predictions. Videos never go in git.
- `app/` Tauri 2 + React + TypeScript (phase 3+).

## Rules
- Every detection change is measured with `padel-engine eval` on `eval/annotations` before it lands; report recall, precision and start/end errors in the PR.
- Recall beats precision: a missed rally costs the user more than a false positive.
- Licensing: the product may be sold later. Only permissive licences (MIT, BSD, Apache-2.0) for code and model weights. No AGPL/GPL (so no Ultralytics YOLO); use RTMDet/RTMPose (Apache-2.0), RT-DETR or similar. Check dataset licences before training on them (PadelTracker100 is CC BY 4.0).
- Inference runs locally through ONNX Runtime; PyTorch is for training only.
- User-facing text is in French.

## Model split for agents
- Opus: architecture, specs, model/metric decisions, reviews.
- Sonnet: implementing specified lots.
- Haiku: repetitive work (test cases, batch annotation pre-fill, reports).
