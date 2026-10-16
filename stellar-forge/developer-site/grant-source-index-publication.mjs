// MIT. Complete public projection for structured grant source metadata.
import { projectPublicGrantMarkdown, projectPublicGrantSourceIndex } from './grant-publication-source.mjs';

function projectRemainingStrings(value) {
  if (Array.isArray(value)) return value.map(projectRemainingStrings);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, projectRemainingStrings(item)]),
  );
  return typeof value === 'string' ? projectPublicGrantMarkdown(value) : value;
}

/**
 * Drop exact private destinations, then remove embedded private navigation from
 * the narrative strings that remain in the public source-index JSON.
 */
export function projectCompletePublicGrantSourceIndex(value) {
  return projectRemainingStrings(projectPublicGrantSourceIndex(value));
}
