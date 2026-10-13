"""Operator records and explicit assessment criteria with public source references."""
import re
from datetime import date, datetime

DOMAIN_OPTIONS = ['HR', 'Finance', 'Loan administration', 'CRM / client', 'Learning / training', 'Communications', 'Analytics', 'Other']
ERM_OPTIONS = ['Governance and policy enforcement', 'Cybersecurity control effectiveness', 'Vendor and third-party risk', 'Data protection and privacy', 'Workforce and operating environment', 'Other']
MATURITY_DOMAINS = ['Security', 'Integration', 'Data governance']
MATURITY_LEVELS = [
    {'level': 1, 'name': 'Initial', 'basis': 'Work depends on individuals; repeatable ownership and procedures are not established.'},
    {'level': 2, 'name': 'Documented', 'basis': 'Owners, procedures and expected controls are defined and recorded.'},
    {'level': 3, 'name': 'Enforced', 'basis': 'Defined controls operate across the assessed scope and exceptions have a managed resolution path.'},
    {'level': 4, 'name': 'Measured', 'basis': 'Role owners use measured control results and regular review to manage performance and exceptions.'},
    {'level': 5, 'name': 'Improving', 'basis': 'Measured results and incidents drive sustained, demonstrable improvement and adoption.'},
]
SOURCE = {
    'title': 'CSH IT Systems Cybersecurity Audit & Systems Integration Review, v2',
    'url': 'https://www.csh.org/wp-content/uploads/2-RFP-CSH-Systems-audit-Integration-V2.pdf',
    'issuer_page': 'https://www.csh.org/2026/07/rfp-csh-it-systems-cybersecurity-audit-systems-integration-review/',
    'edition_date': '2026-08-26', 'proposal_due_date': '2026-10-16',
    'requirements': [
        {'pages': '6–7', 'area': 'Inventory', 'implemented_by': 'Reviewed record-domain decisions, role-owned systems and manual/API/third-party integrations, validation dates and lifecycle details.'},
        {'pages': '7–8', 'area': 'Reconciliation', 'implemented_by': 'Retained CSV versions, declared comparison profiles, immutable native reports, exceptions and separate reviewer dispositions.'},
        {'pages': '5–6', 'area': 'ERM', 'implemented_by': 'Role-owned findings, ERM categories, mitigation state, indicators and recorded escalation history.'},
        {'pages': '8–10', 'area': 'Roadmap and maturity', 'implemented_by': 'Current/recommended maps, dependency sequence, three horizons, Top 5, adoption changes and reviewer-defined maturity basis.'},
        {'pages': '11–12', 'area': 'Engagement', 'implemented_by': 'Role interviews, conflicting observations and their resolution, staff time, linked findings and actions.'},
    ],
}


class Problem(Exception):
    def __init__(self, message, status=422, fields=None):
        super().__init__(message); self.status = status; self.fields = fields or {}


def field(name, title, kind='text', required=False, options=None, ref=None, help='', default=None):
    value = dict(name=name, title=title, type=kind, required=required, help=help)
    if options is not None: value['options'] = options
    if ref: value['ref'] = ref
    if default is not None: value['default'] = default
    return value


