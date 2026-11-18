"""Local build and inspection of the OpenSignet Python distributions. Never uploads.

Usage (from the repository root, with the hash-locked build tools installed):

    python scripts/python-release.py version
    python scripts/python-release.py build --output release/python
    python scripts/python-release.py verify --output release/python
    python scripts/python-release.py check-pypi --output release/python

Publishing is a separate manual step described in RELEASING.md.
"""

import argparse
import email.parser
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile
import tomllib
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PYTHON_PACKAGES = {"opensignet-crewai": "crewai-plugin", "opensignet-autogen": "autogen-plugin"}
NPM_PACKAGES = ["shared", "sdk", "mcp-server", "agentkit-plugin", "eliza-plugin", "langchain-plugin"]
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_REGISTRY = 4 * 1024 * 1024
REGISTRY_TIMEOUT = 10
FORBIDDEN_PARTS = (".git", ".env", ".qa", ".codex", "secrets.json", "frontend.env", "__pycache__")


class ReleaseError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def stable_version(value):
    require(
        isinstance(value, str) and re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", value) is not None,
        f"not a stable MAJOR.MINOR.PATCH version: {value!r}",
    )
    return value


def source_version(repo=ROOT):
    """Returns the one version shared by all eight publishable packages."""
    versions = {}
    for slug in NPM_PACKAGES:
        manifest = json.loads((repo / "packages" / slug / "package.json").read_bytes())
        require(manifest.get("name") == f"@opensignet/{slug}", f"packages/{slug}: unexpected npm name")
        require(not manifest.get("private"), f"packages/{slug}: publishable package is private")
        versions[f"@opensignet/{slug}"] = stable_version(manifest.get("version"))
    for name, folder in PYTHON_PACKAGES.items():
        project = tomllib.loads((repo / "packages" / folder / "pyproject.toml").read_text(encoding="utf-8"))["project"]
        require(project.get("name") == name, f"packages/{folder}: unexpected project name")
        versions[name] = stable_version(project.get("version"))
    require(len(set(versions.values())) == 1, f"package versions disagree: {versions}")
    return next(iter(versions.values()))


def digest(path):
    require(path.is_file() and not path.is_symlink(), f"{path.name}: not a regular file")
    require(path.stat().st_size <= MAX_ARCHIVE, f"{path.name}: archive exceeds the size limit")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_name(name):
    require(isinstance(name, str) and name and "\\" not in name and ":" not in name, f"unsafe archive path {name!r}")
    parts = name.rstrip("/").split("/")
    require(all(part not in ("", ".", "..") for part in parts), f"unsafe archive path {name!r}")
    require(not PurePosixPath(name).is_absolute(), f"absolute archive path {name!r}")
    lowered = [part.lower() for part in parts]
    require(not any(part in FORBIDDEN_PARTS or part.startswith(".venv") for part in lowered), f"forbidden archive path {name!r}")
    require(not name.endswith((".pyc", ".pfx", ".key", ".pem")), f"forbidden archive file {name!r}")


def contents(path):
    """Reads an archive without extracting it; links, devices and duplicates are refused."""
    digest(path)
    result = {}
    expanded = 0
    if path.name.endswith(".whl"):
        with zipfile.ZipFile(path) as archive:
            items = archive.infolist()
            require(len(items) <= MAX_ENTRIES, f"{path.name}: too many entries")
            for item in items:
                safe_name(item.filename)
                require(not stat.S_ISLNK(item.external_attr >> 16), f"{item.filename}: symbolic link")
                require(item.filename not in result, f"{item.filename}: duplicate entry")
                expanded += item.file_size
                require(expanded <= MAX_EXPANDED, f"{path.name}: expanded size exceeds the limit")
                result[item.filename] = b"" if item.is_dir() else archive.read(item)
    else:
        with tarfile.open(path, "r:gz") as archive:
            for index, item in enumerate(archive):
                require(index < MAX_ENTRIES, f"{path.name}: too many entries")
                require(item.isfile() or item.isdir(), f"{item.name}: not a regular file or directory")
                safe_name(item.name)
                require(item.name not in result, f"{item.name}: duplicate entry")
                expanded += item.size
                require(expanded <= MAX_EXPANDED, f"{path.name}: expanded size exceeds the limit")
                extracted = archive.extractfile(item) if item.isfile() else None
                result[item.name] = extracted.read() if extracted else b""
    require(result, f"{path.name}: empty archive")
    return result


def apache_license(files, prefix, label):
    license_text = files.get(prefix + "LICENSE", b"")
    require(b"Apache License" in license_text and b"Version 2.0, January 2004" in license_text, f"{label}: Apache-2.0 LICENSE missing")
    require(bool(files.get(prefix + "NOTICE", b"").strip()), f"{label}: NOTICE missing")


