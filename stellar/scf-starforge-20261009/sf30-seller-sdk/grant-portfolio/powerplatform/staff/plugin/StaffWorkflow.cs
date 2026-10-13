// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace TJLabs.GrantStaff
{
    internal static class StaffWorkflow
    {
        private static Dictionary<string, object> M(object x, string n) { return Contract.Map(x, n); }
        private static List<object> L(object x, string n) { return Contract.List(x, n); }
        private static string S(object x, string n, int max = 4000) { return Contract.S(x, n, max); }
        private static object C(object x) { return Contract.Copy(x); }
        private static Dictionary<string, object> D(params object[] pairs) { return Contract.D(pairs); }
        private static string Phase(Dictionary<string, object> state) { return (string)state["phase"]; }
        private static void RequirePhase(Dictionary<string, object> state, params string[] values)
        { Contract.Require(values.Contains(Phase(state)), "This action is unavailable in the original current phase."); }
        private static string Reason(Dictionary<string, object> payload) { return S(Contract.Get(payload, "reason"), "reason", 12000); }
        private static object References(Dictionary<string, object> payload) { return Contract.SourceReferences(Contract.Get(payload, "source_refs")); }
        private static Dictionary<string, object> Audit(StaffActor actor, Guid operation, DateTime now)
        { return D("actor_id", actor.UserId.ToString("D"), "operation_id", operation.ToString("D"), "at", Contract.Now(now)); }
        private static void AddAudit(Dictionary<string, object> target, StaffActor actor, Guid operation, DateTime now)
        { foreach (var item in Audit(actor, operation, now)) target[item.Key] = item.Value; }
        private static void Input(Dictionary<string, object> payload, string[] allowed, string[] required)
        { Json.Shape(payload, allowed, required); }
        private static void Editable(Dictionary<string, object> state)
        { RequirePhase(state, "IDEA", "FORMULATION"); }
        private static Dictionary<string, object> Evidence(Dictionary<string, object> state)
        { return M(state["evidence"], "record evidence"); }
        private static string ValidationBasis(Dictionary<string, object> state)
        {
            var evidence = Evidence(state);
            return Contract.Identity(D("idea", Contract.Get(evidence, "P1.01", false),
                "alignment", Contract.Get(evidence, "P1.02", false)));
        }
        private static bool HasReviewedEvidence(object value)
        {
            var row = value as Dictionary<string, object>;
            if (row == null || !row.ContainsKey("source_refs")) return false;
            var sources = L(row["source_refs"], "source references");
            return sources.Count > 0 && sources.All(x => (string)M(x, "source")["verification"] != "unverified-link");
        }

        internal static List<object> Gaps(StaffPolicy policy, Dictionary<string, object> state, Dictionary<string, object> source)
        {
            var result = new List<object>();
            if (state == null) { result.Add(D("code", "NOT_INITIALIZED", "label", "Initialize staff work on this original project.")); return result; }
            if (source["source"] == null) result.Add(D("code", "SOURCE_UNAVAILABLE", "label", "The original portfolio/source reference has not been received."));
            var evidence = Evidence(state);
            var requirement = Contract.Get(state, "data_management", false) as Dictionary<string, object>;
            if (requirement == null)
                result.Add(D("code", "DATA_MANAGEMENT_UNREVIEWED", "step_id", "P1.07b",
                    "label", "Record whether the selected donor or policy requires a data management plan."));
            foreach (var item in policy.Steps)
            {
                var step = M(item, "step"); var kind = (string)step["requirement"];
                bool required = kind == "required" || (kind == "data-management" && requirement != null && (bool)requirement["required"]);
                object record;
                if (required && (!evidence.TryGetValue((string)step["id"], out record) || !HasReviewedEvidence(record)))
                    result.Add(D("code", "EVIDENCE_REQUIRED", "step_id", step["id"], "label", step["label"], "source_refs", C(step["source_refs"])));
            }
            foreach (var item in L(state["corrections"], "corrections"))
            {
                var correction = M(item, "correction");
                if ((string)correction["status"] == "open")
                    result.Add(D("code", "CORRECTION_OPEN", "id", correction["id"], "label", correction["title"]));
            }
            return result;
        }

        internal static Dictionary<string, object> Apply(StaffPolicy policy, StaffActor actor, Entity original,
            Dictionary<string, object> before, Dictionary<string, object> source, string action,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            actor.RequireAction(policy, action);
            Dictionary<string, object> state;
            if (action == "initialize")
            {
                Input(payload, new[] { "idea_note", "source_refs", "reason" }, new[] { "idea_note", "source_refs", "reason" });
                Contract.Require(before == null, "The original staff record is already initialized.");
                Contract.Require(source["source"] != null, "Receive and bind the original project/portfolio source before initialization.");
                var idea = D("note", S(payload["idea_note"], "idea note", 24000), "source_refs", References(payload));
                AddAudit(idea, actor, operation, now);
                state = D("schema", Contract.StateSchema, "entity", original.LogicalName, "record_id", original.Id.ToString("D"),
                    "version", 1, "phase", "IDEA", "pipeline_category", "soft", "policy_sha256", policy.Sha256,
                    "reference", original.Id.ToString("D"), "created_at", Contract.Now(now),
                    "original_owner_id", original.GetAttributeValue<EntityReference>("ownerid") == null ? null
                        : original.GetAttributeValue<EntityReference>("ownerid").Id.ToString("D"),
                    "evidence", D("P1.01", idea), "validation", null, "gate0", null, "data_management", null,
                    "qa", null, "previous_qa", new List<object>(), "conditions", new List<object>(),
                    "corrections", new List<object>(), "financial_review", null, "corporate_reference", null,
                    "last_action", D("action", action, "reason", Reason(payload)));
            }
            else
            {
                Contract.Require(before != null, "Initialize staff work on the selected original project first.");
                state = M(C(before), "original state");
                switch (action)
                {
                    case "evidence.record": EvidenceRecord(policy, actor, state, payload, operation, now); break;
                    case "data-management.review": DataManagement(actor, state, payload, operation, now); break;
                    case "validation.record": Validation(actor, state, payload, operation, now); break;
                    case "gate0.decide": Gate0(actor, state, payload, operation, now); break;
                    case "design.submit": Submit(policy, actor, state, source, payload, operation, now); break;
                    case "qa.clearance": Clearance(policy, actor, state, payload, operation, now); break;
                    case "qa.decide": Decide(policy, actor, state, payload, operation, now); break;
                    case "qa.withdraw": Withdraw(actor, state, payload, operation, now); break;
                    case "condition.resolve": ResolveCondition(actor, state, payload, operation, now); break;
                    case "correction.open": OpenCorrection(actor, state, payload, operation, now); break;
                    case "correction.resolve": ResolveCorrection(actor, state, payload, operation, now); break;
                    case "design.reopen": Reopen(actor, state, payload, operation, now); break;
                    case "financial.review": Financial(actor, state, source, payload, operation, now); break;
                    case "corporate.reference": Corporate(actor, state, payload, operation, now); break;
                    default: throw new InvalidPluginExecutionException("Unknown staff action.");
                }
                state["version"] = checked(Contract.Int(before["version"], "original staff revision") + 1);
            }
            state["policy_sha256"] = policy.Sha256;
            state["source_context_sha256"] = Contract.Identity(source);
            state["last_action"] = D("action", action, "payload_sha256", Contract.Identity(payload),
                "actor_id", actor.UserId.ToString("D"), "operation_id", operation.ToString("D"), "at", Contract.Now(now));
            Contract.Require(System.Text.Encoding.UTF8.GetByteCount(Json.Write(state)) <= 900000,
                "The complete staff state exceeds the native column budget; no partial state was written.");
            return state;
        }

        private static void EvidenceRecord(StaffPolicy policy, StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Editable(state);
            Input(payload, new[] { "step_id", "note", "source_refs", "reason" }, new[] { "step_id", "note", "source_refs", "reason" });
            string id = S(payload["step_id"], "source step ID", 100);
            var definition = policy.Step(id);
            Contract.Require(definition != null, "Select a step in the accepted source register.");
            actor.RequireRoles(definition["actors"]);
            var record = D("note", S(payload["note"], "evidence note", 24000), "source_refs", References(payload),
                "rule_sha256", Contract.Identity(definition), "reason", Reason(payload));
            AddAudit(record, actor, operation, now);
            Evidence(state)[id] = record;
            if (id == "P1.01" || id == "P1.02")
            {
                // A changed concept/alignment needs a new validation and Gate 0; old decisions remain in native history.
                state["validation"] = null; state["gate0"] = null; state["phase"] = "IDEA";
            }
        }
        private static void DataManagement(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Editable(state);
            Input(payload, new[] { "required", "reason", "source_refs" }, new[] { "required", "reason", "source_refs" });
            var result = D("required", Contract.Bool(payload["required"], "donor/policy requirement"), "reason", Reason(payload),
                "source_refs", References(payload));
            Contract.Require(HasReviewedEvidence(result), "A donor/policy requirement needs received or reviewed source evidence.");
            AddAudit(result, actor, operation, now); state["data_management"] = result;
        }
        private static void Validation(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "IDEA");
            Input(payload, new[] { "outcome", "reason", "source_refs" }, new[] { "outcome", "reason", "source_refs" });
            string outcome = S(payload["outcome"], "validation outcome", 50);
            Contract.Require(new[] { "ready-for-gate0", "needs-work" }.Contains(outcome), "Use the recorded validation outcome.");
            var evidence = Evidence(state);
            if (outcome == "ready-for-gate0")
                Contract.Require(HasReviewedEvidence(Contract.Get(evidence, "P1.01", false))
                    && HasReviewedEvidence(Contract.Get(evidence, "P1.02", false)), "Retain the idea and alignment evidence before validation.");
            var result = D("outcome", outcome, "reason", Reason(payload), "source_refs", References(payload),
                "basis_sha256", ValidationBasis(state));
            Contract.Require(HasReviewedEvidence(result), "Validation requires its actual minutes or reviewed record.");
            AddAudit(result, actor, operation, now); state["validation"] = result;
        }
        private static void Gate0(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "IDEA");
            Input(payload, new[] { "decision", "reason", "source_refs" }, new[] { "decision", "reason", "source_refs" });
            var validation = state["validation"] as Dictionary<string, object>;
            Contract.Require(validation != null && (string)validation["outcome"] == "ready-for-gate0"
                && (string)validation["basis_sha256"] == ValidationBasis(state), "The actual current idea/alignment validation must precede Gate 0.");
            string decision = S(payload["decision"], "Gate 0 decision", 40);
            Contract.Require(new[] { "pursue", "park", "drop" }.Contains(decision), "Gate 0 records pursue, park or drop.");
            var result = D("decision", decision, "reason", Reason(payload), "source_refs", References(payload),
                "validation_sha256", Contract.Identity(validation), "source_steps", new List<object> { "P1.G0", "P1.S2" });
            AddAudit(result, actor, operation, now); state["gate0"] = result;
            state["phase"] = decision == "pursue" ? "FORMULATION" : decision == "drop" ? "CLOSED_PIPELINE" : "IDEA";
            state["pipeline_category"] = "soft"; // This action never creates or updates Business Central.
        }
        private static void Submit(StaffPolicy policy, StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> source, Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "FORMULATION");
            Input(payload, new[] { "reason", "source_refs" }, new[] { "reason", "source_refs" });
            var gate = state["gate0"] as Dictionary<string, object>;
            Contract.Require(gate != null && (string)gate["decision"] == "pursue", "A pursue decision is required before design submission.");
            var gaps = Gaps(policy, state, source);
            Contract.Require(gaps.Count == 0, "The current design has unmet accepted completeness requirements: " + Json.Write(gaps));
            var previous = L(state["previous_qa"], "previous QA decisions");
            if (state["qa"] != null) ArchiveQa(state);
            int round = previous.Count + 1;
            var pack = D("record_id", state["record_id"], "entity", state["entity"],
                "state_version", state["version"], "evidence", C(state["evidence"]), "data_management", C(state["data_management"]),
                "source_context", C(source), "policy_sha256", policy.Sha256,
                "required_clearances", C(policy.Clearances));
            var qa = D("round", round, "pack", pack, "pack_sha256", Contract.Identity(pack),
                "clearances", D(), "decision", null, "submission", D("reason", Reason(payload), "source_refs", References(payload)));
            AddAudit(M(qa["submission"], "submission"), actor, operation, now);
            state["qa"] = qa; state["phase"] = "QA_SUBMITTED";
        }
        private static void Clearance(StaffPolicy policy, StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "QA_SUBMITTED");
            Input(payload, new[] { "clearance_id", "pack_sha256", "decision", "comment", "source_refs", "reason" },
                new[] { "clearance_id", "pack_sha256", "decision", "comment", "source_refs", "reason" });
            var qa = M(state["qa"], "current QA"); CheckPack(qa, payload);
            string id = S(payload["clearance_id"], "clearance ID", 100);
            var definition = policy.Clearance(id); Contract.Require(definition != null, "Select a required original clearance.");
            actor.RequireRoles(definition["roles"]);
            string decision = S(payload["decision"], "clearance decision", 40);
            Contract.Require(new[] { "clear", "revise" }.Contains(decision), "Each required reviewer records clear or revise.");
            var result = D("decision", decision, "comment", S(payload["comment"], "review comments", 12000),
                "source_refs", References(payload), "reason", Reason(payload), "pack_sha256", qa["pack_sha256"],
                "rule_sha256", Contract.Identity(definition));
            AddAudit(result, actor, operation, now);
            M(qa["clearances"], "current clearances")[id] = result;
        }
        private static void CheckPack(Dictionary<string, object> qa, Dictionary<string, object> payload)
        {
            Contract.Require(Contract.HashValue(payload["pack_sha256"], "selected QA pack") == (string)qa["pack_sha256"]
                && Contract.Identity(qa["pack"]) == (string)qa["pack_sha256"], "The selected current QA pack differs.");
        }
        private static void Decide(StaffPolicy policy, StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "QA_SUBMITTED");
            Input(payload, new[] { "decision", "pack_sha256", "reason", "source_refs", "minutes", "conditions" },
                new[] { "decision", "pack_sha256", "reason", "source_refs", "minutes", "conditions" });
            var qa = M(state["qa"], "current QA"); CheckPack(qa, payload);
            string decision = S(payload["decision"], "QA chair decision", 40);
            Contract.Require(new[] { "endorse", "revise", "drop" }.Contains(decision), "The chair records endorse, revise or drop.");
            if (decision == "endorse")
            {
                var clearances = M(qa["clearances"], "clearances");
                foreach (var item in policy.Clearances)
                {
                    var definition = M(item, "required clearance"); object value;
                    Contract.Require(clearances.TryGetValue((string)definition["id"], out value), "Every required source clearance must be recorded.");
                    var clearance = M(value, "clearance");
                    Contract.Require((string)clearance["decision"] == "clear"
                        && (string)clearance["pack_sha256"] == (string)qa["pack_sha256"]
                        && (string)clearance["rule_sha256"] == Contract.Identity(definition),
                        "Every required clearance must clear this exact current pack under the selected policy.");
                }
                Contract.Require(L(state["corrections"], "corrections").All(x => (string)M(x, "correction")["status"] != "open"),
                    "Resolve or explicitly return the open corrections before endorsement.");
            }
            var conditions = L(payload["conditions"], "QA conditions");
            Contract.Require(conditions.Count <= 100, "A QA decision accepts up to 100 complete conditions.");
            var existingIds = new HashSet<string>(L(state["conditions"], "conditions").Select(x => (string)M(x, "condition")["id"]), StringComparer.Ordinal);
            foreach (var item in conditions)
            {
                var requested = M(item, "condition");
                Input(requested, new[] { "id", "title", "source_refs" }, new[] { "id", "title", "source_refs" });
                string id = Contract.GuidValue(requested["id"], "condition ID").ToString("D");
                Contract.Require(existingIds.Add(id), "A condition ID already exists; preserve its original outcome.");
                var row = D("id", id, "title", S(requested["title"], "condition", 6000), "source_refs", Contract.SourceReferences(requested["source_refs"]),
                    "status", "open", "qa_round", qa["round"], "pack_sha256", qa["pack_sha256"], "resolution", null);
                AddAudit(row, actor, operation, now); L(state["conditions"], "conditions").Add(row);
            }
            var result = D("decision", decision, "reason", Reason(payload), "source_refs", References(payload),
                "minutes", S(payload["minutes"], "QA minutes", 24000), "pack_sha256", qa["pack_sha256"],
                "conditions", C(conditions));
            AddAudit(result, actor, operation, now); qa["decision"] = result;
            state["phase"] = decision == "endorse" ? "APPRAISED" : decision == "revise" ? "FORMULATION" : "CLOSED_PIPELINE";
            // The issued example's "Gate 1 closed" shorthand is not applied to revise/drop as an endorsement.
        }
        private static void Withdraw(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "QA_SUBMITTED");
            Input(payload, new[] { "pack_sha256", "reason", "source_refs" }, new[] { "pack_sha256", "reason", "source_refs" });
            var qa = M(state["qa"], "current QA"); CheckPack(qa, payload);
            var result = D("decision", "withdraw", "reason", Reason(payload), "source_refs", References(payload));
            AddAudit(result, actor, operation, now); qa["decision"] = result; state["phase"] = "FORMULATION";
        }
        private static void ArchiveQa(Dictionary<string, object> state)
        {
            var qa = M(state["qa"], "previous QA"); var decision = qa["decision"] as Dictionary<string, object>;
            Contract.Require(decision != null, "Close or withdraw the current QA round before a new submission.");
            L(state["previous_qa"], "previous QA").Add(D("round", qa["round"], "pack_sha256", qa["pack_sha256"],
                "decision", C(decision), "full_record_operation", decision["operation_id"],
                "meaning", "The complete original pack/clearances remain in the immutable native action history."));
        }
        private static void ResolveCondition(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Input(payload, new[] { "id", "reason", "source_refs" }, new[] { "id", "reason", "source_refs" });
            string id = Contract.GuidValue(payload["id"], "condition ID").ToString("D");
            var row = L(state["conditions"], "conditions").Select(x => M(x, "condition")).SingleOrDefault(x => (string)x["id"] == id);
            Contract.Require(row != null && (string)row["status"] == "open", "Resolve one existing open condition.");
            var result = D("reason", Reason(payload), "source_refs", References(payload));
            Contract.Require(HasReviewedEvidence(result), "Condition closure needs received or reviewed evidence.");
            AddAudit(result, actor, operation, now); row["resolution"] = result; row["status"] = "resolved";
        }
        private static void OpenCorrection(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Input(payload, new[] { "id", "title", "reason", "source_refs", "affected_operation" },
                new[] { "id", "title", "reason", "source_refs", "affected_operation" });
            string id = Contract.GuidValue(payload["id"], "correction ID").ToString("D");
            Contract.Require(!L(state["corrections"], "corrections").Any(x => (string)M(x, "correction")["id"] == id), "The correction ID is already retained.");
            var row = D("id", id, "title", S(payload["title"], "correction title", 6000), "reason", Reason(payload),
                "source_refs", References(payload), "affected_operation", payload["affected_operation"] == null ? null
                    : Contract.GuidValue(payload["affected_operation"], "affected original operation").ToString("D"),
                "status", "open", "resolution", null);
            AddAudit(row, actor, operation, now); L(state["corrections"], "corrections").Add(row);
        }
        private static void ResolveCorrection(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Input(payload, new[] { "id", "reason", "source_refs", "outcome" }, new[] { "id", "reason", "source_refs", "outcome" });
            string id = Contract.GuidValue(payload["id"], "correction ID").ToString("D");
            var row = L(state["corrections"], "corrections").Select(x => M(x, "correction")).SingleOrDefault(x => (string)x["id"] == id);
            Contract.Require(row != null && (string)row["status"] == "open", "Resolve one existing open correction.");
            string outcome = S(payload["outcome"], "correction outcome", 80);
            Contract.Require(new[] { "corrected", "reviewed-no-change" }.Contains(outcome), "Preserve a corrected or reviewed-no-change outcome.");
            var result = D("outcome", outcome, "reason", Reason(payload), "source_refs", References(payload));
            Contract.Require(HasReviewedEvidence(result), "A correction outcome needs received or reviewed evidence.");
            AddAudit(result, actor, operation, now); row["resolution"] = result; row["status"] = "resolved";
        }
        private static void Reopen(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "APPRAISED", "CLOSED_PIPELINE");
            Input(payload, new[] { "reason", "source_refs", "restart_gate0" }, new[] { "reason", "source_refs", "restart_gate0" });
            Reason(payload); References(payload);
            bool gate0 = Contract.Bool(payload["restart_gate0"], "Gate 0 restart");
            if (state["qa"] != null) { ArchiveQa(state); state["qa"] = null; }
            if (gate0) { state["gate0"] = null; state["validation"] = null; state["phase"] = "IDEA"; }
            else
            {
                var old = state["gate0"] as Dictionary<string, object>;
                Contract.Require(old != null && (string)old["decision"] == "pursue", "A dropped/parked concept needs a new Gate 0.");
                state["phase"] = "FORMULATION";
            }
        }
        private static void Financial(StaffActor actor, Dictionary<string, object> state, Dictionary<string, object> source,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            Input(payload, new[] { "financial_sha256", "outcome", "reason", "source_refs" }, new[] { "financial_sha256", "outcome", "reason", "source_refs" });
            Contract.Require(source["financial"] != null && source["financial_sha256"] != null, "The original financial edition is unavailable; it is not a zero balance.");
            Contract.Require(Contract.HashValue(payload["financial_sha256"], "financial edition hash") == (string)source["financial_sha256"],
                "The financial review refers to another received original edition.");
            string outcome = S(payload["outcome"], "financial review outcome", 80);
            Contract.Require(new[] { "reviewed", "needs-correction" }.Contains(outcome), "Use reviewed or needs-correction.");
            var result = D("financial_sha256", source["financial_sha256"], "outcome", outcome,
                "reason", Reason(payload), "source_refs", References(payload),
                "meaning", "Review of the selected received edition; no financial entry or allocation is changed by this action.");
            AddAudit(result, actor, operation, now); state["financial_review"] = result;
        }
        private static void Corporate(StaffActor actor, Dictionary<string, object> state,
            Dictionary<string, object> payload, Guid operation, DateTime now)
        {
            RequirePhase(state, "APPRAISED");
            Input(payload, new[] { "mode", "company_id", "project_card_id", "status", "reason", "source_refs" },
                new[] { "mode", "company_id", "project_card_id", "status", "reason", "source_refs" });
            Contract.Require(L(state["conditions"], "conditions").All(x => (string)M(x, "condition")["status"] == "resolved")
                && L(state["corrections"], "corrections").All(x => (string)M(x, "correction")["status"] == "resolved"),
                "Resolve the retained endorsement conditions/corrections before confirming the corporate reference.");
            string mode = S(payload["mode"], "reference mode", 80);
            Contract.Require(new[] { "interface-reference", "manual-attestation" }.Contains(mode), "Record the original interface result or explicit manual update.");
            var result = D("mode", mode, "company_id", S(payload["company_id"], "actual company ID", 500),
                "project_card_id", S(payload["project_card_id"], "actual corporate project-card ID", 500),
                "status", S(payload["status"], "observed corporate status", 300), "reason", Reason(payload),
                "source_refs", References(payload),
                "meaning", "Reference/attestation only. This staff action performs no Business Central or HR transaction.");
            Contract.Require(HasReviewedEvidence(result), "Corporate status needs received or reviewed evidence.");
            AddAudit(result, actor, operation, now); state["corporate_reference"] = result; state["pipeline_category"] = "corporate-reference-recorded";
        }
    }
}
