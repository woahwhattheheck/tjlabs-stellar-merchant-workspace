// MIT. Public save-outcome fields carried by the original merchant MCP transport.
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Keep the original operation identity recoverable when a save reply is uncertain. */
export function merchantOperationError(error) {
  const recovery = {};
  for (const flag of ['outcomeUnknown', 'reopenRequired']) {
    if (typeof error?.[flag] === 'boolean') recovery[flag] = error[flag];
  }
  if (plain(error?.commitUncertainty)) {
    const selected = {};
    for (const key of ['at', 'action', 'causeCode']) {
      if (typeof error.commitUncertainty[key] === 'string') selected[key] = error.commitUncertainty[key];
    }
    if (Number.isSafeInteger(error.commitUncertainty.revision)) selected.revision = error.commitUncertainty.revision;
    recovery.commitUncertainty = selected;
  }
  const result = {...recovery};
  if (Object.keys(recovery).length) result.details = {...recovery};
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) result.status = error.status;
  return result;
}
