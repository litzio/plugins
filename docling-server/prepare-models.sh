#!/usr/bin/env bash
set -euo pipefail
docker exec docling-serve python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="docling-project/CodeFormulaV2", revision="ecedbe111d15c2dc60bfd4a823cbe80127b58af4", local_dir="/opt/app-root/src/.cache/docling/models/docling-project--CodeFormulaV2")'
