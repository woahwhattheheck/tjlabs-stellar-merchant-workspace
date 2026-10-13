"""ROZO capture/review in the original expense Store transaction and journal."""
import json
from domain import Problem, digest, text
from credits import data_context
from native_rozo import capture_original, original_bytes


class RozoStore:
    def _rozo_input(self, payload):
        selected = dict(payload)
        selected["data_context"] = data_context(payload.get("data_context"))
        for key, maximum in (("filename", 240), ("name", 160), ("provenance", 6000), ("operator", 240)):
            selected[key] = text(payload.get(key), key, maximum=maximum)
        if "/" in selected["filename"] or "\\" in selected["filename"] or selected["filename"] in (".", ".."):
            raise Problem("ROZO_SOURCE_FILENAME", "Retain the original filename without a directory")
        return selected

    def _rozo_preview(self, selected, native):
        inspection, selection = native["snapshot"]["inspection"], native["snapshot"]["selection"]
        existing = next((source for source in self._bodies("sources") if
            source.get("kind") == "rozo_report" and source["identity"] == native["identity"]), None)
        result = {key: inspection[key] for key in ("sourceBytes", "sourceSha256", "sourceIdentitySha256",
            "sourceId", "workspaceId", "originId", "profileId", "reportId", "reportSha256", "reportVersion")}
        result.update(selection=selection, rows=native["report"]["rows"], notes=native["report"]["notes"],
            filename=selected["filename"], data_context=selected["data_context"],
            existing_source_id=existing["id"] if existing else None,
            current_capture=existing.get("current_capture") if existing else None)
        matches = []
        if existing:
            matches = [json.loads(row[0]) for row in self.connection.execute(
                "SELECT body FROM captures WHERE source_id=? ORDER BY created_at DESC,id DESC", (existing["id"],))
                if json.loads(row[0])["snapshot"].get("source_sha256") == result["sourceSha256"] and
                    json.loads(row[0])["snapshot"].get("selection") == selection]
        reusable = next((row for row in matches if
            row["status"] == "ACCEPTED" and row["id"] == result["current_capture"] or
            row["status"] == "PENDING" and row["parent_id"] == result["current_capture"]), None)
        result["previous_capture"] = self._capture_summary(matches[0]) if matches else None
        result["reuse_capture"] = reusable["id"] if reusable else None
        result["intake_behavior"] = ("REUSE_CURRENT_ACCEPTED" if reusable and reusable["status"] == "ACCEPTED" else
            "REUSE_CURRENT_PENDING" if reusable else "CREATE_CURRENT_PARENT_CAPTURE")
        result["preview_sha256"] = digest({"source": result, "name": selected["name"],
            "provenance": selected["provenance"], "operator": selected["operator"]})
        return result

    def preview_rozo_report(self, payload):
        selected = self._rozo_input(payload)
        native = capture_original(selected, self.node_executable)
        with self.lock:
            self._context(selected["data_context"])
            return self._rozo_preview(selected, native)

    def capture_rozo_report(self, payload, expected):
        selected = self._rozo_input(payload)
        native = capture_original(selected, self.node_executable)
        def operation():
            from domain import identifier, now
            self._context(selected["data_context"])
            current = self._rozo_preview(selected, native)
            if payload.get("preview_sha256") != current["preview_sha256"]:
                raise Problem("ROZO_PREVIEW_CHANGED", "Review this original report and purchase selection against the current source", 409)
            existing = self._get("sources", current["existing_source_id"]) if current["existing_source_id"] else None
            source = existing or {"id": identifier("source"), "name": selected["name"], "kind": "rozo_report",
                "path": native["path"], "identity": native["identity"], "provenance": selected["provenance"],
                "data_context": selected["data_context"], "created_at": now(), "current_capture": None, "immutable_intake": True}
            if current["reuse_capture"]:
                saved = self._get("captures", current["reuse_capture"])
                return {"id": source["id"], "source": source, "capture": self._capture_summary(saved),
                    "original_intake": saved.get("rozo_intake"), "reopened": True}
            self._context(selected["data_context"], commit=True)
            if not existing:
                self._put("sources", source)
            native["rozo_intake"] = {key: selected[key] for key in ("filename", "name", "provenance", "operator", "data_context")}
            native["rozo_intake"]["preview_sha256"] = current["preview_sha256"]
            return {"id": source["id"], "source": source, "capture": self._new_capture(source, native), "reopened": False}
        return self._change(expected, "rozo_report.capture", operation)

    def rozo_report_original(self, capture_id):
        with self.lock:
            captured = self._get("captures", capture_id)
            if captured["report"]["source"].get("kind") != "rozo_report":
                raise Problem("ROZO_CAPTURE_REQUIRED", "Select a retained original ROZO report", 404)
            snapshot = captured["snapshot"]
            raw = original_bytes(snapshot)
            if len(raw) != snapshot["source_bytes"]:
                raise Problem("ROZO_SOURCE_BYTES", "The retained original source length changed", 409)
            return raw

    def _expense_labels(self, payload):
        from native import parse_labels
        values = payload.get("assets")
        if not isinstance(values, list):
            raise Problem("INVALID_LABELS", "Retain the complete original asset-label array")
        ordinary, rozo, seen = [], [], set()
        native_assets = {}
        for item in self._items():
            detail = item["row"].get("native_detail", {})
            asset = detail.get("rozo_asset")
            if item["row"].get("source_kind") == "rozo_report" and asset:
                native_assets[(item["row"]["network"], item["row"]["asset"])] = asset
        for value in values:
            if not isinstance(value, dict) or set(value) != {"network", "asset", "symbol", "decimals"}:
                raise Problem("INVALID_LABELS", "Each label needs its complete network, asset, symbol and precision")
            if not isinstance(value["network"], str) or not value["network"].startswith("rozo:"):
                ordinary.append(value)
                continue
            pair = (value["network"], value["asset"])
            asset = native_assets.get(pair)
            if (not asset or pair in seen or type(value["decimals"]) is not int or value["decimals"] != asset["decimals"] or
                    not isinstance(value["symbol"], str) or not 1 <= len(value["symbol"]) <= 40 or
                    any(ord(c) < 32 or ord(c) == 127 for c in value["symbol"])):
                raise Problem("INVALID_LABELS", "Select the exact retained ROZO asset and its original precision")
            seen.add(pair)
            rozo.append(dict(value))
        return list(parse_labels({"assets": ordinary}).values()) + rozo
