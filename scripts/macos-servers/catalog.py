#!/usr/bin/env python3
"""Ties the Mac server builds to catalog/catalog.json.

  catalog.py versions <id>           print the versions of <id> NexDB offers, one per line
  catalog.py add <out_dir> <base_url>  add macos.x64 / macos.arm64 downloads for every
                                     <id>-<version>-macos-<chip>.tar.xz in <out_dir>
  catalog.py release <repo> <tag>    the same, read straight from a published GitHub release
                                     (sizes, .sha256 and .minos files), nothing downloaded

<base_url> is where the .tar.xz files are published (a GitHub release's download address).
Windows entries are left exactly as they are.
"""
import json
import pathlib
import re
import sys
import urllib.request

CATALOG = pathlib.Path(__file__).resolve().parents[2] / "catalog" / "catalog.json"
# Catalog ids that are "tools" (one version) rather than components with release lines.
TOOLS = {"redis", "postgres", "mailpit", "mariadb", "mongodb", "memcached", "python", "git", "cloudflared"}
NAME = re.compile(r"^(?P<id>[a-z]+)-(?P<version>[0-9][0-9.]*)-macos-(?P<chip>x64|arm64)\.tar\.xz$")


def version_key(v):
    return tuple(int(p) for p in v.split(".") if p.isdigit())


def load():
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def versions(cat, cid):
    if cid in TOOLS:
        tool = cat["tools"].get(cid)
        return [tool["version"]] if tool else []
    comp = next((c for c in cat["components"] if c["id"] == cid), None)
    return [line["latest"] for line in comp["lines"]] if comp else []


def local_files(out_dir, base_url):
    """(name, url, size, sha256, minos or None) for each build in a folder."""
    for archive in sorted(pathlib.Path(out_dir).rglob("*.tar.xz")):
        minos = archive.with_name(archive.name + ".minos")
        yield (archive.name, f"{base_url.rstrip('/')}/{archive.name}", archive.stat().st_size,
               archive.with_name(archive.name + ".sha256").read_text(),
               minos.read_text() if minos.exists() else None)


def release_files(repo, tag):
    """The same, from a GitHub release: only the small .sha256 and .minos files are fetched."""
    def get(url):
        return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "nexdb-catalog"})).read()
    rel = json.loads(get(f"https://api.github.com/repos/{repo}/releases/tags/{tag}"))
    assets = {a["name"]: a for a in rel["assets"]}
    for name, a in sorted(assets.items()):
        if not name.endswith(".tar.xz"):
            continue
        minos = assets.get(name + ".minos")
        yield (name, a["browser_download_url"], a["size"],
               get(assets[name + ".sha256"]["browser_download_url"]).decode(),
               get(minos["browser_download_url"]).decode() if minos else None)


def add(cat, files):
    added = 0
    for name, url, size, sha, floor in files:
        m = NAME.match(name)
        if not m:
            continue
        sha = sha.split()[0].strip()
        floor = floor.strip() if floor else None
        download = {"url": url, "size": size, "checksum": {"algo": "sha256", "value": sha}}
        cid, version, chip = m["id"], m["version"], m["chip"]
        if cid in TOOLS:
            slots = [cat["tools"][cid]] if cat["tools"].get(cid, {}).get("version") == version else []
        else:
            comp = next((c for c in cat["components"] if c["id"] == cid), {"lines": []})
            slots = [line for line in comp["lines"] if line["latest"] == version]
        if not slots:
            print(f"skipped {name}: the catalog has no {cid} {version}")
            continue
        for slot in slots:
            mac = slot.setdefault("macos", {})
            mac[chip] = download
            # The oldest macOS this program runs on, when newer than NexDB's own floor (13.0).
            if floor and version_key(floor) > version_key(mac.get("min_macos", "0")):
                mac["min_macos"] = floor
            added += 1
    CATALOG.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"added {added} Mac downloads to {CATALOG}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "versions":
        print("\n".join(versions(load(), sys.argv[2])))
    elif len(sys.argv) == 4 and sys.argv[1] == "add":
        add(load(), local_files(sys.argv[2], sys.argv[3]))
    elif len(sys.argv) == 4 and sys.argv[1] == "release":
        add(load(), release_files(sys.argv[2], sys.argv[3]))
    else:
        sys.exit(__doc__)
