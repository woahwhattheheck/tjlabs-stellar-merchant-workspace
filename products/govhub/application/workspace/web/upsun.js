'use strict';
window.GovHubUpsun = (() => {
  const observed = value => value?.capabilities || value || {};
  const profile = value => value?.current_config || value?.profile?.config || observed(value).configuration || {};
  const isUpsun = value => profile(value).source_kind === 'upsun';
  const checkpoint = operation => {
    const value = operation.resume_checkpoint || operation.checkpoint || {};
    return value.resume_checkpoint || value.state || value;
  };
  const rows = value => Array.isArray(value) ? value : [];
  const code = value => '<code>' + esc(value ?? '—') + '</code>';
  const nativeValue = value => value === null || value === undefined ? '—' :
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  const shown = value => esc(nativeValue(value));
  let schemas = [];
  const selectedSchema = () => (state.capabilities?.configuration_schema?.providers || schemas)
    .find(value => value.value === 'upsun') || {};
  const time = value => typeof value === 'number' ? date(new Date(value * 1000).toISOString()) : date(value);
  const detail = (name, value) => value == null ? '' : rawDetails(name, value);

  function capability(result) {
    if (!isUpsun(result)) return '';
    const value = observed(result), inventory = value.native_inventory || {};
    const project = inventory.project || {}, environment = inventory.environment || {};
    const deployment = inventory.current_deployment || {};
    let html = '<p class="field-help">Current Upsun API. The selected project and environment are kept with every native operation.</p>';
    if (value.error || value.message) html += '<div class="callout">' + esc(value.error || value.message) + '</div>';
    html += definition([
      ['Project', code(project.id || profile(result).project_id)],
      ['Environment', code(environment.id || profile(result).environment_id)],
      ['Title', shown(environment.title)], ['Type', shown(environment.type)],
      ['Status', shown(environment.status)], ['Parent', code(environment.parent)],
      ['Head commit', code(environment.head_commit)],
      ['Deployment', code(deployment.id)],
      ['Observed target', code(value.target_fingerprint)],
    ]);
    const selectable = state.view === 'native' && state.user?.role === 'admin';
    html += '<h3>Native backups</h3><p>These snapshots can be restored by Upsun. The complete independent source export is retained separately with the capture operation.</p>';
    html += table(['Backup', 'Created', 'Status', 'Restorable', 'Commit', ''], rows(inventory.backups).map(row => [
      code(row.id), esc(date(row.created_at)), shown(row.status), shown(row.restorable),
      code(row.commit_id),
      selectable && row.id && row.restorable === true
        ? button('Use this backup', 'upsun-use-backup', {id: row.id}) : '',
    ]));
    html += '<details><summary>Current environments (' + rows(inventory.environments).length + ')</summary>' +
      table(['Environment', 'Title', 'Type', 'Status', 'Parent', 'Head commit'],
        rows(inventory.environments).map(row => [code(row.id), shown(row.title), shown(row.type),
          shown(row.status), code(row.parent), code(row.head_commit)])) + '</details>';
    html += '<details><summary>Native activities (' + rows(inventory.activities).length + ')</summary>' +
      table(['Activity', 'Type', 'State', 'Result', 'Created'], rows(inventory.activities).map(row => [
        code(row.id), shown(row.type), shown(row.state), shown(row.result), esc(date(row.created_at)),
      ])) + '</details>';
    html += detail('Complete current deployment', inventory.current_deployment) +
      detail('Original deployment collection', inventory.deployments) +
      detail('Original selected environment', inventory.environment) +
      detail('Original project', inventory.project);
    if (value.native_status) html += detail('Native source summary', value.native_status);
    return '<section class="upsun-native">' + html + '</section>';
  }

  function runtimeFields(operation) {
    const schema = selectedSchema();
    const declared = schema.runtime_fields || [];
    const definitions = schema.fields || [];
    return declared.map(name => typeof name === 'string'
      ? definitions.find(field => field.name === name) || {name, label: name}
      : name);
  }

  async function continuation(operation) {
    if (!operation.native_action?.startsWith('upsun-')) return '';
    if (!(selectedSchema().runtime_fields || []).length) {
      const local = await ops('operations.capabilities', {});
      schemas = local.configuration_schema?.providers || [];
    }
    const saved = checkpoint(operation), selected = operation.upsun_activity_association || {};
    let html = '<section class="upsun-native"><h3>Original Upsun activity</h3>';
    if (rows(saved.activity_ids).length)
      html += '<p>Activities retained for this original write</p>' +
        '<ul>' + saved.activity_ids.map(id => '<li>' + code(id) + '</li>').join('') + '</ul>';
    if (saved.native_poll || saved.activity || selected.id)
      html += detail('Retained activity', saved.native_poll || saved.activity || selected);
    if (saved.activities) html += detail('Original activity outcomes', saved.activities);
    const pollAt = operation.next_poll_at ? Date.parse(operation.next_poll_at) / 1000 : 0;
    const deadline = Math.max(Number(saved.provider_not_before || 0),
      Number(saved.provider_request_not_before || 0), Number(saved.not_before || 0),
      Number.isFinite(pollAt) ? pollAt : 0);
    if (deadline) html += '<p>Provider permits the next attempt no earlier than <strong>' +
      esc(time(deadline)) + '</strong>. The native worker enforces the retained deadline.</p>';
    if (['dispatching', 'native_interrupted'].includes(saved.phase)) {
      const candidates = rows(saved.candidate_activities);
      html += '<p>The original write has no reconciled result. Select its actual provider activity; this continues the saved instruction.</p>' +
        input('Original activity ID', 'upsun_activity_id', selected.id || '', 'text', false,
          'The native provider checks this activity against the retained request, project, environment and action.') +
        area('Complete original activity IDs, when the write returned several', 'upsun_activity_ids_json',
          selected.ids?.length > 1 ? JSON.stringify(selected.ids, null, 2) : '', false,
          'Optional JSON array of every actual activity in this original write. Preserve the complete staged/deployed cohort.');
      if (candidates.length) html += table(['Candidate activity', 'Type', 'Created', 'State', 'Result'],
        candidates.map(row => [code(row.id), shown(row.type), esc(date(row.created_at)), shown(row.state), shown(row.result)]));
      html += detail('Original request identity', {
        request_sha256: saved.request_sha256, requested_at: saved.requested_at,
        instruction: saved.instruction || saved.intent,
      });
    }
    const fields = runtimeFields(operation), bindings = {...operation.profile?.config, ...operation.runtime_bindings};
    if (fields.length) {
      html += '<details><summary>Receiving host</summary><p>Use the existing native tools, source checkout and credential references on this machine. The provider project, environment and reviewed request stay unchanged.</p>' +
        '<label class="check"><input type="checkbox" name="upsun_use_runtime_bindings">Use these local references for this continuation</label><div class="form-grid">' +
        fields.map(field => input(field.label, 'upsun_runtime_' + field.name, bindings[field.name] || '',
          'text', false, field.help || '')).join('') + '</div></details>';
    }
    return html + '</section>';
  }

  function continuationPayload(form, operation) {
    if (!operation.native_action?.startsWith('upsun-')) return {};
    const result = {}, value = values(form);
    if (value.upsun_activity_id?.trim()) result.upsun_activity_id = value.upsun_activity_id.trim();
    if (value.upsun_activity_ids_json?.trim()) {
      const ids = JSON.parse(value.upsun_activity_ids_json);
      if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim()))
        throw Error('Supply the complete original activity IDs as a JSON string array.');
      result.upsun_activity_ids_json = value.upsun_activity_ids_json.trim();
    }
    if (form.elements.upsun_use_runtime_bindings?.checked) {
      const fields = runtimeFields(operation);
      const bindings = Object.fromEntries(fields.map(field => [field.name,
        (value['upsun_runtime_' + field.name] || '').trim()]).filter(([, entry]) => entry));
      if (!Object.keys(bindings).length)
        throw Error('Supply the existing receiving host references before continuing.');
      result.runtime_bindings = bindings;
    }
    return result;
  }

  function action(name, target) {
    if (name !== 'upsun-use-backup') throw Error('Unknown Upsun selection.');
    const form = main.querySelector('form[data-form="native-profile"]');
    if (!form || form.elements.source_kind.value !== 'upsun')
      throw Error('Open the selected Upsun environment profile before choosing a backup.');
    const inventory = observed(state.capabilities).native_inventory || {};
    const selected = rows(inventory.backups).find(row => row.id === target.dataset.id && row.restorable === true);
    if (!selected || !form.elements.backup_id)
      throw Error('Refresh the original native backup collection before selecting this snapshot.');
    form.elements.backup_id.value = selected.id;
    state.profileDrafts.upsun = profileValues(form);
    notice('The actual backup is selected. Save the native configuration to retain this choice.');
    form.elements.backup_id.focus();
  }

  function needsRefresh(before, after) {
    if (!after.native_action?.startsWith('upsun-')) return false;
    const key = operation => {
      const saved = checkpoint(operation);
      return JSON.stringify([saved.phase, saved.native_poll, saved.activity, saved.activity_ids, saved.activities,
        saved.candidate_activities, saved.request_sha256, operation.upsun_activity_association,
        ['COMPLETE', 'FAILED', 'CANCELLED', 'PAUSED'].includes(operation.state) ? operation.state : null]);
    };
    return key(before) !== key(after);
  }

  return Object.freeze({isUpsun, capability, continuation, continuationPayload, action, needsRefresh});
})();
