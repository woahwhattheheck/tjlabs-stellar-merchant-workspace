'use strict';
window.GovHubCastor = (() => {
  const rows = value => Array.isArray(value) ? value : [];
  const observed = value => value?.capabilities || value || {};
  const profile = value => value?.current_config || value?.profile?.config || observed(value).configuration || {};
  const isCastor = value => profile(value).source_kind === 'castor';
  const checkpoint = operation => {
    const value = operation.resume_checkpoint || operation.checkpoint || {};
    return value.resume_checkpoint || value.state || value;
  };
  const shown = value => esc(value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  const code = value => '<code>' + shown(value) + '</code>';
  const detail = (label, value) => value == null ? '' : rawDetails(label, value);
  let schemas = [];
  const selectedSchema = () => (state.capabilities?.configuration_schema?.providers || schemas)
    .find(value => value.value === 'castor') || {};
  const runtimeFields = () => (selectedSchema().runtime_fields || []).map(value =>
    typeof value === 'string' ? (selectedSchema().fields || []).find(field => field.name === value) ||
      {name:value,label:value} : value);
  const taskName = value => typeof value === 'string' ? value : value.name;
  const fileRows = files => Array.isArray(files) ? files :
    Object.entries(files || {}).map(([path,value]) => ({path,...value}));

  function inventory(value) {
    if (!value || typeof value !== 'object') return '';
    const project = value.project || {};
    let html = definition([
      ['Environment', code(project.environment_id)], ['Source commit', code(value.head_commit)],
      ['Working source', code(value.working_tree?.sha256 || value.source_fingerprint || value.git_status_sha256)],
      ['Castor version', shown(value.castor_version)], ['Context', shown(project.castor_context)],
      ['Docker context', shown(project.docker_context)], ['Compose project', shown(project.compose_project)],
      ['Observed', esc(date(value.observed_at))]
    ]);
    const selectable = state.view === 'native' && state.user?.role === 'admin';
    html += '<h3>Original task catalogue</h3>' + table(['Task','Description',''], rows(value.tasks).map(task => {
      const name = taskName(task);
      return [code(name), shown(task.description), selectable && name ?
        button('Use task','castor-use-task',{name}) + ' ' + button('Use verification','castor-use-verification',{name}) : ''];
    }));
    html += '<p class="field-help">Choose existing tasks from this application. The native provider reads each selected task’s help using its exact context before running the reviewed instruction.</p>';
    html += '<details><summary>Selected original task definitions</summary>' +
      Object.entries(value.task_definitions || {}).map(([name,definition]) => detail(name,definition)).join('') + '</details>';
    html += table(['Selected release file','Bytes','SHA-256'], fileRows(value.selected_files).map(row =>
      [code(row.path || row.name),shown(row.bytes),code(row.sha256)]));
    html += detail('Original Compose configuration',value.compose_config) +
      detail('Original containers',value.containers) + detail('Original images',value.images) +
      detail('Original Docker engine',value.docker_engine);
    return html;
  }

  function capability(result) {
    if (!isCastor(result)) return '';
    const value = observed(result);
    return '<section class="castor-native"><p>The original application’s Castor tasks, context and deployment remain selected throughout this project.</p>' +
      (value.error || value.message ? '<div class="callout">' + shown(value.error || value.message) + '</div>' : '') +
      inventory(value.native_inventory) +
      definition([['Observed target',code(value.target_fingerprint)]]) + '</section>';
  }

  function result(operation) {
    if (!operation.native_action?.startsWith('castor-')) return '';
    const observation = operation.native_result?.observations || {};
    const verification = observation.verification || {};
    const selected = operation.profile?.config || {};
    let html = definition([
      ['Selected task', code(selected.task_name || 'Source capture')],
      ['Task arguments',shown(selected.task_args_json || '[]')],
      ['Verification task',code(selected.verify_task_name)],
      ['Original request',code(observation.request_sha256 || checkpoint(operation).request_sha256)],
      ['Command exit',shown(observation.task_result?.returncode)],
      ['Verification',verification.passed === true ? 'Passed' : verification.passed === false ? 'Needs attention' : 'Not yet received'],
      ['Original completed at',esc(date(observation.task_result?.completed_at))]
    ]);
    if (rows(verification.checks).length) html += '<h3>Native verification</h3>' +
      table(['Original report field','Expected','Observed','Outcome'],verification.checks.map(check =>
        [code(check.pointer),shown(check.equals),shown(check.observed),check.matched ? 'Matched' : 'Needs attention']));
    html += definition([['Verification report SHA-256',code(verification.report_sha256)]]);
    if (observation.task_outputs) html += detail('Complete declared task outputs',observation.task_outputs);
    if (observation.backup_inputs) html += detail('Original selected backup inputs',observation.backup_inputs);
    if (observation.source) html += detail('Complete source package',observation.source);
    if (observation.before_source) html += detail('Source before the selected task',observation.before_source);
    if (observation.native_inventory) html += '<details><summary>Native environment after the task</summary>' + inventory(observation.native_inventory) + '</details>';
    return '<section class="castor-native">' + html + '</section>';
  }

  async function continuation(operation) {
    if (!operation.native_action?.startsWith('castor-')) return '';
    if (!(selectedSchema().runtime_fields || []).length) {
      const local = await ops('operations.capabilities',{});
      schemas = local.configuration_schema?.providers || [];
    }
    const saved = checkpoint(operation);
    const resume = operation.native_resume || operation.native_result?.native_resume || saved;
    const receipt = operation.castor_command_receipt || {};
    let html = '<section class="castor-native"><h3>Original native command</h3>' +
      definition([['Phase',shown(resume.phase || saved.phase)],
        ['Command',code(resume.command_label || saved.pending_command)],
        ['Original record',code(resume.command_record || saved.command_record)],
        ['Request SHA-256',code(resume.request_sha256 || saved.request_sha256)]]) +
      detail('Original process identity',resume.original_process || saved.original_process);
    if (['dispatching','native_interrupted'].includes(resume.phase || saved.phase) || saved.pending_command) {
      html += '<p>Receive the completed record from this original command before continuing. The provider verifies its command, working directory, process and complete output files.</p>' +
        input('Original completed command receipt','castor_command_receipt',typeof receipt === 'string' ? receipt : receipt.path || '',
          'text',false,'Absolute path to the actual original Session command JSON on the receiving host.');
    }
    const fields = runtimeFields(), bindings = {...operation.profile?.config,...operation.runtime_bindings};
    if (fields.length) html += '<details><summary>Receiving host</summary>' +
      '<p>Use the selected application and its existing executables on this host. The original task, context, Docker context, Compose project and reviewed inputs remain bound to this operation.</p>' +
      '<label class="check"><input type="checkbox" name="castor_use_runtime_bindings">Use these existing local references</label><div class="form-grid">' +
      fields.map(field => input(field.label,'castor_runtime_'+field.name,bindings[field.name] || '',
        'text',false,field.help || '')).join('') + '</div></details>';
    return html + '</section>';
  }

  function continuationPayload(form,operation) {
    if (!operation.native_action?.startsWith('castor-')) return {};
    const value = values(form), result = {};
    if (value.castor_command_receipt?.trim()) result.castor_command_receipt = value.castor_command_receipt.trim();
    if (form.elements.castor_use_runtime_bindings?.checked) {
      result.runtime_bindings = Object.fromEntries(runtimeFields().map(field =>
        [field.name,(value['castor_runtime_'+field.name] || '').trim()]).filter(([,entry]) => entry));
      if (!Object.keys(result.runtime_bindings).length)
        throw Error('Supply the actual receiving host references before continuing.');
    }
    return result;
  }

  function action(name,target) {
    if (!['castor-use-task','castor-use-verification'].includes(name)) throw Error('Unknown Castor selection.');
    const form = main.querySelector('form[data-form="native-profile"]');
    if (!form || form.elements.source_kind.value !== 'castor')
      throw Error('Open the original Castor profile before selecting a task.');
    const catalogue = observed(state.capabilities).native_inventory?.tasks || [];
    const selected = rows(catalogue).find(row => taskName(row) === target.dataset.name);
    if (!selected) throw Error('Refresh the original task catalogue before selecting this task.');
    const field = name === 'castor-use-task' ? 'task_name' : 'verify_task_name';
    if (!form.elements[field]) throw Error('The selected provider schema has no corresponding task field.');
    form.elements[field].value = taskName(selected);
    state.profileDrafts.castor = profileValues(form);
    notice('The existing task is selected. Review its arguments and save the native configuration.');
    form.elements[field].focus();
  }

  function needsRefresh(before,after) {
    if (!after.native_action?.startsWith('castor-')) return false;
    const key = operation => {
      const saved = checkpoint(operation);
      return JSON.stringify([saved.phase,saved.pending_command,saved.command_record,
        saved.original_process,operation.castor_command_receipt,operation.native_result,operation.state]);
    };
    return key(before) !== key(after);
  }
  return Object.freeze({isCastor,capability,result,continuation,continuationPayload,action,needsRefresh});
})();
