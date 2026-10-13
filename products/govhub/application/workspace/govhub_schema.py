"""GovHub operating records added to the unchanged assessment core registry."""

SCHEMAS = {}


def configure(schema):
    f = schema.F
    review = [f("review_state", "Review state", "select", options=["Unreviewed", "Reviewed"], default="Unreviewed"), f("review_basis", "Review basis and retained sources", "textarea")]
    values = {
        "sites": {"title": "Sites and agencies", "singular": "Site", "fields": [
            f("name", "Site name", required=True), f("comparison_id", "Original manifest comparison ID", required=True),
            f("agency_id", "Owning agency identifier"), f("agency_name", "Owning agency name"),
            f("canonical_url", "Canonical HTTPS URL", required=True),
            f("owner", "Accountable site owner"), f("technical_contact", "Technical contact or team"),
            f("incumbent_environment_id", "Incumbent environment", "reference", ref="environments"),
            f("candidate_environment_id", "Candidate environment", "reference", ref="environments"),
            f("criticality", "Operating criticality", "select", options=["Unassessed", "High", "Medium", "Low"], default="Unassessed"),
            f("recovery_time_minutes", "Agreed recovery time, minutes", "number"),
            f("recovery_point_minutes", "Agreed recovery point, minutes", "number"),
            f("content_scope", "Content, files and configuration scope", "textarea"),
            f("dependencies", "Service, integration and WAF dependencies", "textarea"),
            f("source_reference", "Original scope source"), f("notes", "Operating notes", "textarea"), *review]},
        "environments": {"title": "Operating environments", "singular": "Environment", "fields": [
            f("name", "Environment name", required=True),
            f("provider", "Provider", "select", options=["Drupal native", "Acquia Cloud", "Lagoon", "Pantheon", "Skpr", "Tugboat", "Upsun", "Castor", "Prime supplied"], default="Prime supplied"),
            f("purpose", "Operating purpose", "select", options=["Incumbent", "Candidate", "Rehearsal", "Production"], default="Rehearsal"),
            f("provider_resource_id", "Actual provider environment identifier"),
            f("canonical_url", "Environment HTTPS URL"), f("owner", "Operating owner"),
            f("authorization_reference", "Target operating authorization", required=True),
            f("data_location", "Data location"), f("native_profile", "Configured native driver profile"),
            f("notes", "Runtime, access and scope notes", "textarea"), *review]},
        "migration_issues": {"title": "Migration work", "singular": "Migration issue", "fields": [
            f("name", "Issue or corrective work", required=True),
            f("site_ids", "Affected sites", "references", ref="sites"), f("plan_id", "Plan identifier"),
            f("source_reference", "Original finding, audit or operation"),
            f("severity", "Priority", "select", options=["High", "Medium", "Low"], default="Medium"),
            f("status", "Status", "select", options=["Open", "In progress", "Resolved", "Accepted"], default="Open"),
            f("owner", "Assigned owner"), f("due_at", "Agreed due time", "datetime"),
            f("description", "Observed condition and consequence", "textarea"),
            f("resolution", "Actual corrective action and result", "textarea"),
            f("resolved_at", "Actual completion time", "datetime"), *review]},
    }
    for item in values.values():
        item["govhub"] = True
        item["group"] = "GovHub operations"
    SCHEMAS.clear()
    SCHEMAS.update(values)
    schema.SCHEMAS.update(values)
