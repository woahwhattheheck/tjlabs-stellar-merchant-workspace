'use strict';
window.GovHubSkpr = (() => {
  const native = value => value?.capabilities || value || {};
  const isSkpr = value => (value?.current_config || value?.profile?.config || native(value).configuration || {}).source_kind === 'skpr';
  const original = operation => {
    const raw = operation.resume_checkpoint || operation.checkpoint || {};
    return raw.resume_checkpoint || raw.state || raw;
  };
  const pre = value => '<pre class="skpr-native-output">' + esc(value || '') + '</pre>';
  const componentNames = values => esc((values || []).filter(value => value !== 'n/a').join(', ') || '—');

  function capability(result) {
    if (!isSkpr(result)) return '';
    const observed = native(result), status = observed.native_status || {}, inventory = observed.native_inventory || {};
    if (observed.error) return '<div class="callout">' + esc(observed.error) + '</div>';
    let out = definition([
      ['Cluster', '<code>' + esc(status.cluster) + '</code>'],
      ['Project', esc(status.project)], ['Environment', esc(status.environment)],
      ['Production', status.production ? 'Yes' : 'No'],
      ['Native release', esc(status.version || '—')], ['Native phase', esc(status.phase || '—')],
      ['Databases', componentNames(status.databases)], ['Volumes', componentNames(status.volumes)],
    ]);
    if (status.selected_release) {
      out += '<h3>Selected release</h3>' + table(['Image', 'Native image reference'],
        status.selected_release.images.map(row => [esc(row.name), '<code>' + esc(row.tag) + '</code>']));
    }
    if (status.configuration_sha256) {
      out += definition([
        ['Observed configuration', '<code>' + esc(status.configuration_sha256) + '</code>'],
        ['Selected release identity', '<code>' + esc(status.selected_release_sha256 || 'Choose a release version in the native profile') + '</code>'],
      ]);
      if (state.user?.role === 'admin' && state.view === 'native' && status.selected_release_sha256)
        out += button('Use these deployment selections', 'skpr-use-release');
    }
    out += '<h3>Environment backups</h3>' + table(['Backup', 'Phase', 'Started', 'Databases', 'Volumes', ''],
      (inventory.backups || []).map(row => [
        '<code>' + esc(row.Name) + '</code>', esc(row.Phase), esc(row.StartTime),
        componentNames(row.Databases), componentNames(row.Volumes),
        row.Phase === 'Completed' && state.view === 'native' && state.user?.role === 'admin'
          ? button('Use backup', 'skpr-use-backup', {backup: row.Name}) : '',
      ]));
    out += '<details><summary>Original database and volume backup records</summary>' +
      table(['Kind', 'Parent backup', 'Component', 'Native resource', 'Phase'],
        [...(inventory.mysql_backups || []).map(row => ['Database', row]),
         ...(inventory.volume_backups || []).map(row => ['Volume', row])].map(([kind, row]) => [
          esc(kind), '<code>' + esc(row.BackupID) + '</code>', esc(row.Name),
          esc(row.Database || row.Volume || ''), esc(row.Phase),
        ])) + '</details>';
    out += '<details><summary>Original restore operations</summary>' +
      table(['Restore', 'Original backup', 'Phase', 'Started'], (inventory.restores || []).map(row => [
        esc(row.Name), esc(row.Backup), esc(row.Phase), esc(row.StartTime),
      ])) + '</details>';
    out += '<details><summary>Native environment list</summary>' + pre(inventory.environment_table) + '</details>' +
      '<details><summary>Native release list</summary>' + pre(inventory.release_table) + '</details>';
    return '<div class="skpr-native">' + out + '</div>';
  }

  async function sourceCatalogue(operation, pending) {
    const retained = (operation.retained_artifacts || []).find(row =>
      row.file?.sha256 === pending.snapshot_catalogue_sha256);
    if (!retained) return null;
    const response = await fetch('/api/files/' + enc(retained.file.id), {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) throw Error('The retained native snapshot collection could not be opened.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== retained.file.bytes)
      throw Error('The retained native snapshot collection has a different byte length.');
    if (globalThis.crypto?.subtle) {
      const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (actual !== pending.snapshot_catalogue_sha256)
        throw Error('The retained native snapshot collection has a different source identity.');
    }
    const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (value.environment !== pending.environment || !Array.isArray(value.snapshots))
      throw Error('The native snapshot collection belongs to another original environment.');
    return {snapshots: value.snapshots, file: retained.file};
  }

  async function continuation(operation) {
    if (!operation.native_action?.startsWith('skpr-')) return '';
    const checkpoint = original(operation);
    let out = '';
    const label = checkpoint.pending_skpr_step, step = checkpoint.steps?.[label];
    if (label && step && ['backup', 'restore'].includes(step.kind) && !['completed', 'failed'].includes(step.phase)) {
      out += '<fieldset><legend>Original Skpr request</legend><p>' + esc(label) + ' · ' + esc(step.environment) + '</p>' +
        '<input type="hidden" name="skpr_request_step" value="' + esc(label) + '">' +
        input('Original backup or restore ID', 'skpr_native_request_id', step.native_id || '', 'text', false,
          'Use the ID returned by this original native command. Continuing it retains the same target and backup selection.') +
        '</fieldset>';
    }
    const pending = checkpoint.pending_skpr_download;
    if (pending) {
      let catalogue = null, catalogueError = null;
      try { catalogue = await sourceCatalogue(operation, pending); }
      catch (error) { catalogueError = error.message; }
      out += '<fieldset data-skpr-download><legend>Original backup files</legend><p>Backup <code>' +
        esc(pending.backup_id) + '</code> · ' + esc(pending.environment) + '</p>';
      if (catalogue) {
        const selected = operation.skpr_snapshot_selections?.[pending.label] || pending.selected || [];
        const options = [['', 'Choose the original snapshot'], ...catalogue.snapshots.map(row => [
          row.id, row.id.slice(0, 16) + ' · ' + (row.time || '') + ' · ' +
            (row.hostname || '') + ' · ' + (row.paths || []).join(', ') +
            ((row.tags || []).length ? ' · ' + row.tags.join(', ') : ''),
        ])];
        out += '<input type="hidden" name="skpr_download_step" value="' + esc(pending.label) + '">' +
          input('Find snapshots', 'skpr_snapshot_query', '', 'search', false,
            'Filter by the original snapshot ID, host, date, path or tag.') +
          '<p class="field-help">' + catalogue.snapshots.length + ' original snapshots · <a href="/api/files/' +
          enc(catalogue.file.id) + '">Download the complete native collection</a></p>';
        pending.components.forEach((component, index) => {
          const choice = selected.find(item => item.kind === component.kind && item.component_name === component.component_name);
          out += '<div class="skpr-component" data-skpr-component data-kind="' + esc(component.kind) +
            '" data-component="' + esc(component.component_name) + '" data-backup="' + esc(pending.backup_id) + '">' +
            '<h4>' + esc(component.kind === 'mysql' ? 'Database' : 'Volume') + ' · ' + esc(component.physical_resource || component.component_name) + '</h4>' +
            '<p class="field-help">Native component <code>' + esc(component.component_name) + '</code></p>' +
            select('Original snapshot', 'skpr_snapshot_' + index, options, choice?.snapshot_id || '') + '</div>';
        });
        out += '<p>Choose the snapshot belonging to each original component. The same operation downloads the complete archive and retains every member with the project.</p>';
      } else {
        out += '<p>' + esc(catalogueError || 'The native worker is registering the original snapshot collection. Refresh this operation to open its retained selections.') + '</p>';
      }
      out += '</fieldset>';
    }
    const paths = {...operation.profile?.config, ...operation.runtime_bindings};
    out += '<details><summary>Receiving machine</summary><p>Select the existing native tools and original Git project on this machine.</p>' +
      '<label class="check"><input type="checkbox" name="skpr_use_runtime_bindings">Use these receiving paths</label>' +
      input('Skpr executable', 'skpr_runtime_skpr_path', paths.skpr_path || '') +
      input('Git executable', 'skpr_runtime_git_path', paths.git_path || '') +
      input('POSIX env executable', 'skpr_runtime_env_path', paths.env_path || '') +
      input('Original project directory', 'skpr_runtime_site_root', paths.site_root || '') +
      '<p class="field-help">The saved operation continues against its original cluster, project, environment and source.</p></details>';
    return out;
  }

  function continuationPayload(form, operation) {
    if (!operation.native_action?.startsWith('skpr-')) return {};
    const result = {}, v = values(form);
    if (form.elements.skpr_use_runtime_bindings?.checked) {
      const paths = Object.fromEntries(['skpr_path', 'git_path', 'env_path', 'site_root']
        .map(key => [key, (v['skpr_runtime_' + key] || '').trim()]));
      if (!paths.skpr_path || !paths.site_root)
        throw Error('Choose the receiving machine’s native Skpr executable and original project directory.');
      result.runtime_bindings = paths;
    }
    if (v.skpr_native_request_id?.trim()) {
      result.skpr_native_request_id = v.skpr_native_request_id.trim();
      result.skpr_request_step = v.skpr_request_step;
    }
    if (v.skpr_download_step) {
      result.skpr_download_step = v.skpr_download_step;
      result.skpr_snapshot_choices = [...form.querySelectorAll('[data-skpr-component]')].map(element => {
        const snapshot = element.querySelector('select').value;
        if (!/^[0-9a-f]{64}$/.test(snapshot))
          throw Error('Select each component’s full original snapshot ID.');
        return {kind: element.dataset.kind, component_name: element.dataset.component,
          backup_id: element.dataset.backup, snapshot_id: snapshot};
      });
    }
    return result;
  }

  function action(name, target) {
    const form = main.querySelector('form[data-form="native-profile"]');
    if (!form || form.elements.source_kind.value !== 'skpr')
      throw Error('Open this environment’s Skpr profile before changing its native selections.');
    const c = native(state.capabilities), observed = c.native_status || {};
    if (name === 'skpr-use-backup') {
      if (!(c.native_inventory?.backups || []).some(row => row.Name === target.dataset.backup && row.Phase === 'Completed'))
        throw Error('Refresh the original native backup collection.');
      form.elements.backup_id.value = target.dataset.backup;
      form.elements.source_environment.value = observed.source_environment || observed.environment;
      notice('The original backup is selected. Save the native configuration to retain it.');
    } else if (name === 'skpr-use-release') {
      if (!observed.selected_release?.version || !observed.selected_release_sha256 || !observed.configuration_sha256)
        throw Error('Observe the selected original release and configuration first.');
      form.elements.release_version.value = observed.selected_release.version;
      form.elements.expected_release_sha256.value = observed.selected_release_sha256;
      form.elements.expected_configuration_sha256.value = observed.configuration_sha256;
      notice('The observed release and configuration are selected. Save this native profile to retain them.');
    }
  }

  document.addEventListener('input', event => {
    if (event.target.name !== 'skpr_snapshot_query') return;
    const fieldset = event.target.closest('[data-skpr-download]');
    if (!fieldset) return;
    const query = event.target.value.trim().toLowerCase();
    for (const option of fieldset.querySelectorAll('[data-skpr-component] select option')) {
      option.hidden = Boolean(option.value && !option.selected && query && !option.textContent.toLowerCase().includes(query));
    }
  });


  function needsRefresh(before, after) {
    if (!after.native_action?.startsWith('skpr-')) return false;
    const key = operation => {
      const checkpoint = original(operation), pending = checkpoint.pending_skpr_download;
      const step = checkpoint.steps?.[checkpoint.pending_skpr_step];
      return JSON.stringify([
        pending?.label, pending?.snapshot_catalogue_sha256,
        checkpoint.pending_skpr_step, step?.native_id,
        ['COMPLETE', 'FAILED', 'CANCELLED', 'PAUSED'].includes(operation.state) ? operation.state : null,
      ]);
    };
    return key(before) !== key(after);
  }

  return Object.freeze({isSkpr, capability, continuation, continuationPayload, action, needsRefresh});
})();
