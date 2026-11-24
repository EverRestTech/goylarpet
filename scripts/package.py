"""Package only the MV3 extension for the Chrome Web Store dashboard."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
source = root / "extension"
manifest = json.loads((source / "manifest.json").read_text())
archive = root / "dist" / f"goylarpet-{manifest['version']}.zip"
archive.parent.mkdir(exist_ok=True)
with ZipFile(archive, "w") as package:
    for path in sorted(source.rglob("*")):
        name = path.relative_to(source)
        if not path.is_file() or path.is_symlink() or any(part.startswith(".") for part in name.parts):
            continue
        entry = ZipInfo(name.as_posix(), (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        package.writestr(entry, path.read_bytes())
with ZipFile(archive) as package:
    assert package.testzip() is None
    assert json.loads(package.read("manifest.json")) == manifest
    for path in [manifest["action"]["default_popup"], *manifest["icons"].values()]:
        assert path in package.namelist()
print(archive.relative_to(root))
