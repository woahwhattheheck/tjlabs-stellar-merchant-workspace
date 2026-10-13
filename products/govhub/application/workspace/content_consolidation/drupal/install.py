"""Install the supplied module into one selected, already equipped Drupal site.

Run from the maintained GovHub workspace:
  python3 -m content_consolidation.drupal.install --config profile.json --output /private/install
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

import native_adapter as base


def module_inventory():
    root = Path(__file__).resolve().parent / "govhub_consolidation"
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            files[relative] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
    if not files or "src/Runner.php" not in files:
        raise ValueError("The complete supplied Drupal module is required.")
    digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return root, files, digest


def install_module(config, output_dir, checkpoint=None, cancelled=None):
    profile = base._profile(config)
    if profile["source_kind"] != "drush":
        raise ValueError("Select the equipped Drupal / Drush site for module installation.")
    session = base.Session(profile, output_dir, checkpoint, cancelled)
    root, files, source_sha = module_inventory()
    target = Path(profile["site_root"]) / "modules" / "custom" / "govhub_consolidation"
    marker = target / ".govhub-source.json"
    intent = {"target": base._context(profile), "module_directory": str(target), "source_sha256": source_sha}
    state_path = session.out / "native-state.json"
    session.state = session.read_private_json(state_path) if state_path.exists() else {
        "intent_sha256": base._digest(intent), "intent": intent, "phase": "prepared", "mutation_started": False
    }
    if session.state["intent_sha256"] != base._digest(intent):
        raise ValueError("This original installation operation selects another target or module edition.")
    try:
        native, commands, native_fingerprint = base._drush_info(session, fresh=True)
        if not {"php:script", "pm:enable", "cache:rebuild"} <= commands:
            raise ValueError("The selected installed Drush must supply php:script, pm:enable, and cache:rebuild.")
        if target.is_symlink() or any(parent.is_symlink() for parent in (target.parent, target.parent.parent)):
            raise ValueError("The selected custom-module directory must be an ordinary directory in this Drupal root.")
        previous = json.loads(marker.read_text()) if marker.exists() else None
        if target.exists() and not previous:
            changed = [name for name, item in files.items()
                       if (target / name).exists() and hashlib.sha256((target / name).read_bytes()).hexdigest() != item["sha256"]]
            if changed:
                raise ValueError("An existing unmanifested module has different source at: " + ", ".join(changed))
        if previous:
            for name, item in previous["files"].items():
                path = target / name
                allowed = {item["sha256"]}
                if session.state.get("mutation_started") and name in files:
                    allowed.add(files[name]["sha256"])
                if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() not in allowed:
                    raise ValueError("The installed module has local edits to compose before its update: " + name)
        session.state.update(phase="native_prepared", mutation_started=True)
        session.save_state()
        before = session.out / "module-before"
        for name, expected in files.items():
            session.check()
            source, destination = root / name, target / name
            if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected["sha256"]:
                continue
            if destination.exists():
                retained = before / name
                retained.parent.mkdir(parents=True, exist_ok=True)
                if retained.exists() and retained.read_bytes() != destination.read_bytes():
                    raise ValueError("The retained original module file differs from this continuation.")
                shutil.copyfile(destination, retained)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(destination.name + ".govhub-writing")
            with temporary.open("wb") as stream:
                stream.write(source.read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o644)
            os.replace(temporary, destination)
        base._atomic(marker, {"schema": "govhub.content-module-source.v1", "sha256": source_sha, "files": files})
        enabled = session.command("content-module-enable", base._prefix(profile) + ["pm:enable", "govhub_consolidation", "--yes"], mutating=True)
        rebuilt = session.command("content-module-cache", base._prefix(profile) + ["cache:rebuild"], mutating=True)
        for name, expected in files.items():
            if hashlib.sha256((target / name).read_bytes()).hexdigest() != expected["sha256"]:
                raise ValueError("Installed source readback changed: " + name)
        result = {"schema": "govhub.content-module-install.v1", "target": base._context(profile),
                  "native_status": native, "source_sha256": source_sha, "module_directory": str(target), "files": files}
        result_path = session.out / "installed-module.json"
        base._atomic(result_path, result)
        session.add(result_path, "installed_content_module")
        session.add(enabled["stdout"]["path"], "native_module_enable")
        session.add(rebuilt["stdout"]["path"], "native_module_cache")
        session.state.update(phase="completed", observations=result)
        session.save_state()
        return session.result("COMPLETE", result)
    except base.NativeCancelled as error:
        return session.result("WAITING_NATIVE" if session.state.get("mutation_started") else "CANCELLED", message=str(error))
    except base.NativeWaiting as error:
        return session.result("WAITING_NATIVE", message=str(error))
    except Exception as error:
        return session.result("WAITING_NATIVE" if session.state.get("phase") == "native_interrupted" else "FAILED", message=str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Existing private Drush profile JSON.")
    parser.add_argument("--output", required=True, help="Retained private installation operation directory.")
    args = parser.parse_args()
    result = install_module(json.loads(Path(args.config).read_text()), args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["status"] == "COMPLETE" else 1)


if __name__ == "__main__":
    main()