F = field
COMMON_REVIEW = [F('review_state', 'Review state', 'select', options=['Unreviewed', 'Reviewed'], default='Unreviewed'), F('review_basis', 'Review basis / supporting sources', 'textarea')]
SCHEMAS = {
    'systems': {'title': 'Systems', 'singular': 'System', 'fields': [
        F('name', 'System name', required=True), F('category', 'Business area', 'select', options=DOMAIN_OPTIONS, default='Other'),
        F('owner_role', 'System owner role'), F('data_owner_role', 'Accountable data owner role'),
        F('record_domains', 'Claimed record domains', 'multi', options=DOMAIN_OPTIONS, help='Retain competing claims. The record-domain review records the authoritative decision.'),
        F('purpose', 'Business purpose', 'textarea'), F('vendor', 'Vendor / platform'),
        F('criticality', 'Operational criticality', 'select', options=['Unassessed', 'High', 'Medium', 'Low'], default='Unassessed'),
        F('classification', 'Data classification'), F('retention', 'Retention / long-term storage'),
        F('review_cadence', 'Ownership and alignment review cadence'), F('recovery_time', 'Documented recovery time objective'),
        F('recovery_point', 'Documented recovery point objective'), F('recovery_basis', 'Recovery capability and dependency notes', 'textarea'),
        F('notes', 'Operating context and source notes', 'textarea'), *COMMON_REVIEW]},
    'record_decisions': {'title': 'Systems of record', 'singular': 'Record-domain decision', 'fields': [
        F('name', 'Decision title', required=True), F('domain', 'Record domain', 'select', True, DOMAIN_OPTIONS),
        F('authoritative_system', 'Selected authoritative system', 'reference', ref='systems'),
        F('candidate_systems', 'Competing / consuming systems', 'references', ref='systems'),
        F('owner_role', 'Accountable business role'), F('basis', 'Decision, scope and source basis', 'textarea'),
        F('review_cadence', 'Review cadence'), F('control_ids', 'Linked reconciliation controls', 'references', ref='controls'), *COMMON_REVIEW]},
    'integrations': {'title': 'Integrations', 'singular': 'Integration', 'fields': [
        F('name', 'Integration name', required=True), F('source_system', 'Source system', 'reference', ref='systems'),
        F('target_system', 'Target system', 'reference', ref='systems'),
        F('method', 'Exchange method', 'select', options=['API', 'Manual', 'File', 'Connector', 'Middleware', 'EDI', 'Other'], default='File'),
        F('direction', 'Direction', 'select', options=['Source to target', 'Bidirectional'], default='Source to target'),
        F('owner_role', 'Integration owner role'), F('purpose', 'Business purpose', 'textarea'), F('data_exchanged', 'Data exchanged', 'textarea'),
        F('last_validated', 'Last actual validation', 'date'), F('cadence', 'Exchange / review cadence'),
        F('authorization', 'Recorded authorization', 'select', options=['Unknown', 'Approved', 'Not approved', 'Review required'], default='Unknown'),
        F('approval_basis', 'Authorization source / process', 'textarea'), F('entry', 'Entry and source capture', 'textarea'),
        F('transformation', 'Transformations', 'textarea'), F('storage', 'Storage and reporting', 'textarea'),
        F('retention', 'Retention / end of life', 'textarea'), F('latency', 'Expected / observed latency'),
        F('manual_steps', 'Manual steps and workarounds', 'textarea'), F('monitoring', 'Monitoring, audit and escalation', 'textarea'),
        F('recommended_source', 'Recommended source system', 'reference', ref='systems'),
        F('recommended_target', 'Recommended target system', 'reference', ref='systems'),
        F('recommended_method', 'Recommended method', 'select', options=['', 'API', 'Manual', 'File', 'Connector', 'Middleware', 'EDI', 'Other']),
        F('recommended_disposition', 'Recommended disposition', 'select', options=['Retain', 'Change', 'Retire', 'Undecided'], default='Undecided'),
        F('recommendation_basis', 'Recommended structure and rationale', 'textarea'), *COMMON_REVIEW]},
    'controls': {'title': 'Controls', 'singular': 'Reconciliation / governance control', 'fields': [
        F('name', 'Control name', required=True), F('system_ids', 'Systems', 'references', ref='systems'),
        F('integration_ids', 'Integrations', 'references', ref='integrations'), F('owner_role', 'Control owner role'),
        F('mechanism', 'Control mechanism', 'select', options=['Automated', 'Manual', 'Combined', 'Proposed'], default='Proposed'),
        F('procedure', 'Procedure and exception response', 'textarea'), F('cadence', 'Operating cadence'),
        F('indicator', 'Measurable indicator'), F('expected_result', 'Expected result / threshold'),
        F('monitoring', 'Monitoring and reporting route', 'textarea'), F('evidence', 'Observed operation / retained source basis', 'textarea'),
        F('framework_reference', 'Assessor-provided framework reference'), *COMMON_REVIEW]},
    'risks': {'title': 'Findings and ERM', 'singular': 'Finding', 'fields': [
        F('name', 'Finding title', required=True), F('description', 'Observed condition and consequence', 'textarea'),
        F('severity', 'Assessed priority', 'select', options=['Unassessed', 'High', 'Medium', 'Low'], default='Unassessed'),
        F('erm_category', 'ERM category', 'select', options=ERM_OPTIONS, default='Other'),
        F('mitigation_state', 'Risk status', 'select', options=['New', 'Existing', 'Partially mitigated'], default='New'),
        F('owner_role', 'Recommended business owner role'), F('indicator', 'Measurable ERM indicator'),
        F('discovered_at', 'Actual discovery time (UTC)', 'datetime'), F('immediate_alert', 'Immediate-risk alert required', 'bool'),
        F('system_ids', 'Systems', 'references', ref='systems'), F('integration_ids', 'Integrations', 'references', ref='integrations'),
        F('control_ids', 'Controls', 'references', ref='controls'), F('observation_ids', 'Qualitative observations', 'references', ref='observations'),
        F('exception_ids', 'Reconciliation exception references', 'list'), F('evidence', 'Evidence and scope', 'textarea'),
        F('escalated_at', 'Actual escalation time (UTC)', 'datetime'), F('escalation_route', 'Actual recipient role / route'),
        F('escalation_reference', 'Sent / meeting / incident reference'), F('escalation_outcome', 'Escalation response / disposition', 'textarea'),
        *COMMON_REVIEW]},
    'actions': {'title': 'Roadmap', 'singular': 'Recommendation', 'fields': [
        F('name', 'Recommendation', required=True), F('change', 'What changes', 'textarea'), F('rationale', 'Why the change is needed', 'textarea'),
        F('benefits', 'Expected benefits', 'textarea'), F('owner_role', 'Accountable implementation role'),
        F('priority', 'Priority', 'select', options=['High', 'Medium', 'Low'], default='Medium'),
        F('horizon', 'Delivery horizon', 'select', options=['0–90 days', '3–9 months', '9–24 months'], default='0–90 days'),
        F('effort_days', 'Estimated calendar duration (days)', 'number', default=1), F('complexity', 'Effort and complexity basis', 'textarea'),
        F('dependencies', 'Prerequisite recommendations', 'references', ref='actions'), F('capabilities', 'Required capabilities / prerequisites', 'textarea'),
        F('risk_ids', 'Findings', 'references', ref='risks'), F('system_ids', 'Systems', 'references', ref='systems'),
        F('integration_ids', 'Integrations', 'references', ref='integrations'),
        F('top_five_rank', 'Top 5 within 30 days (rank 1–5)', 'number'),
        F('staff_change', 'What staff do differently', 'textarea'), F('manager_change', 'What managers do differently', 'textarea'),
        F('owner_change', 'What system owners do differently', 'textarea'), F('workflow_risk', 'Current workflow risks', 'textarea'),
        F('workarounds', 'Workarounds / breakdown points', 'textarea'), F('non_adoption_risk', 'Risk if not adopted', 'textarea'),
        F('reinforcement', 'Policy, technical control, training or monitoring reinforcement', 'textarea'),
        F('indicator', 'Success measure and reporting cadence'), F('maturity_domain', 'Maturity area advanced', 'select', options=[''] + MATURITY_DOMAINS),
        F('next_level_basis', 'What enables the next maturity level', 'textarea'),
        F('status', 'Delivery state', 'select', options=['Proposed', 'Ready', 'In progress', 'Complete', 'Deferred'], default='Proposed'), *COMMON_REVIEW]},
    'maturity': {'title': 'Maturity review', 'singular': 'Maturity assessment', 'fields': [
        F('name', 'Assessment title', required=True), F('domain', 'Maturity area', 'select', True, MATURITY_DOMAINS),
        F('level', 'Assessed level (blank = unassessed)', 'number'), F('scope', 'Assessed systems / controls and date', 'textarea'),
        F('basis', 'Observed basis for this level', 'textarea'), F('next_level', 'Required next-level capability', 'textarea'),
        F('owner_role', 'Accountable review role'), F('control_ids', 'Control basis', 'references', ref='controls'),
        F('risk_ids', 'Findings', 'references', ref='risks'), F('action_ids', 'Recommendations', 'references', ref='actions'), *COMMON_REVIEW]},
    'interviews': {'title': 'Role interviews', 'singular': 'Role interview', 'fields': [
        F('name', 'Interview topic', required=True), F('stakeholder_role', 'Participating role'),
        F('format', 'Format', 'select', options=['Individual', 'Role group', 'Workshop', 'Written response'], default='Individual'),
        F('scheduled_at', 'Scheduled / held time (UTC)', 'datetime'), F('status', 'State', 'select', options=['Planned', 'Held', 'Validated'], default='Planned'),
        F('participants', 'Participant count', 'number', default=1), F('minutes', 'Minutes per participant', 'number', default=30),
        F('system_ids', 'Systems', 'references', ref='systems'), F('topics', 'Usage, dependencies, reconciliation, access and workarounds', 'textarea'),
        F('notes', 'Role perspective / operating notes', 'textarea'), F('validation', 'How this perspective was validated', 'textarea'),
        F('follow_up', 'Follow-up / staff commitments', 'textarea')]},
    'observations': {'title': 'Observations', 'singular': 'Source observation', 'fields': [
        F('name', 'Observation title', required=True), F('source_type', 'Source type', 'select', options=['Interview', 'File', 'Reconciliation', 'Operating review'], default='Interview'),
        F('interview_id', 'Role interview', 'reference', ref='interviews'), F('source_reference', 'Retained file / run / source reference'),
        F('system_ids', 'Systems', 'references', ref='systems'), F('integration_ids', 'Integrations', 'references', ref='integrations'),
        F('perspective', 'What the source reports', 'textarea'), F('conflicts_with', 'Conflicting observations', 'references', ref='observations'),
        F('resolution_state', 'Resolution', 'select', options=['Unreconciled', 'Corroborated', 'Contradicted', 'Resolved'], default='Unreconciled'),
        F('resolution', 'Reviewer resolution and supporting basis', 'textarea'), F('behavior_change', 'Behavior / workflow implications', 'textarea'), *COMMON_REVIEW]},
}


