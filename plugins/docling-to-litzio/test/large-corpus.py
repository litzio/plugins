"""Disposable fixed-conversion synthesis. Never invokes a converter or edits fixtures."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--mixed", action="store_true")
parser.add_argument("--copies", type=int, default=1)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[3]
sources = []
for name, folder in [("LSR", "lsr-1.1"), ("NIST", "nist-sp1108r4")]:
    base = repo / "fixtures" / folder / "converted"
    record = json.loads((base / "conversion-record.json").read_text(encoding="utf-8"))
    sources.append((name, json.loads((base / "document.json").read_text(encoding="utf-8")), record, PdfReader(base / record["source"]["file"])))
sections = ([0, 1] * 5) if args.mixed else [0] * args.copies
result = copy.deepcopy(sources[0][1])
collections = [k for k, v in result.items() if isinstance(v, list)]
for _, doc, _, _ in sources:
    for k, value in doc.items():
        if isinstance(value, list) and k not in collections:
            collections.append(k)
for k in collections:
    result[k] = []
result["body"]["children"] = []
result["furniture"]["children"] = []
result["pages"] = {}
writer = PdfWriter()
page_offset = 0
for section, source_index in enumerate(sections):
    name, doc, _, reader = sources[source_index]
    offsets = {k: len(result[k]) for k in collections}
    divider = int(args.mixed)
    def relocate(value):
        if isinstance(value, list):
            return [relocate(v) for v in value]
        if isinstance(value, dict):
            return {k: (v + page_offset + divider if k == "page_no" else relocate(v)) for k, v in value.items()}
        if isinstance(value, str) and value.startswith("#/"):
            parts = value.split("/")
            if len(parts) == 3 and parts[1] in offsets and parts[2].isdigit():
                return f"#/{parts[1]}/{int(parts[2]) + offsets[parts[1]]}"
        return value
    for k in collections:
        result[k].extend(relocate(doc.get(k, [])))
    if args.mixed:
        # Different section identifiers and numeric values exist in BOTH PDF and source JSON.
        # Original fixture values are retained; this is diversity, not an independent real corpus.
        text = f"Synthetic section S{section + 1:02d} {name}: threshold {1000 + 37 * section} ms"
        stream = io.BytesIO()
        page = canvas.Canvas(stream, pagesize=(612, 792), invariant=1)
        page.setFont("Helvetica", 12)
        page.drawString(36, 750, text)
        page.save()
        writer.add_page(PdfReader(io.BytesIO(stream.getvalue())).pages[0])
        ref = f"#/texts/{len(result['texts'])}"
        result["texts"].append({"self_ref": ref, "parent": {"$ref": "#/body"}, "children": [], "label": "text", "text": text, "orig": text, "prov": [{"page_no": page_offset + 1, "bbox": {"l": 36, "t": 28, "r": 560, "b": 46, "coord_origin": "TOPLEFT"}, "charspan": [0, len(text)]}]})
        result["body"]["children"].append({"$ref": ref})
        result["pages"][str(page_offset + 1)] = {"page_no": page_offset + 1, "size": {"width": 612, "height": 792}}
    result["body"]["children"].extend(relocate(doc["body"]["children"]))
    result["furniture"]["children"].extend(relocate(doc["furniture"]["children"]))
    for p in doc["pages"].values():
        new = relocate(p)
        result["pages"][str(new["page_no"])] = new
    for p in reader.pages:
        writer.add_page(p)
    page_offset += len(reader.pages) + divider
args.output.mkdir(parents=True, exist_ok=False)
writer.write(args.output / "source.pdf")
raw = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
(args.output / "document.json").write_bytes(raw)
pdf = (args.output / "source.pdf").read_bytes()
record = copy.deepcopy(sources[0][2])
record["source"] = {"file": "source.pdf", "sha256": hashlib.sha256(pdf).hexdigest(), "bytes": len(pdf)}
record["document"].update(sha256=hashlib.sha256(raw).hexdigest(), page_count=page_offset)
record["synthetic"] = {"sections": len(sections), "mixed": args.mixed, "independent_semantic_quality": False}
(args.output / "conversion-record.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"pages": page_offset, "sections": len(sections), "mixed": args.mixed}))
