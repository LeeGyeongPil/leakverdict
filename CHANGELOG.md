# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-12

### Added
- `startSampler()` / `sampleOnce()`: low-cost sampling of `process.memoryUsage()` and active resource kinds into JSONL rows (schema v1), with an unref'd timer, size/count file rotation, an in-memory ring buffer, idempotent `stop()` and write errors reported through `onError`.
- `leakverdict/register` preload for ESM (`--import`) and CommonJS (`--require`), configured with `LEAKVERDICT_FILE`, `LEAKVERDICT_INTERVAL_MS`, `LEAKVERDICT_MAX_BYTES`, `LEAKVERDICT_MAX_FILES`. Each process writes its own `./leakverdict-<pid>.jsonl` by default and `{pid}` in `LEAKVERDICT_FILE` is expanded, so cluster workers and forked children do not share a file. A bad `LEAKVERDICT_*` variable is reported by name and value.
- `readJsonl()`: merges rotated files, sorts by time, drops duplicates, validates rows, warns about several processes and mixed Node versions.
- `analyze()`: lower-envelope trend analysis (slope, R2, largest step) with verdicts `js-heap`, `native-buffer`, `handles`, `allocator-retention`, `none` and `insufficient-data`, each with evidence numbers and a next step.
- `renderReport()` in text, Markdown and JSON, in English and Korean.
- CLI `leakverdict analyze` and `leakverdict simulate` with `--format`, `--fail-on`, `--lang`, `--pid`, threshold options (`--min-samples`, `--min-growth-mb`, `--min-rel-growth`, `--min-r2`) and exit codes 0 / 1 / 2. Giving only `--min-growth-mb` replaces the relative threshold, so lowering it works for big heaps.
- Errors are thrown as `LeakverdictError { code, params }` (13 codes) and rendered per language by the CLI; Korean messages contain no English fragments.
- Dual ESM + CommonJS build, zero runtime dependencies, Node 20 / 22 / 24 CI.

[0.1.0]: https://github.com/LeeGyeongPil/leakverdict/releases/tag/v0.1.0