def text(value, limit=16000):
    if not isinstance(value, str) or len(value.encode('utf-8')) > limit or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', value):
        raise Problem('Use plain text within the field size limit.')
    return value


def identity(value):
    value = text(value, 240).strip()
    if not value: raise Problem('A stable record ID is required.')
    return value


def validate(kind, data):
    if kind not in SCHEMAS or not isinstance(data, dict): raise Problem('Unknown record type or invalid record.')
    if set(data) - {f['name'] for f in SCHEMAS[kind]['fields']}: raise Problem('The record includes unsupported fields.')
    clean, errors = {}, {}
    for f in SCHEMAS[kind]['fields']:
        name, typ = f['name'], f['type']; value = data.get(name, f.get('default', [] if typ in ('multi', 'references', 'list') else False if typ == 'bool' else None if typ == 'number' else ''))
        try:
            if typ in ('multi', 'references', 'list'):
                if not isinstance(value, list) or len(value) > 1000 or any(not isinstance(x, str) for x in value): raise Problem('Use a list of text values.')
                value = list(dict.fromkeys(text(x, 500).strip() for x in value if x.strip()))
                if typ == 'multi' and any(x not in f['options'] for x in value): raise Problem('Choose available values.')
            elif typ == 'bool':
                if not isinstance(value, bool): raise Problem('Use true or false.')
            elif typ == 'number':
                if value == '': value = None
                if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100000): raise Problem('Enter a nonnegative number within 100000.')
            else:
                value = text(value, 32000 if typ == 'textarea' else 2000)
                if typ == 'select' and value not in f['options']: raise Problem('Choose an available value.')
                if typ == 'date' and value and date.fromisoformat(value).isoformat() != value: raise Problem('Use YYYY-MM-DD.')
                if typ == 'datetime' and value:
                    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    if not dt.tzinfo: raise Problem('Include a UTC offset, for example 2026-10-11T14:30:00Z.')
            if f['required'] and not value: raise Problem('This field is required.')
            clean[name] = value
        except (Problem, ValueError, TypeError) as exc: errors[name] = str(exc)
    if kind == 'maturity' and clean.get('level') is not None and clean['level'] not in range(1, 6): errors['level'] = 'Use a whole level from 1 to 5, or leave unassessed.'
    if kind == 'actions' and clean.get('top_five_rank') is not None and clean['top_five_rank'] not in range(1, 6): errors['top_five_rank'] = 'Use a whole rank from 1 to 5, or leave blank.'
    if errors: raise Problem('Review the highlighted fields.', fields=errors)
    return clean
