import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("python_release", Path(__file__).with_name("python-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

LICENSE = b"Apache License\nVersion 2.0, January 2004\n"


class PythonReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="opensignet-python-release-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def metadata(self, project, version, license="Apache-2.0"):
        return (
            f"Metadata-Version: 2.4\nName: {project}\nVersion: {version}\n"
            f"License-Expression: {license}\nLicense-File: LICENSE\nLicense-File: NOTICE\n\n"
        ).encode()

    def wheel(self, directory, project="opensignet-crewai", version="0.1.0", extra=None, license="Apache-2.0"):
        norm = project.replace("-", "_")
        path = directory / f"{norm}-{version}-py3-none-any.whl"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr(f"{norm}/__init__.py", "")
            archive.writestr(f"{norm}-{version}.dist-info/METADATA", self.metadata(project, version, license))
            archive.writestr(f"{norm}-{version}.dist-info/licenses/LICENSE", LICENSE)
            archive.writestr(f"{norm}-{version}.dist-info/licenses/NOTICE", b"OpenSignet\n")
            for name, data in (extra or {}).items():
                archive.writestr(name, data)
        return path

    def sdist(self, directory, project="opensignet-crewai", version="0.1.0"):
        norm = project.replace("-", "_")
        path = directory / f"{norm}-{version}.tar.gz"
        with tarfile.open(path, "w:gz") as archive:
            for name, data in {
                f"{norm}-{version}/PKG-INFO": self.metadata(project, version),
                f"{norm}-{version}/LICENSE": LICENSE,
                f"{norm}-{version}/NOTICE": b"OpenSignet\n",
                f"{norm}-{version}/src/{norm}/__init__.py": b"",
            }.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        return path

    def release_dir(self, version="0.1.0"):
        dist = self.root / "release" / "dist"
        dist.mkdir(parents=True)
        for project in release.PYTHON_PACKAGES:
            self.wheel(dist, project, version)
            self.sdist(dist, project, version)
        return self.root / "release"

    def test_repository_versions_are_coordinated(self):
        self.assertRegex(release.source_version(), r"^\d+\.\d+\.\d+$")

    def test_valid_artifacts_and_manifest_round_trip(self):
        output = self.release_dir()
        files = release.inventory(output, "0.1.0")
        self.assertEqual(len(files), 4)
        (output / "release.json").write_text(json.dumps({"schema": 1, "commit": "a" * 40, "version": "0.1.0", "files": files}))
        self.assertEqual(release.verify(output)["version"], "0.1.0")

    def test_tampered_artifact_fails_verification(self):
        output = self.release_dir()
        files = release.inventory(output, "0.1.0")
        (output / "release.json").write_text(json.dumps({"schema": 1, "commit": "a" * 40, "version": "0.1.0", "files": files}))
        wheel = output / "dist" / "opensignet_crewai-0.1.0-py3-none-any.whl"
        wheel.write_bytes(wheel.read_bytes() + b"\0")
        with self.assertRaises(release.ReleaseError):
            release.verify(output)

    def test_extra_or_missing_artifacts_are_refused(self):
        output = self.release_dir()
        (output / "dist" / "stray.txt").write_text("x")
        with self.assertRaises(release.ReleaseError):
            release.inventory(output, "0.1.0")

    def test_wrong_license_version_or_unsafe_paths_are_refused(self):
        directory = self.root / "single"
        directory.mkdir()
        with self.assertRaises(release.ReleaseError):
            release.inspect_python(self.wheel(directory, license="MIT"), "opensignet-crewai", "0.1.0")
        for extra in ({"../escape.py": b""}, {"opensignet_crewai/.env": b"X=1"}, {"opensignet_crewai/__pycache__/x.pyc": b""}):
            directory = self.root / f"case-{len(list(self.root.iterdir()))}"
            directory.mkdir()
            with self.assertRaises(release.ReleaseError):
                release.inspect_python(self.wheel(directory, extra=extra), "opensignet-crewai", "0.1.0")
        with self.assertRaises(release.ReleaseError):
            release.inspect_python(self.wheel(self.root / "single", version="0.2.0"), "opensignet-crewai", "0.1.0")

    def test_pypi_check_refuses_existing_versions_and_unexpected_status(self):
        manifest = {"version": "0.1.0"}
        release.check_pypi(manifest, lambda project, version: 404)
        with self.assertRaisesRegex(release.ReleaseError, "already published"):
            release.check_pypi(manifest, lambda project, version: 200 if project == "opensignet-autogen" else 404)
        with self.assertRaisesRegex(release.ReleaseError, "HTTP 503"):
            release.check_pypi(manifest, lambda project, version: 503)

    def test_build_refuses_existing_output(self):
        output = self.root / "existing"
        output.mkdir()
        with self.assertRaisesRegex(release.ReleaseError, "already exists"):
            release.build(output, runner=lambda *args, **kwargs: None)


if __name__ == "__main__":
    unittest.main()
