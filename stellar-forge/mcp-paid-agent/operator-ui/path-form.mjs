// SPDX-License-Identifier: MIT
// Shared browser fields for the original quote and native request desks.
import { normalizeHttpPathInput, prepareHttpPath } from './http-path.mjs';

export const httpRecord = description => ({resource:description.resource,
  input:description.bazaar?.info?.input, bazaar:description.bazaar});

/** Fields begin empty; a concrete source URL remains an explicit fixed binding. */
export function createHttpPathFields(description, {node, empty}) {
  const declaration = description.preview.input.path, failure = description.preview.input.pathInputError;
  const fields = new Map(), listeners = new Set();
  const element = node('section', {className:'content-block', 'aria-label':'HTTP path parameters'});
  const preview = node('p', {className:'field-note mono'});
  element.append(node('h4', {text:'Path parameters'}));
  function read() {
    if (failure) throw Object.assign(new Error(failure.message), failure);
    return normalizeHttpPathInput(Object.fromEntries([...fields].filter(([, input]) => input.value !== '')
      .map(([name, input]) => [name, input.value])));
  }
  function concrete() {
    return prepareHttpPath(httpRecord(description), read());
  }
  function refresh() {
    try {
      const url = concrete();
      preview.textContent = 'Request path: ' + url.origin + url.pathname;
      preview.classList.remove('error');
    } catch (error) {
      preview.textContent = error.message;
      preview.classList.toggle('error', error.code !== 'PATH_INPUT_REQUIRED');
    }
    for (const listener of listeners) listener();
  }
  if (failure) element.append(node('p', {className:'notice error', text:failure.message}));
  else if (!declaration?.advertisedKeys.length) element.append(empty('This resource uses its advertised fixed path.'));
  else {
    element.append(node('p', {className:'mono', text:declaration.routeTemplate}),
      node('p', {className:'field-note', text:'Enter raw values for unresolved parameters. Each becomes one encoded URL segment. Values already present in the advertised URL remain fixed.'}));
    for (const parameter of declaration.parameters) {
      const input = node('input', {type:'text', autocomplete:'off', spellcheck:'false',
        required:parameter.required, maxlength:declaration.maxValueLength,
        'aria-label':'Path parameter ' + parameter.name});
      const hasFixed = Object.hasOwn(declaration.fixedValues, parameter.name);
      if (hasFixed) {
        input.value = declaration.fixedValues[parameter.name];
        input.readOnly = true;
      } else fields.set(parameter.name, input);
      element.append(node('label', {text:parameter.name + (hasFixed ? ' · fixed URL value' : ' · required')}, [input]));
      if (parameter.title || parameter.description) element.append(node('p', {className:'field-note',
        text:[parameter.title, parameter.description].filter(Boolean).join(' — ')}));
      if (hasFixed) element.append(node('p', {className:'field-note mono',
        text:'Current URL value: ' + declaration.fixedValues[parameter.name]}));
      if (!hasFixed) input.addEventListener('input', refresh);
    }
  }
  element.append(preview); refresh();
  return {element, read, concrete, onChange(listener) { listeners.add(listener); }};
}
