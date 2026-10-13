// MIT. Receive one authored answer through the maintained complete chapter parser.
import { grantProductChapters } from '../../stellar-forge/developer-site/dist/grant-product-sources-core.mjs';

const SCHEMA = 'stellar-forge.stellar-execution-answer-contribution.v1';
function section(text, heading) {
  if (typeof text !== 'string' || text.includes('\r')) throw new Error('Pass the original complete LF application text.');
  const selected = grantProductChapters(text).filter(row => row.heading === heading);
  if (selected.length !== 1) throw new Error('Select one complete original architecture answer.');
  return selected[0].markdown;
}
function receiveOne(text, spec, heading) {
  if (!spec || typeof spec.before !== 'string' || typeof spec.after !== 'string')
    throw new Error('Receive both complete original and authored answer bodies.');
  const current = section(text, heading);
  const before = spec.before.trimEnd(), after = spec.after.trimEnd();
  if (current.trimEnd() === after) return { text, changed: false, state: 'ALREADY_RECEIVED' };
  if (current.trimEnd() !== before) throw new Error('The architecture answer has changed; compose the complete current answer before receiving.');
  if (section(spec.before, heading).trimEnd() !== before || section(spec.after, heading).trimEnd() !== after)
    throw new Error('The contribution must select the complete single architecture answer.');
  const start = text.indexOf(current);
  if (start < 0 || text.indexOf(current, start + 1) !== -1) throw new Error('Original answer position is ambiguous.');
  const trailing = current.slice(current.trimEnd().length);
  const value = text.slice(0, start) + after + trailing + text.slice(start + current.length);
  const originalOther = text.slice(0, start) + text.slice(start + current.length);
  const resultOther = value.slice(0, start) + value.slice(start + after.length + trailing.length);
  if (originalOther !== resultOther) throw new Error('Unselected application text changed.');
  return { text: value, changed: true, state: 'RECEIVED' };
}
/** Pure authoring join. The existing composer still owns all generated outputs. */
export function receiveStellarExecutionAnswers({ full, concise }, contribution) {
  if (contribution?.schema !== SCHEMA ||
      contribution.selected_heading !== '## Defined architecture and operating behavior')
    throw new Error('Use the complete original Stellar execution contribution.');
  const receivedFull = receiveOne(full, contribution.answers?.full, contribution.selected_heading);
  const receivedConcise = receiveOne(concise, contribution.answers?.concise, contribution.selected_heading);
  return { full: receivedFull.text, concise: receivedConcise.text,
    changes: { full: receivedFull.changed, concise: receivedConcise.changed },
    state: receivedFull.changed || receivedConcise.changed ? 'RECEIVED' : 'ALREADY_RECEIVED',
    operation: contribution.operation };
}
