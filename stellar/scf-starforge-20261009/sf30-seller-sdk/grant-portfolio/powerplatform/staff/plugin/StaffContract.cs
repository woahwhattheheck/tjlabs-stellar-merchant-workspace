// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace TJLabs.GrantStaff
{
    internal static class Contract
    {
        internal const string PolicyResource = "tjl_pmrs_staff_policy.json";
        internal const string CommandName = "tjl_PMRSStaffCommand";
        internal const string ReadName = "tjl_PMRSStaffRead";
        internal const string OperationTable = "tjl_pmrsstaffoperation";
        internal const string HistoryTable = "tjl_pmrsstaffhistory";
        internal const string GuardKey = "TJLabs.PMRS.Staff.NativeCommand";
        internal const string StateSchema = "tjlabs.pmrs.staff-state/v1";
        internal const string RequestSchema = "tjlabs.pmrs.staff-command/v1";
        internal const string ReadSchema = "tjlabs.pmrs.staff-read/v1";
        internal static readonly Regex LogicalName = new Regex(@"\A[a-z][a-z0-9_]{0,127}\z", RegexOptions.CultureInvariant);
        internal static readonly Regex HashPattern = new Regex(@"\A[a-f0-9]{64}\z", RegexOptions.CultureInvariant);

        internal static Dictionary<string, object> D(params object[] pairs)
        {
            if (pairs.Length % 2 != 0) throw new ArgumentException("A complete key/value pair is required.");
            var result = new Dictionary<string, object>(StringComparer.Ordinal);
            for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]);
            return result;
        }
        internal static object Copy(object value) { return Json.Parse(Json.Write(value)); }
        internal static Dictionary<string, object> Map(object value, string name) { return Json.Object(value, name); }
        internal static List<object> List(object value, string name) { return Json.Array(value, name); }
        internal static string S(object value, string name, int maximum = 4000, bool empty = false)
        { return Json.String(value, name, maximum, empty); }
        internal static object Get(Dictionary<string, object> value, string key, bool required = true)
        { return Json.Get(value, key, required); }
        internal static int Int(object value, string name, int minimum = 0, int maximum = Int32.MaxValue)
        {
            if (value is int) { int n = (int)value; if (n >= minimum && n <= maximum) return n; }
            return Json.Integer(value, name, minimum, maximum);
        }
        internal static bool Bool(object value, string name)
        { if (!(value is bool)) throw new ArgumentException(name + " must be a boolean."); return (bool)value; }
        internal static string Logical(object value, string name)
        {
            string s = S(value, name, 128);
            if (!LogicalName.IsMatch(s)) throw new ArgumentException(name + " is not a native logical name.");
            return s;
        }
        internal static Guid GuidValue(object value, string name)
        {
            Guid result;
            if (!Guid.TryParseExact(S(value, name, 36), "D", out result) || result == Guid.Empty)
                throw new ArgumentException(name + " requires an actual nonempty GUID.");
            return result;
        }
        internal static string Hash(string text)
        {
            using (var h = SHA256.Create())
                return String.Concat(h.ComputeHash(Encoding.UTF8.GetBytes(text)).Select(x => x.ToString("x2", CultureInfo.InvariantCulture)));
        }
        internal static string Identity(object value) { return Hash(Json.Write(value)); }
        internal static string HashValue(object value, string name)
        {
            var s = S(value, name, 64);
            if (!HashPattern.IsMatch(s)) throw new ArgumentException(name + " requires a complete SHA-256.");
            return s;
        }
        internal static void Require(bool condition, string message)
        { if (!condition) throw new InvalidPluginExecutionException(message); }
        internal static string Now(DateTime value) { return value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ", CultureInfo.InvariantCulture); }
        internal static object SourceReferences(object value, bool nonempty = true)
        {
            var rows = List(value, "source_refs");
            Require(!nonempty || rows.Count > 0, "Retain at least one source reference.");
            Require(rows.Count <= 200, "This action accepts at most 200 complete source references.");
            foreach (var item in rows)
            {
                var row = Map(item, "source reference");
                Json.Shape(row, new[] { "kind", "label", "uri", "sha256", "sourceId", "entityKey", "editionId", "row", "note", "verification" },
                    new[] { "kind", "label", "verification" });
                var kind = S(row["kind"], "source kind", 40);
                Require(new[] { "native-record", "received-source", "document", "manual-attestation" }.Contains(kind), "Use a declared source reference kind.");
                S(row["label"], "source label", 300);
                var verification = S(row["verification"], "source verification", 80);
                Require(new[] { "received", "native-reference", "reviewer-attestation", "unverified-link" }.Contains(verification), "Retain the actual source verification state.");
                if (row.ContainsKey("sha256") && row["sha256"] != null) HashValue(row["sha256"], "source SHA");
                foreach (var key in new[] { "sourceId", "entityKey", "editionId", "row", "note" })
                    if (row.ContainsKey(key) && row[key] != null) S(row[key], key, key == "note" ? 4000 : 500, true);
                if (row.ContainsKey("uri") && row["uri"] != null)
                {
                    string uri = S(row["uri"], "source URI", 4000); Uri parsed;
                    Require(Uri.TryCreate(uri, UriKind.Absolute, out parsed) && new[] { "https", "urn" }.Contains(parsed.Scheme),
                        "Use an HTTPS source or a stable URN; do not insert a bearer credential or signed transfer URL.");
                    Require(String.IsNullOrEmpty(parsed.UserInfo), "Source references do not include URI credentials.");
                    foreach (string parameter in parsed.Query.TrimStart('?').Split('&'))
                    {
                        string key = Uri.UnescapeDataString(parameter.Split('=')[0]).ToLowerInvariant();
                        Require(!new[] { "sig", "signature", "token", "access_token", "client_secret", "code", "sv", "se", "sp" }.Contains(key)
                            && !key.StartsWith("x-amz-", StringComparison.Ordinal) && !key.StartsWith("x-goog-", StringComparison.Ordinal),
                            "Retain a stable source reference without signed transfer or authorization values.");
                    }
                }
                if (kind == "received-source")
                    Require(row.ContainsKey("sha256") && row["sha256"] != null && row.ContainsKey("sourceId")
                        && row.ContainsKey("entityKey"), "Received-source references bind the original source, entity and bytes.");
                // A supplied hash/link is retained evidence. This plugin does not claim to fetch or verify external content.
            }
            return Copy(rows);
        }
        internal static IEnumerable<Entity> Page(IOrganizationService service, QueryExpression query, int limit = 20000)
        {
            query.PageInfo = new PagingInfo { Count = 1000, PageNumber = 1 };
            int total = 0;
            for (;;)
            {
                var response = service.RetrieveMultiple(query);
                foreach (var row in response.Entities)
                {
                    if (++total > limit) throw new InvalidPluginExecutionException("The native source exceeds this complete bounded read.");
                    yield return row;
                }
                if (!response.MoreRecords) yield break;
                Require(!String.IsNullOrEmpty(response.PagingCookie), "The native continuation omitted its paging cookie.");
                query.PageInfo.PageNumber++; query.PageInfo.PagingCookie = response.PagingCookie;
            }
        }
    }

    internal sealed class StaffPolicy
    {
        internal readonly Dictionary<string, object> Document;
        internal readonly string Sha256;
        internal readonly string EntityName, NameField, SourceField, FinancialField, StateField, PhaseField;
        internal readonly Dictionary<string, object> Actions, RoleBindings, PortfolioBinding;
        internal readonly List<object> Steps, Clearances;
        internal readonly Dictionary<string, object> Labels;

        private StaffPolicy(string raw)
        {
            Document = Contract.Map(Json.Parse(raw), "native staff policy");
            Json.Shape(Document, new[] { "schema", "version", "project", "actions", "roles", "steps", "clearances", "source_refs", "review", "labels" },
                new[] { "schema", "version", "project", "actions", "roles", "steps", "clearances", "source_refs", "review", "labels" });
            Contract.Require((string)Document["schema"] == "tjlabs.pmrs.staff-policy/v1", "The native staff policy has another schema.");
            Contract.S(Document["version"], "policy version", 100);
            Contract.SourceReferences(Document["source_refs"]);
            var review = Contract.Map(Document["review"], "inception rule review");
            Json.Shape(review, new[] { "actor", "at", "reason", "source_refs", "status" }, new[] { "actor", "at", "reason", "source_refs", "status" });
            Contract.Require((string)review["status"] == "accepted-for-selected-environment", "Select and review the actual inception rule set before staff actions.");
            Contract.S(review["actor"], "rule reviewer", 300); Contract.S(review["at"], "rule review date", 100);
            Contract.S(review["reason"], "rule review reason", 4000); Contract.SourceReferences(review["source_refs"]);
            var project = Contract.Map(Document["project"], "original project binding");
            Json.Shape(project, new[] { "logical_name", "primary_name", "source_field", "financial_field", "state_field", "phase_field", "portfolio_binding" },
                new[] { "logical_name", "primary_name", "source_field", "financial_field", "state_field", "phase_field", "portfolio_binding" });
            PortfolioBinding = Contract.Map(project["portfolio_binding"], "original portfolio binding");
            Json.Shape(PortfolioBinding, new[] { "id_pointer", "revision_pointer", "snapshot_pointer" },
                new[] { "id_pointer", "revision_pointer", "snapshot_pointer" });
            var pointers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var key in new[] { "id_pointer", "revision_pointer", "snapshot_pointer" })
            {
                string pointer = Contract.S(PortfolioBinding[key], "original portfolio JSON pointer", 2000);
                Contract.Require(pointer.StartsWith("/", StringComparison.Ordinal) && pointers.Add(pointer),
                    "Use distinct RFC 6901 pointers into the original source JSON.");
            }
            EntityName = Contract.Logical(project["logical_name"], "original project table");
            NameField = Contract.Logical(project["primary_name"], "original primary name");
            SourceField = Contract.Logical(project["source_field"], "original source reference column");
            FinancialField = project["financial_field"] == null ? null : Contract.Logical(project["financial_field"], "original financial edition column");
            StateField = Contract.Logical(project["state_field"], "staff state column");
            PhaseField = Contract.Logical(project["phase_field"], "staff phase column");
            Contract.Require(StateField != PhaseField && StateField != SourceField && PhaseField != SourceField
                && StateField != FinancialField && PhaseField != FinancialField, "Staff output fields must not replace source or finance fields.");
            Actions = Contract.Map(Document["actions"], "action role bindings");
            RoleBindings = Contract.Map(Document["roles"], "native role bindings");
            foreach (var role in RoleBindings)
            {
                var ids = Contract.List(role.Value, "native role identities");
                Contract.Require(ids.Count > 0 && ids.Count <= 100, "A staff role needs explicit native role or root-role IDs.");
                foreach (var id in ids) Contract.GuidValue(id, "native role identity");
            }
            foreach (var action in Actions)
            {
                var roles = Contract.List(action.Value, "action roles");
                Contract.Require(roles.Count > 0, "An allowed action needs an actual role mapping.");
                foreach (var role in roles) Contract.Require(RoleBindings.ContainsKey(Contract.S(role, "role", 100)), "An action names an unmapped role.");
            }
            Steps = Contract.List(Document["steps"], "issued/accepted evidence steps");
            Contract.Require(Steps.Count > 0 && Steps.Count <= 200, "Keep the complete selected evidence rule set.");
            var idsSeen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in Steps)
            {
                var row = Contract.Map(item, "step");
                Json.Shape(row, new[] { "id", "label", "requirement", "source_refs", "actors", "section", "notes" },
                    new[] { "id", "label", "requirement", "source_refs", "actors" });
                Contract.Require(idsSeen.Add(Contract.S(row["id"], "step ID", 100)), "An evidence step occurs once.");
                Contract.S(row["label"], "step label", 500);
                Contract.Require(new[] { "required", "data-management", "optional", "reference-only" }.Contains((string)row["requirement"]),
                    "Use the accepted source optionality.");
                Contract.SourceReferences(row["source_refs"]);
                foreach (var role in Contract.List(row["actors"], "step actors"))
                    Contract.Require(RoleBindings.ContainsKey(Contract.S(role, "step actor", 100)), "A step actor has no native role mapping.");
            }
            Clearances = Contract.List(Document["clearances"], "complete required clearance set");
            Contract.Require(Clearances.Count > 0 && Clearances.Count <= 50, "Select the complete required clearance set.");
            idsSeen.Clear();
            foreach (var item in Clearances)
            {
                var row = Contract.Map(item, "clearance");
                Json.Shape(row, new[] { "id", "label", "roles", "source_refs" }, new[] { "id", "label", "roles", "source_refs" });
                Contract.Require(idsSeen.Add(Contract.S(row["id"], "clearance ID", 100)), "A clearance occurs once.");
                Contract.S(row["label"], "clearance label", 300); Contract.SourceReferences(row["source_refs"]);
                foreach (var role in Contract.List(row["roles"], "clearance roles"))
                    Contract.Require(RoleBindings.ContainsKey(Contract.S(role, "clearance role", 100)), "A clearance actor has no native role mapping.");
            }
            Labels = Contract.Map(Document["labels"], "source labels");
            Sha256 = Contract.Identity(Document);
        }
        internal static StaffPolicy Load(IOrganizationService service)
        {
            var query = new QueryExpression("webresource") { ColumnSet = new ColumnSet("name", "content"), TopCount = 2 };
            query.Criteria.AddCondition("name", ConditionOperator.Equal, Contract.PolicyResource);
            var rows = service.RetrieveMultiple(query);
            Contract.Require(rows.Entities.Count == 1, "The selected native staff policy web resource is absent or ambiguous.");
            string encoded = rows.Entities[0].GetAttributeValue<string>("content");
            Contract.Require(encoded != null && encoded.Length <= 1400000, "Retain a bounded complete native staff policy.");
            byte[] raw;
            try { raw = Convert.FromBase64String(encoded); }
            catch (FormatException) { throw new InvalidPluginExecutionException("The native policy content is not complete base64."); }
            return new StaffPolicy(new UTF8Encoding(false, true).GetString(raw));
        }
        internal ColumnSet Columns()
        {
            var names = new List<string> { NameField, SourceField, StateField, PhaseField, "ownerid" };
            if (FinancialField != null) names.Add(FinancialField);
            return new ColumnSet(names.Distinct().ToArray());
        }
        internal Dictionary<string, object> SourceContext(Entity row)
        {
            object source = ReadColumn(row, SourceField), financial = FinancialField == null ? null : ReadColumn(row, FinancialField);
            if (source != null)
            {
                Contract.S(Pointer(source, (string)PortfolioBinding["id_pointer"]), "original portfolio ID", 160);
                Contract.Int(Pointer(source, (string)PortfolioBinding["revision_pointer"]), "original portfolio revision");
                Contract.HashValue(Pointer(source, (string)PortfolioBinding["snapshot_pointer"]), "original portfolio snapshot");
            }
            return Contract.D("source", source, "financial", financial, "source_sha256", Contract.Identity(source),
                "financial_sha256", financial == null ? null : Contract.Identity(financial),
                "financial_meaning", "Original linked financial edition; null is unavailable, never zero. Currency, amount basis, period and row occurrences remain as supplied.");
        }
        private static object Pointer(object value, string pointer)
        {
            foreach (string encoded in pointer.Substring(1).Split('/'))
            {
                var part = new System.Text.StringBuilder();
                for (int i = 0; i < encoded.Length; ++i)
                {
                    if (encoded[i] != '~') part.Append(encoded[i]);
                    else
                    {
                        Contract.Require(++i < encoded.Length && (encoded[i] == '0' || encoded[i] == '1'), "The source JSON pointer has an invalid escape.");
                        part.Append(encoded[i] == '0' ? '~' : '/');
                    }
                }
                var record = value as Dictionary<string, object>;
                var list = value as List<object>; string key = part.ToString();
                if (record != null) value = Contract.Get(record, key);
                else if (list != null)
                {
                    int index = -1; Contract.Require(System.Text.RegularExpressions.Regex.IsMatch(key, @"^(0|[1-9][0-9]*)$")
                        && Int32.TryParse(key, out index) && index < list.Count, "The source JSON pointer does not select an original array member.");
                    value = list[index];
                }
                else throw new ArgumentException("The source JSON pointer does not select the original portfolio identity.");
            }
            return value;
        }
        private static object ReadColumn(Entity row, string field)
        {
            object value;
            if (!row.Attributes.TryGetValue(field, out value) || value == null) return null;
            Contract.Require(value is string, "The selected original source/financial column must hold complete JSON text.");
            if (String.IsNullOrWhiteSpace((string)value)) return null;
            return Json.Parse((string)value);
        }
        internal Dictionary<string, object> State(Entity row)
        {
            string raw = row.GetAttributeValue<string>(StateField);
            if (String.IsNullOrWhiteSpace(raw)) return null;
            var state = Contract.Map(Json.Parse(raw), "original staff state");
            Contract.Require((string)state["schema"] == Contract.StateSchema, "The native staff record has another state schema.");
            Contract.Require((string)state["entity"] == row.LogicalName && Contract.GuidValue(state["record_id"], "state record") == row.Id,
                "The stored staff state belongs to another original record.");
            return state;
        }
        internal Dictionary<string, object> Step(string id)
        { return Steps.Select(x => Contract.Map(x, "step")).SingleOrDefault(x => (string)x["id"] == id); }
        internal Dictionary<string, object> Clearance(string id)
        { return Clearances.Select(x => Contract.Map(x, "clearance")).SingleOrDefault(x => (string)x["id"] == id); }
    }

    internal sealed class StaffActor
    {
        internal readonly Guid UserId;
        internal readonly HashSet<string> Roles = new HashSet<string>(StringComparer.Ordinal);
        internal StaffActor(IOrganizationService service, Guid userId, StaffPolicy policy)
        {
            UserId = userId;
            var native = new HashSet<Guid>();
            var direct = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid", "parentrootroleid"), Distinct = true };
            var userRoles = direct.AddLink("systemuserroles", "roleid", "roleid", JoinOperator.Inner);
            userRoles.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            foreach (var row in Contract.Page(service, direct)) Add(native, row);
            var teams = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid", "parentrootroleid"), Distinct = true };
            var teamRoles = teams.AddLink("teamroles", "roleid", "roleid", JoinOperator.Inner);
            var membership = teamRoles.AddLink("teammembership", "teamid", "teamid", JoinOperator.Inner);
            membership.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            foreach (var row in Contract.Page(service, teams)) Add(native, row);
            foreach (var binding in policy.RoleBindings)
                if (Contract.List(binding.Value, "native roles").Any(x => native.Contains(Contract.GuidValue(x, "native role")))) Roles.Add(binding.Key);
        }
        private static void Add(HashSet<Guid> result, Entity row)
        {
            if (row.Id != Guid.Empty) result.Add(row.Id);
            var root = row.GetAttributeValue<EntityReference>("parentrootroleid");
            if (root != null) result.Add(root.Id);
        }
        internal bool Has(IEnumerable<object> roles) { return roles.Any(x => Roles.Contains((string)x)); }
        internal void RequireAction(StaffPolicy policy, string action)
        {
            object roles;
            Contract.Require(policy.Actions.TryGetValue(action, out roles) && Has(Contract.List(roles, "action roles")),
                "The current native user/team roles do not permit this staff action.");
        }
        internal void RequireRoles(object roles)
        { Contract.Require(Has(Contract.List(roles, "required roles")), "This review requires its mapped native role."); }
    }
}