def inspect_python(path, project, version):
    stable_version(version)
    require(project in PYTHON_PACKAGES, f"unknown project {project}")
    normalized = project.replace("-", "_")
    wheel = path.name.endswith(".whl")
    require(path.name in {f"{normalized}-{version}-py3-none-any.whl", f"{normalized}-{version}.tar.gz"}, f"unexpected file {path.name}")
    files = contents(path)
    metadata = f"{normalized}-{version}.dist-info/METADATA" if wheel else f"{normalized}-{version}/PKG-INFO"
    require(metadata in files, f"{path.name}: metadata missing")
    parsed = email.parser.BytesParser().parsebytes(files[metadata])
    require(parsed.get_all("Name") == [project] and parsed.get_all("Version") == [version], f"{path.name}: name or version mismatch")
    require(parsed.get_all("License-Expression") == ["Apache-2.0"], f"{path.name}: license must be Apache-2.0")
    require(sorted(parsed.get_all("License-File") or []) == ["LICENSE", "NOTICE"], f"{path.name}: LICENSE and NOTICE must be declared")
    prefix = f"{normalized}-{version}.dist-info/licenses/" if wheel else f"{normalized}-{version}/"
    apache_license(files, prefix, path.name)
    require(any(name.endswith("/__init__.py") and f"{normalized}/" in name for name in files), f"{path.name}: package module missing")
    roots = (f"{normalized}/", f"{normalized}-{version}.dist-info/") if wheel else (f"{normalized}-{version}/",)
    require(all(name.startswith(roots) for name in files), f"{path.name}: unexpected top-level entry")
    return {"filename": path.name, "sha256": digest(path), "bytes": path.stat().st_size, "project": project}


def inventory(output, version):
    expected = {f"{name.replace('-', '_')}-{version}{suffix}": name for name in PYTHON_PACKAGES for suffix in ("-py3-none-any.whl", ".tar.gz")}
    directory = output / "dist"
    require(directory.is_dir() and not directory.is_symlink(), f"{directory}: missing")
    require({path.name for path in directory.iterdir()} == set(expected), f"{directory}: expected exactly {sorted(expected)}")
    return [inspect_python(directory / name, project, version) for name, project in sorted(expected.items())]


def git_commit(repo=ROOT):
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    require(re.fullmatch(r"[0-9a-f]{40}", commit) is not None, "git HEAD is not a commit")
    return commit


def build(output, repo=ROOT, runner=subprocess.run):
    version = source_version(repo)
    require(not output.exists(), f"{output} already exists; remove it before building a new release")
    (output / "dist").mkdir(parents=True)
    for folder in PYTHON_PACKAGES.values():
        runner([sys.executable, "-m", "build", "--no-isolation", "--outdir", str(output / "dist"), str(repo / "packages" / folder)], check=True, timeout=180)
    manifest = {"schema": 1, "commit": git_commit(repo), "version": version, "files": inventory(output, version)}
    (output / "release.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def verify(output):
    manifest = json.loads((output / "release.json").read_bytes())
    version = stable_version(manifest.get("version"))
    require(manifest.get("files") == inventory(output, version), "release.json no longer matches the built files")
    return manifest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def pypi_status(project, version):
    request = urllib.request.Request(f"https://pypi.org/pypi/{project}/{version}/json", headers={"Accept": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=REGISTRY_TIMEOUT) as response:
            response.read(MAX_REGISTRY)
            return response.status
    except urllib.error.HTTPError as error:
        error.close()
        return error.code


def check_pypi(manifest, lookup=pypi_status):
    """Read-only: refuses a version that already exists on PyPI (uploads are immutable)."""
    taken = []
    for project in PYTHON_PACKAGES:
        status = lookup(project, manifest["version"])
        if status == 200:
            taken.append(f"{project}=={manifest['version']}")
        else:
            require(status == 404, f"PyPI lookup for {project} returned HTTP {status}")
    require(not taken, f"already published on PyPI: {', '.join(taken)}")


def main(argv=None):
    parser = argparse.ArgumentParser(allow_abbrev=False, description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("version", "build", "verify", "check-pypi"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.command == "version":
        print(source_version())
        return
    if args.output is None:
        parser.error(f"{args.command} requires --output")
    output = args.output.resolve()
    if args.command == "build":
        manifest = build(output)
        print(f"Built and inspected {len(manifest['files'])} Python artifacts for {manifest['version']} in {output}.")
        print("Nothing was uploaded. See RELEASING.md for the manual upload step.")
    elif args.command == "verify":
        manifest = verify(output)
        print(f"Verified {len(manifest['files'])} Python artifacts for {manifest['version']}.")
    else:
        check_pypi(verify(output))
        print("These versions are not on PyPI yet.")


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"Python release check failed: {error}", file=sys.stderr)
        sys.exit(1)
