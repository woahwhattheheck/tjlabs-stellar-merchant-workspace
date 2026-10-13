// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace TJLabs.GrantStaff
{
    internal sealed class NativeContext
    {
        internal readonly IPluginExecutionContext Context;
        internal readonly IOrganizationService Service;
        private readonly IOrganizationService Custody;
        private Entity AccessCheckedProject;
        internal readonly StaffPolicy Policy;
        internal readonly StaffActor Actor;
        internal NativeContext(IServiceProvider provider, string message)
        {
            Context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            Contract.Require(Context != null && Context.MessageName == message && Context.Stage == 30 && Context.Mode == 0,
                "Use the registered synchronous native Custom API.");
            Contract.Require(Context.InitiatingUserId != Guid.Empty, "The original native initiating user is required.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            // All original project reads and updates use the initiating user's actual rights.
            Service = factory.CreateOrganizationService(Context.InitiatingUserId);
            // App users receive no direct CRUD privilege on the two internal tables.
            // SQL/TDS does not run Retrieve plugins. This fixed-table custody service is
            // available only after Project has passed the caller's record access check.
            Custody = factory.CreateOrganizationService(null);
            Policy = StaffPolicy.Load(Service);
            Actor = new StaffActor(Service, Context.InitiatingUserId, Policy);
        }
        internal Dictionary<string, object> Input()
        {
            Contract.Require(Context.InputParameters.Contains("Request") && Context.InputParameters["Request"] is string,
                "Supply the complete Request JSON string.");
            return Contract.Map(Json.Parse((string)Context.InputParameters["Request"], 900000), "Request");
        }
        internal Entity Project(Dictionary<string, object> request)
        {
            string entity = Contract.Logical(request["entity"], "original record table");
            Guid id = Contract.GuidValue(request["record_id"], "original record ID");
            Contract.Require(entity == Policy.EntityName, "Select the existing project table in the accepted binding.");
            var row = Service.Retrieve(entity, id, Policy.Columns());
            Contract.Require(row.Id == id && row.LogicalName == entity, "The native source returned a different original record.");
            AccessCheckedProject = row;
            return row; // Dataverse itself enforces actual record-level read access here.
        }
        internal T Guarded<T>(Func<T> action)
        {
            object old; bool had = Context.SharedVariables.TryGetValue(Contract.GuardKey, out old);
            Context.SharedVariables[Contract.GuardKey] = Context.CorrelationId.ToString("D");
            try { return action(); }
            finally
            {
                if (had) Context.SharedVariables[Contract.GuardKey] = old;
                else Context.SharedVariables.Remove(Contract.GuardKey);
            }
        }
        private void RequireCustody(string table)
        {
            Contract.Require(AccessCheckedProject != null
                && (table == Contract.OperationTable || table == Contract.HistoryTable),
                "Internal custody requires the actual accessible project and a fixed internal table.");
        }
        private void CheckCustodyRow(Entity row)
        {
            RequireCustody(row.LogicalName);
            Contract.Require(row.GetAttributeValue<string>("tjl_entity") == AccessCheckedProject.LogicalName
                && row.GetAttributeValue<string>("tjl_recordid") == AccessCheckedProject.Id.ToString("D"),
                "Internal history belongs to another original project.");
        }
        internal EntityCollection ReadCustody(QueryExpression query)
        {
            RequireCustody(query.EntityName);
            query.ColumnSet.AddColumns("tjl_entity", "tjl_recordid");
            return Guarded(() =>
            {
                var rows = Custody.RetrieveMultiple(query);
                foreach (var row in rows.Entities) CheckCustodyRow(row);
                return rows;
            });
        }
        internal Entity ReadCustody(string table, Guid id, ColumnSet columns)
        {
            RequireCustody(table); columns.AddColumns("tjl_entity", "tjl_recordid");
            return Guarded(() => { var row = Custody.Retrieve(table, id, columns); CheckCustodyRow(row); return row; });
        }
        internal void CreateCustody(Entity row)
        {
            CheckCustodyRow(row);
            Contract.Require(Context.MessageName == Contract.CommandName && Context.IsInTransaction,
                "Internal history is appended only by the original native command transaction.");
            Guarded(() => Custody.Create(row));
        }
        internal Entity Operation(Guid id, Entity project)
        {
            return Guarded(() =>
            {
                var query = new QueryExpression(Contract.OperationTable) { ColumnSet = new ColumnSet(true), TopCount = 2 };
                query.Criteria.AddCondition(Contract.OperationTable + "id", ConditionOperator.Equal, id);
                var rows = ReadCustody(query);
                Contract.Require(rows.Entities.Count <= 1, "An operation ID has multiple native records.");
                if (rows.Entities.Count == 0) return null;
                var row = rows.Entities[0];
                Contract.Require(row.GetAttributeValue<string>("tjl_entity") == project.LogicalName
                    && row.GetAttributeValue<string>("tjl_recordid") == project.Id.ToString("D"),
                    "The original operation belongs to another project record.");
                return row;
            });
        }
        internal void Respond(object value) { Context.OutputParameters["Response"] = Json.Write(value); }
    }

    public sealed class StaffCommand : IPlugin
    {
        public void Execute(IServiceProvider provider)
        {
            try { Run(provider); }
            catch (ArgumentException error) { throw new InvalidPluginExecutionException(error.Message); }
            catch (OverflowException) { throw new InvalidPluginExecutionException("The retained staff revision exceeds its supported bound."); }
        }
        private static void Run(IServiceProvider provider)
        {
            var native = new NativeContext(provider, Contract.CommandName);
            Contract.Require(native.Context.IsInTransaction, "Staff commands require the native synchronous transaction.");
            var request = native.Input();
            Json.Shape(request, new[] { "schema", "operation_id", "entity", "record_id", "action", "expected_row_version",
                "expected_state_version", "expected_source_sha256", "policy_sha256", "payload" },
                new[] { "schema", "operation_id", "entity", "record_id", "action", "expected_row_version",
                "expected_state_version", "expected_source_sha256", "policy_sha256", "payload" });
            Contract.Require((string)request["schema"] == Contract.RequestSchema, "Use the original native staff command schema.");
            Guid operation = Contract.GuidValue(request["operation_id"], "operation ID");
            string action = Contract.S(request["action"], "staff action", 100);
            var project = native.Project(request);
            string originalRequest = Json.Write(request), requestSha = Contract.Hash(originalRequest);
            var saved = native.Operation(operation, project);
            if (saved != null)
            {
                Contract.Require(saved.GetAttributeValue<string>("tjl_requestsha") == requestSha
                    && saved.GetAttributeValue<string>("tjl_request") == originalRequest
                    && saved.GetAttributeValue<string>("tjl_actorid") == native.Context.InitiatingUserId.ToString("D"),
                    "This operation ID is already bound to another complete request or actor.");
                string response = saved.GetAttributeValue<string>("tjl_response");
                Contract.Require(!String.IsNullOrEmpty(response), "The original native operation has no completed response; reconcile that operation.");
                native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-command-result/v1", "reused", true, "result", Json.Parse(response)));
                return;
            }
            Contract.Require(Contract.HashValue(request["policy_sha256"], "selected policy") == native.Policy.Sha256,
                "The accepted native policy changed; review the actual current rule set.");
            string expectedVersion = Contract.S(request["expected_row_version"], "original row version", 100);
            Contract.Require(!String.IsNullOrEmpty(project.RowVersion) && project.RowVersion == expectedVersion,
                "The original native record changed. Reopen it before deciding; no staff write was performed.");
            var before = native.Policy.State(project);
            int expectedState = Contract.Int(request["expected_state_version"], "expected staff revision");
            Contract.Require((before == null ? 0 : Contract.Int(before["version"], "staff revision")) == expectedState,
                "The selected staff revision changed.");
            var source = native.Policy.SourceContext(project);
            Contract.Require(Contract.HashValue(request["expected_source_sha256"], "original source context") == Contract.Identity(source),
                "The selected original source/financial edition changed.");
            if (before != null && (string)before["phase"] == "QA_SUBMITTED"
                && action.StartsWith("qa.", StringComparison.Ordinal) && action != "qa.withdraw")
            {
                var qa = Contract.Map(before["qa"], "current QA");
                var pack = Contract.Map(qa["pack"], "original QA pack");
                Contract.Require((string)pack["policy_sha256"] == native.Policy.Sha256
                    && Contract.Identity(pack["source_context"]) == Contract.Identity(source),
                    "The original QA pack is stale against the selected source/policy. Withdraw and re-submit the corrected pack.");
            }
            var payload = Contract.Map(request["payload"], "action payload");
            DateTime now = DateTime.UtcNow;
            var after = StaffWorkflow.Apply(native.Policy, native.Actor, project, before, source, action, payload, operation, now);
            string beforeText = Json.Write(before), afterText = Json.Write(after), sourceText = Json.Write(source);
            Contract.Require(System.Text.Encoding.UTF8.GetByteCount(sourceText) <= 900000,
                "Retain this complete source edition through the original receiving layer; it exceeds the selected native source-column budget.");
            var result = Contract.D("schema", "tjlabs.pmrs.staff-native-receipt/v1",
                "operation_id", operation.ToString("D"), "request_sha256", requestSha,
                "entity", project.LogicalName, "record_id", project.Id.ToString("D"), "action", action,
                "actor_id", native.Context.InitiatingUserId.ToString("D"),
                "at", Contract.Now(now), "before_row_version", project.RowVersion,
                "before_state_version", expectedState, "after_state_version", after["version"], "phase", after["phase"],
                "before_sha256", Contract.Hash(beforeText), "after_sha256", Contract.Hash(afterText),
                "source_sha256", Contract.Hash(sourceText), "policy_sha256", native.Policy.Sha256,
                "history_id", operation.ToString("D"),
                "meaning", "The same native transaction retained the complete action and updated only the selected staff fields.");
            string responseText = Json.Write(result);
            native.Guarded(() =>
            {
                // A duplicate concurrent operation fails its native create transaction. It is never treated as a second action.
                var journal = new Entity(Contract.OperationTable, operation);
                journal["tjl_name"] = operation.ToString("D");
                journal["tjl_entity"] = project.LogicalName; journal["tjl_recordid"] = project.Id.ToString("D");
                journal["tjl_actorid"] = native.Context.InitiatingUserId.ToString("D");
                journal["tjl_action"] = action; journal["tjl_requestsha"] = requestSha;
                journal["tjl_request"] = originalRequest; journal["tjl_response"] = responseText;
                journal["tjl_staffversion"] = Contract.Int(after["version"], "staff version");
                native.CreateCustody(journal);
                var update = new Entity(project.LogicalName, project.Id) { RowVersion = project.RowVersion };
                update[native.Policy.StateField] = afterText; update[native.Policy.PhaseField] = (string)after["phase"];
                native.Service.Execute(new UpdateRequest { Target = update, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
                var history = new Entity(Contract.HistoryTable, operation);
                history["tjl_name"] = operation.ToString("D");
                history["tjl_entity"] = project.LogicalName; history["tjl_recordid"] = project.Id.ToString("D");
                history["tjl_actorid"] = native.Context.InitiatingUserId.ToString("D"); history["tjl_action"] = action;
                history["tjl_staffversion"] = Contract.Int(after["version"], "staff version");
                history["tjl_requestsha"] = requestSha; history["tjl_before"] = beforeText; history["tjl_after"] = afterText;
                history["tjl_sources"] = sourceText; history["tjl_policy"] = Json.Write(native.Policy.Document);
                history["tjl_receipt"] = responseText;
                native.CreateCustody(history);
                return true;
            });
            // Exceptions, including an actual concurrency or privilege fault, leave this synchronous transaction rolled back.
            native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-command-result/v1", "reused", false, "result", result));
        }
    }

    public sealed class StaffRead : IPlugin
    {
        public void Execute(IServiceProvider provider)
        {
            try { Run(provider); }
            catch (ArgumentException error) { throw new InvalidPluginExecutionException(error.Message); }
        }
        private static void Run(IServiceProvider provider)
        {
            var native = new NativeContext(provider, Contract.ReadName);
            var request = native.Input();
            Json.Shape(request, new[] { "schema", "entity", "record_id", "view", "operation_id", "after_version", "limit", "member" },
                new[] { "schema", "entity", "record_id", "view" });
            Contract.Require((string)request["schema"] == Contract.ReadSchema, "Use the original staff read schema.");
            var project = native.Project(request); // Every path checks the selected original record before internal history.
            string view = Contract.S(request["view"], "staff view", 100);
            if (view == "context")
            {
                var state = native.Policy.State(project); var source = native.Policy.SourceContext(project);
                bool qaCurrent = true;
                if (state != null && state["qa"] != null)
                {
                    var pack = Contract.Map(Contract.Map(state["qa"], "QA")["pack"], "QA pack");
                    qaCurrent = (string)pack["policy_sha256"] == native.Policy.Sha256
                        && Contract.Identity(pack["source_context"]) == Contract.Identity(source);
                }
                native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-context/v1",
                    "entity", project.LogicalName, "record_id", project.Id.ToString("D"),
                    "name", project.GetAttributeValue<string>(native.Policy.NameField),
                    "row_version", project.RowVersion, "state_version", state == null ? 0 : Contract.Int(state["version"], "state revision"),
                    "state", state, "source_context", source, "source_sha256", Contract.Identity(source),
                    "policy", native.Policy.Document, "policy_sha256", native.Policy.Sha256,
                    "actor_id", native.Context.InitiatingUserId.ToString("D"), "roles", native.Actor.Roles.OrderBy(x => x).ToArray(),
                    "available_actions", native.Policy.Actions.Where(x => native.Actor.Has(Contract.List(x.Value, "roles"))).Select(x => x.Key).OrderBy(x => x).ToArray(),
                    "completeness_gaps", StaffWorkflow.Gaps(native.Policy, state, source), "qa_source_current", qaCurrent,
                    "native_financial_write_performed", false));
                return;
            }
            if (view == "history")
            {
                int after = request.ContainsKey("after_version") ? Contract.Int(request["after_version"], "after version") : 0;
                int limit = request.ContainsKey("limit") ? Contract.Int(request["limit"], "history limit", 1, 50) : 20;
                var rows = native.Guarded(() =>
                {
                    var query = new QueryExpression(Contract.HistoryTable)
                    { ColumnSet = new ColumnSet("tjl_receipt", "tjl_staffversion"), TopCount = limit + 1 };
                    query.Criteria.AddCondition("tjl_entity", ConditionOperator.Equal, project.LogicalName);
                    query.Criteria.AddCondition("tjl_recordid", ConditionOperator.Equal, project.Id.ToString("D"));
                    query.Criteria.AddCondition("tjl_staffversion", ConditionOperator.GreaterThan, after);
                    query.AddOrder("tjl_staffversion", OrderType.Ascending);
                    query.AddOrder(Contract.HistoryTable + "id", OrderType.Ascending);
                    return native.ReadCustody(query).Entities.ToList();
                });
                bool more = rows.Count > limit; var selected = rows.Take(limit).ToList();
                var receipts = selected.Select(x => Json.Parse(x.GetAttributeValue<string>("tjl_receipt"))).ToList();
                native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-history-page/v1",
                    "entity", project.LogicalName, "record_id", project.Id.ToString("D"), "after_version", after,
                    "rows", receipts, "next_after_version", more && selected.Count > 0 ? (object)selected.Last().GetAttributeValue<int>("tjl_staffversion") : null,
                    "more", more, "scope", "Original immutable actions for this accessible project. Later actions can be read through the same keyset."));
                return;
            }
            if (view == "operation" || view == "history-member")
            {
                Guid id = Contract.GuidValue(Contract.Get(request, "operation_id"), "original operation ID");
                var op = native.Operation(id, project);
                if (op == null)
                {
                    native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-operation-read/v1", "operation_id", id.ToString("D"),
                        "found", false, "meaning", "No visible completed native operation was returned. This is not a claim about an in-flight transport."));
                    return;
                }
                if (view == "operation")
                {
                    native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-operation-read/v1", "operation_id", id.ToString("D"),
                        "found", true, "request", Json.Parse(op.GetAttributeValue<string>("tjl_request")),
                        "result", Json.Parse(op.GetAttributeValue<string>("tjl_response"))));
                    return;
                }
                string member = Contract.S(Contract.Get(request, "member"), "history member", 100);
                var names = new Dictionary<string, string> { { "before", "tjl_before" }, { "after", "tjl_after" },
                    { "sources", "tjl_sources" }, { "policy", "tjl_policy" }, { "receipt", "tjl_receipt" } };
                Contract.Require(names.ContainsKey(member), "Select a complete declared original history member.");
                var history = native.ReadCustody(Contract.HistoryTable, id,
                    new ColumnSet("tjl_entity", "tjl_recordid", names[member]));
                Contract.Require(history.GetAttributeValue<string>("tjl_entity") == project.LogicalName
                    && history.GetAttributeValue<string>("tjl_recordid") == project.Id.ToString("D"), "The native history belongs to another source record.");
                string text = history.GetAttributeValue<string>(names[member]);
                Contract.Require(text != null, "The original native history member is absent.");
                native.Respond(Contract.D("schema", "tjlabs.pmrs.staff-history-member/v1", "operation_id", id.ToString("D"),
                    "member", member, "bytes", System.Text.Encoding.UTF8.GetByteCount(text), "sha256", Contract.Hash(text), "text", text));
                return;
            }
            throw new InvalidPluginExecutionException("Unknown native staff read view.");
        }
    }

    public sealed class StaffGuard : IPlugin
    {
        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            Contract.Require(context != null && context.Mode == 0, "The staff guard must run synchronously.");
            if (Trusted(context)) return;
            string entity = context.PrimaryEntityName;
            if (entity == Contract.OperationTable || entity == Contract.HistoryTable)
                throw new InvalidPluginExecutionException("Read or change staff history through its native project-scoped API.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var policy = StaffPolicy.Load(service);
            if (entity != policy.EntityName) return;
            var protectedFields = new HashSet<string>(new[] { policy.StateField, policy.PhaseField }, StringComparer.Ordinal);
            foreach (var row in Targets(context))
                if (row.Attributes.Keys.Any(x => protectedFields.Contains(x)))
                    throw new InvalidPluginExecutionException("Use the native staff command for phase or review-state changes.");
            if (context.MessageName == "Delete" || context.MessageName == "Merge" || context.MessageName == "DeleteMultiple")
            {
                var ids = new HashSet<Guid>();
                if (context.PrimaryEntityId != Guid.Empty) ids.Add(context.PrimaryEntityId);
                foreach (var value in context.InputParameters.Values)
                {
                    var er = value as EntityReference; if (er != null && er.LogicalName == policy.EntityName) ids.Add(er.Id);
                    if (value is Guid && (Guid)value != Guid.Empty) ids.Add((Guid)value);
                    var references = value as EntityReferenceCollection;
                    if (references != null) foreach (var item in references) if (item.LogicalName == policy.EntityName) ids.Add(item.Id);
                }
                foreach (var id in ids)
                {
                    var row = service.Retrieve(policy.EntityName, id, new ColumnSet(policy.StateField));
                    if (!String.IsNullOrWhiteSpace(row.GetAttributeValue<string>(policy.StateField)))
                        throw new InvalidPluginExecutionException("Retain the original project while its staff history exists; use an explicit closure or correction.");
                }
            }
        }
        private static IEnumerable<Entity> Targets(IPluginExecutionContext context)
        {
            foreach (var value in context.InputParameters.Values)
            {
                var one = value as Entity; if (one != null) yield return one;
                var many = value as EntityCollection; if (many != null) foreach (var row in many.Entities) yield return row;
            }
        }
        private static bool Trusted(IPluginExecutionContext context)
        {
            var parent = context.ParentContext; int depth = 0;
            while (parent != null && ++depth <= 16)
            {
                object mark;
                if ((parent.MessageName == Contract.CommandName || parent.MessageName == Contract.ReadName)
                    && parent.Stage == 30 && parent.Mode == 0 && parent.CorrelationId == context.CorrelationId
                    && parent.SharedVariables.TryGetValue(Contract.GuardKey, out mark)
                    && mark is string && (string)mark == context.CorrelationId.ToString("D")) return true;
                parent = parent.ParentContext;
            }
            return false;
        }
    }
}
