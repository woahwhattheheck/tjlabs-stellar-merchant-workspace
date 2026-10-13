import { currentGrantCompanionLinks } from './grant-companion.mjs';
// MIT. Carry accepted customer sections into the maintained SCF reviewer edition.
import { receiveGrantA2ASources } from './grant-a2a.mjs';
import { selectGrantProductChapters } from './grant-product-sources.mjs';
const FEDERAL = '## Federal awards: complete funding research, workshares and receiving';
const WEBHOOK = '## Webhook customer adoption: complete event tasks and operator handover';
const OPENFN = '## OpenFn: paid workflow commissioning and complete receiving';
const REFERRAL = '## Referral implementation: source changes, returned outcomes and complete receiving';
const RISINGWAVE = '## Recurring subscription delivery and streaming-data commissioning';
const OPENLINEAGE = '## OpenLineage service operations and complete customer receiving';
const A2A = '## A2A analytical services: complete agent work, merchant delivery and customer receiving';
const CUSTOMER_WORKSHARES = '## External buyer onboarding and study-operations commissioning';
const AIR_QUALITY = '## Air-quality reporting and complete customer receiving';
const MUNICIPAL = '## Municipal source operations, service reporting and reviewed GIS delivery';
const IATI = '## IATI publishing, programme finance and complete customer receiving';
// The original IATI case supplies an ordinary editable customer procedure.
// A complete manuscript-owned edition takes precedence over this maintained introduction.
const IATI_OPERATING_HEADING = '### Customer operating procedures and recurring analyst handover';
const IATI_OPERATING_CHAPTER = "### Customer operating procedures and recurring analyst handover\n\nA reviewed case becomes useful recurring work when another analyst can operate it. The [customer operating procedure](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/OPERATING_PROCEDURES.md) turns one exact saved document-evidence edition into an editable procedure in the existing Operating Plans application. The customer receives the selected case, ordered work, responsible people, original commands, saved changes and a readable handover together.\n\nThe commissioning workorder names the publisher, customer, reporting period, operating owner, reviewer and receiving destination. The operator selects the original saved document-evidence ID and revision. The procedure retains the whole selected organisation record, preceding evidence revisions, every selected document row and observation, comparisons and the current correction draft. Its [native source reader](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/operating_source.py) reads that edition under the existing workspace lock.\n\n#### Operate the complete customer task\n\n|Customer step|Original application and receiving result|\n|---|---|\n|Select the saved edition|In IATI Document evidence, open the exact case and revision. Publisher handoff provides Download operating source with the complete selected case.|\n|Create the operating procedure|Import that JSON through Command finder → Operating plans. The application creates the ordinary editable plan and downloads the complete IATI procedure package.|\n|Assign the work|Enter the customer, owner, reporting period and receiving destination; edit the ordered work, commands and customer-specific instructions. Save those changes as a new plan revision.|\n|Resolve the selected review work|Use the original IATI controls to acquire, review, compare or correct the published material. Record the actual outcome against the corresponding task. Named review, acquisition and source correction retain their own case history.|\n|Prepare the handover|Download the complete plan, Markdown or printable HTML. Update IATI package joins the currently saved plan history to its original complete source and catalog.|\n|Receive and continue|Import the full procedure package in the receiving Operating Plans application and receive the original document-evidence ZIP through IATI. Reopen the case, retain the receiving analyst's edits and operate the next agreed reporting edition.|\n\nThe [procedure model](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/operating_procedure.mjs) uses the maintained Operating Plans format, revision receiver and renderer. Each registered step carries the selected toolkit command, source declarations and runtime groups. The operator can inspect and edit the complete procedure using the same controls as other customer operating plans.\n\nA usable review decision enters as completed work; an explicit exclusion enters as skipped work. Deferred assessment and needed source correction remain visible tasks. Completing a plan step records the operator's work on that procedure. The acquisition response, original document and publisher correction remain in their corresponding native IATI records. A later observation or source edition creates its own explicit case revision and can supply the next procedure.\n\n#### Complete files for the next operator\n\n|File|Purpose|\n|---|---|\n|Complete IATI procedure JSON|Carries the original source edition, actual selected toolkit catalog and full saved operating-plan history. It can be received and edited on another browser or machine.|\n|Operating-plan JSON|Provides the complete ordinary plan for existing Operating Plans editing and revision receiving.|\n|Markdown and HTML handover|Give the customer the ordered work, source context, saved decisions and operating instructions in readable files.|\n|Original document-evidence ZIP|Carries the native workspace, retained document bodies and source assets, complete requests, observations, decisions, comparisons and correction material.|\n\nThese files support different parts of the same receiving task. The plan package identifies its source edition and describes the work; the original native ZIP carries the underlying workspace and acquired bytes. The workorder specifies both where the receiving analyst needs to repeat the review.\n\nThe [installed IATI selection](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/distribution/selections/IATI_OPERATOR.md) supplies Command finder, Operating Plans and the document-evidence application together. The [complete procedure CLI](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence_operating_cli.mjs) exposes capture, create, show and receive for the same saved source. Its normal customer operation is `starforge iati-document-procedure`; the guide gives the complete arguments for the original connection, case revision, customer fields and output files. The typed SDK exposes the same source reader and pure procedure creator, receiver and renderer. The customer can therefore use the browser during review and retain the complete command-based operation for recurring work.\n\n#### Commercial output and funded adaptation\n\nA partner can commission a publisher-period review with an operating procedure, corrected source where agreed, readable report and complete analyst receiving. The workorder defines the actual publication selection, review responsibilities, useful files and acceptance owner. It also separates installation and care fees from the merchant's advertised paid resource and the buyer's approved aggregate task cost. A saved procedure step is an operating instruction; the original purchase and acquired resource retain their financial identities.\n\nThe implemented procedure is part of the pre-award product. Within the existing six grant packages, T1 binds the selected customer's real source, review roles, approved output and receiving application. T2 connects that complete task to the original purchase and delivery operation, facilitator deployments and installed recovery. T3 carries the recurring customer workflow, complete procedure and original workspace into production receiving, restoration and maintainer handover. Each remaining adaptation belongs to its existing package or a separately commissioned workorder.\n\nCustomer acceptance means opening the complete selected source, saving a meaningful change in the procedure, performing the corresponding native task, explaining its actual review outcome and continuing the full case on the receiving installation. The operator can then measure active effort, corrections and time to accepted output over successive reporting editions, using the existing customer-value and recurring-use measures.\n";
const IATI_OPERATING_APPLICATION = [{"heading":"## Customer problem, need and adoption","prefix":"**IATI customer operating procedure.**","text":"**IATI customer operating procedure.** A recurring publisher review also needs instructions another analyst can use. The installed IATI workflow turns an exact saved document-evidence edition into an editable Operating Plans procedure with the customer, owner, reporting period, ordered work and receiving destination. Its complete package carries the original case and saved plan history into the next analyst's application."},{"heading":"## Working product and demonstrated results","prefix":"**Implemented IATI procedure and handover.**","text":"**Implemented IATI procedure and handover.** The merged [customer operating procedure](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/0110a7fde307112abee5be63a06291855aa72599/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/OPERATING_PROCEDURES.md) joins the original document case to editable Operating Plans, the installed CLI and typed SDK. The customer can retain the selected source, catalog, ordered work and complete plan revisions, then export Markdown/HTML and receive the full package. The original IATI ZIP supplies the native workspace and acquired document bytes."},{"heading":"## Three funded tranches and six priced deliverables","prefix":"**IATI procedure in the funded installation.**","text":"**IATI procedure in the funded installation.** The merged operating-procedure component supplies the starting product. T1 binds customer sources, review roles and receiving instructions; T2 joins the complete task to its original purchase, deployed delivery and recovery; T3 delivers recurring production operation and complete maintainer receiving. These adaptations use the existing packages and allocation."}];
function receiveIatiOperatingCompanion(value) {
  const current = section(value, IATI);
  if (!current || current.text.includes(IATI_OPERATING_HEADING)) return value;
  const anchor = '### Recurring customer work and the purchased output';
  const at = current.text.indexOf(anchor);
  const text = at < 0 ? clean(current.text) + '\n' + IATI_OPERATING_CHAPTER :
    current.text.slice(0, at) + IATI_OPERATING_CHAPTER + '\n' + current.text.slice(at);
  return installSection(value, IATI, text);
}
function receiveIatiOperatingApplication(value) {
  // A manuscript owner can condense the three introductory joins into its
  // own product narrative. Preserve that edition when it already names the
  // installed application and links the complete operating procedure.
  const authored = section(value, '## Working product and demonstrated results');
  const hasIntroductions = IATI_OPERATING_APPLICATION.some(item => paragraph(value, item.prefix));
  if (!hasIntroductions && authored?.text.includes('Operating Plans') &&
      /\/iati\/document_evidence\/OPERATING_PROCEDURES\.md(?:[?#][^)]*)?\)/.test(authored.text)) return value;
  for (const item of IATI_OPERATING_APPLICATION) {
    if (paragraph(value, item.prefix)) continue;
    const current = section(value, item.heading);
    if (current) value = installSection(value, item.heading, clean(current.text) + '\n' + item.text + '\n');
  }
  return value;
}

const INSTITUTIONAL_REPOSITORY = '## Institutional repository services and complete scholarly receiving';
const AIRBYTE = '## Custom API commissioning and complete dataset receiving';
const JOURNEY = '# 9A. Current demonstration and operator journey';
const INSTALLATION_USE = '## Product selection, installation and recurring buyer work';
const HAYSTACK = "## Haystack building models: reviewed point lists, validation and contractor handover";
const BILLING = '## Merchant settlement, customer billing and accountant receiving';
const DEDICATED = new Set(['## Recurring economic-report installation', '## Coastal model-input installation', '## Datasette editions and customer analysis']);
const OPENFN_PARAGRAPHS = [
  '**Paid workflow commissioning and complete receiving — OpenFn.**',
  '**OpenFn implementation opportunity.**',
];
const clean = value => String(value).replaceAll('\r\n', '\n').trim() + '\n';
const quoted = value => value.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
function need(value, message) { if (!value) throw new Error(message); }

// Commons repository visibility was received from the original GitHub repository.
// Its source identities remain in the canonical manuscript and source register;
// the public reader opens the complete accompanying workflow for these cases.
const PRIVATE_SOURCE_REPOSITORIES = new Set(['woahwhattheheck/commons']);
const PRIVATE_SOURCE_WORKFLOWS = [
  [/\/opportunities\/discoverygarden_msu2026112_\d{8}\/tind-operator(?:\/|$)/, 'institutional-repository-services-and-complete-scholarly-receiving'],
  [/\/opportunities\/airbyte-connector-commissioning-\d{8}(?:\/|$)/, 'custom-api-commissioning-and-complete-dataset-receiving'],
  [/\/opportunities\/openfn-commissioning-\d{8}(?:\/|$)/, 'openfn-paid-workflow-commissioning-and-complete-receiving'],
  [/\/case_assets\/elimu-gravity-referral-implementation-\d{8}-450e(?:\/|$)/, 'referral-implementation-source-changes-returned-outcomes-and-complete-receiving'],
  [/\/case_assets\/risingwave-subscription-delivery-pilot-\d{8}(?:\/|$)/, 'recurring-subscription-delivery-and-streaming-data-commissioning'],
  [/\/opportunities\/medstar_shadow_study_2026\/workspace(?:\/|$)/, 'external-buyer-onboarding-and-study-operations-commissioning'],
  [/\/operations\/scf-a2a-native-analysis-0c7a-\d{8}(?:\/|$)/, 'a2a-analytical-services-complete-agent-work-merchant-delivery-and-customer-receiving'],
  [/\/pull\/35713(?:[/?#]|$)/, 'environmental-data-installations'],
  [/\/pull\/35612(?:[/?#]|$)/, 'portable-map-releases-and-customer-commissioning'],
  [/\/pull\/35577(?:[/?#]|$)/, 'wholesale-order-commissioning-and-complete-erp-receiving'],
];
function privateGitSource(reference) {
  if (typeof reference !== 'string') return false;
  const match = reference.match(/^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)(?:[/?#]|$)/i);
  return Boolean(match && PRIVATE_SOURCE_REPOSITORIES.has(match[1].toLowerCase()));
}
function authenticatedGrantSource(reference) {
  return typeof reference === 'string' && (privateGitSource(reference)
    || /^https:\/\/(?:tokenjunkielabs\.slack\.com\/|mail\.google\.com\/mail\/|chatgpt\.com\/api\/library\/files\/)/i.test(reference));
}

/** Retain useful artifact labels without publishing owner-authenticated destinations. */
export function projectGrantHtml(html) {
  return html.replace(/<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, before, quote, url, after, label) => authenticatedGrantSource(url) ? label : whole);
}

function workflowForPrivateSource(reference) {
  if (!privateGitSource(reference)) return null;
  const pathname = reference.slice('https://github.com'.length).split(/[?#]/, 1)[0];
  const match = PRIVATE_SOURCE_WORKFLOWS.find(([pattern]) => pattern.test(pathname));
  return match ? '../grant-companion.html#' + match[1] : '../grant-companion.html';
}
function projectPrivateSourceLinks(markdown, { application = false } = {}) {
  return markdown.replace(/\[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)/gi, (whole, label, url) => {
    if (!privateGitSource(url)) return whole;
    // The application's first study example should open its complete public
    // workflow, rather than a private implementation file.
    if (application && /\/opportunities\/medstar_shadow_study_2026\/workspace\//.test(url.slice('https://github.com'.length).split(/[?#]/, 1)[0])
        && label === 'implemented workspace and integration handover') {
      return '[study-operations workflow and receiving](./product-and-finance.md#external-buyer-onboarding-and-study-operations-commissioning)';
    }
    return label;
  });
}

/** Keep public source links and the substantive labels of private correspondence. */
export function projectGrantMarkdown(markdown, { application = false } = {}) {
  let value = clean(markdown)
    .replace(/\s*·?\s*\[(Original commercial delivery|Original offer and contact operation|Complete commercial and engineering brief|Completed operation)\]\(https:\/\/tokenjunkielabs\.slack\.com\/[^)\s]+\)\.?/g, '')
    .replace(/\[([^\]]+)\]\(https:\/\/(?:tokenjunkielabs\.slack\.com\/|mail\.google\.com\/mail\/)[^)\s]+\)/g, '$1')
    .replace(/ \. /g, '. ').replace(/\.\s*·\s*\[/g, '. [')
    .replaceAll('enterprise@openfn.org', 'OpenFn’s published enterprise mailbox')
    .replaceAll('info@freeform.ca', 'Freeform’s published contact mailbox')
    .replaceAll('tokenjunkielabs@gmail.com', 'TokenJunkieLabs’ delivery mailbox')
    .replace(/\[([^\]]+)\]\((https:\/\/chatgpt\.com\/api\/library\/files\/[^)\s]+)\)/gi, '$1');
  if (application) {
  // Canvas retains the chapter label when it removes a relative Markdown link.
  // Give both historical and current authoring text the same installed chapter link.
  const connectedSystemsScope = "The [Connected Systems observations chapter](#connected-systems-observations-customer-commissioning-and-repeat-use) retains the full eight-phase scope and acceptance outputs; the grant's base request and payment sensitivities are unchanged.";
  value = value.replaceAll("§9A retains the full eight-phase scope and acceptance outputs; the grant's base request and payment sensitivities are unchanged.", connectedSystemsScope)
    .replaceAll("The Connected Systems observations chapter retains the full eight-phase scope and acceptance outputs; the grant's base request and payment sensitivities are unchanged.", connectedSystemsScope);
    value = receiveIatiOperatingApplication(value);
    value = currentGrantCompanionLinks(value);
    // Canvas authoring uses an absolute public link; installed readers keep the sibling file.
    value = value.replace(/\]\(https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/main\/stellar-forge\/developer-site\/dist\/grant-data\/(product-and-finance\.md)(?=[#)])/g, '](./$1');
    value = value.replace(/\n\*\*(?:Application sources|Source basis):\*\*[\s\S]*$/, '\n\n**Sources and supporting detail:** The [product and finance companion](./product-and-finance.md) retains the complete installation workflows, customer implementation context, funded packages and resource study. The [source index](./source-index.json) identifies the selected product sources and application edition. Issuer references are the [SCF #46 round](https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg), [Build submission criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/submission-criteria), [budget and deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) and [Official Rules](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions).\n')
      .replace(/§9A connects this task to the existing six funded packages\./g,
        'The [complete customer workflow](./product-and-finance.md#environmental-provider-intake-complete-source-editions-commissioning-and-receiving) connects this task to the existing six funded packages.')
      .replace(/operating sequence and six-package linkage are included in §9A\./g,
        'operating sequence and six-package linkage are included in the [product and financing companion](./product-and-finance.md#federal-awards-complete-funding-research-workshares-and-receiving).')
      .replace('The complete A2A customer chapter defines the service operator',
        'The [complete A2A customer chapter](./product-and-finance.md#a2a-analytical-services-complete-agent-work-merchant-delivery-and-customer-receiving) defines the service operator')
      .replace('included in the OpenLineage customer chapter.',
        'included in the [OpenLineage customer chapter](./product-and-finance.md#openlineage-service-operations-and-complete-customer-receiving).');
  }
  // Restore shell option indentation changed by Canvas rich-text whitespace.
  // Limit normalization to option-leading whitespace inside explicit shell examples.
  value = value.replace(/(^|\n)(\x60{3,}|~{3,})(sh|bash|shell)[ \t]*\n([\s\S]*?)\n\2(?=\n|$)/g,
    (whole, lead, fence, language, body) => lead + fence + language + '\n' +
      body.replace(/^([ \u00a0]*\u00a0[ \u00a0]*)(?=--[A-Za-z0-9-]+(?:[ \t]|$))/gm,
        indentation => indentation.replaceAll('\u00a0', ' ')) + '\n' + fence);
  if (!application) value = receiveIatiOperatingCompanion(value);
  return clean(projectPrivateSourceLinks(value, { application }));
}

/** Select real H1/H2 headings while preserving headings quoted inside fenced examples. */
function headings(value) {
  const found = [];
  let offset = 0, fence = null;
  for (const line of value.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else {
      const heading = line.match(/^ {0,3}(#{1,2})[ \t]+(.+?)\s*$/);
      if (heading) found.push({ text: heading[1] + ' ' + heading[2], level: heading[1].length, start: offset, end: offset + line.length + 1 });
    }
    offset += line.length + 1;
  }
  return found;
}
/** An H2 owns its H3+ content, ending before the next real H1 or H2. */
function section(value, heading) {
  const source = clean(value), outline = headings(source), matches = outline.filter(item => item.text === heading);
  need(matches.length <= 1, 'Keep one customer section: ' + heading);
  if (!matches.length) return null;
  const start = matches[0].start, following = outline.find(item => item.start > start);
  const end = following ? following.start : source.length;
  return { start, end, text: clean(source.slice(start, end)) };
}
/** Receive the whole accepted operator chapter, so a new customer section needs no code patch. */
function acceptedCustomerSections(manuscript) {
  const source = clean(manuscript), outline = headings(source), starts = outline.filter(item => item.text === JOURNEY);
  need(starts.length <= 1, 'Select one complete current demonstration and operator journey.');
  if (!starts.length) return [WEBHOOK, REFERRAL, RISINGWAVE, BILLING].map(heading => {
    const found = section(source, heading);
    return found ? { heading, text: found.text } : null;
  }).filter(Boolean);
  const start = starts[0], next = outline.find(item => item.start > start.start && item.level === 1);
  const chapter = source.slice(start.start, next ? next.start : source.length);
  const children = headings(chapter).filter(item => item.level === 2);
  const intro = clean(chapter.slice(0, children.length ? children[0].start : chapter.length))
    .replace(JOURNEY, '## Current demonstration and operator journey');
  return [{ heading: '## Current demonstration and operator journey', text: intro },
    ...children.filter(item => !DEDICATED.has(item.text)).map(item => ({ heading: item.text, text: section(chapter, item.text).text }))];
}
function installSection(companion, heading, replacement) {
  const value = clean(companion), found = section(value, heading);
  if (found) return clean(value.slice(0, found.start) + clean(replacement) + '\n' + value.slice(found.end));
  const before = value.indexOf('## 10. Open the existing work\n');
  return before < 0 ? clean(value + '\n' + clean(replacement)) :
    clean(value.slice(0, before) + clean(replacement) + '\n' + value.slice(before));
}
function paragraph(manuscript, prefix) {
  const source = clean(manuscript), hits = [...source.matchAll(new RegExp('^' + quoted(prefix) + '[^\\n]*(?:\\n(?!\\n|#{1,6}\\s)[^\\n]+)*', 'gm'))];
  need(hits.length <= 1, 'Keep one accepted customer paragraph: ' + prefix);
  return hits.length ? hits[0][0] : null;
}

/** Update complete accepted customer text while retaining every other chapter and table. */
/** Retain original source links under the companion's existing registered heading. */
export function grantCustomerSourceManuscript(manuscript) {
  const source = clean(manuscript);
  const incoming = section(source, '# 7. Threat response, privacy and measurement');
  if (!incoming) return source;
  const heading = '## 7. Threat response and useful-outcome measurement';
  need(!section(source, heading), 'Select one original threat chapter for source receiving.');
  const received = incoming.text.replace('# 7. Threat response, privacy and measurement', heading);
  return source.slice(0, incoming.start) + received + '\n' + source.slice(incoming.end);
}

export function receiveGrantCustomerSections(productAndFinanceMarkdown, manuscript, { productRegistrations = [] } = {}) {
  let companion = clean(productAndFinanceMarkdown);
  const accepted = acceptedCustomerSections(manuscript);
  const selected = selectGrantProductChapters(grantCustomerSourceManuscript(manuscript), productRegistrations);
  const headings = new Set(accepted.map(incoming => incoming.heading));
  for (const chapter of selected.chapters) {
    // Dedicated economic, coastal and Datasette receivers keep their established
    // source selections. Every other registered H2 owns its complete H3+ body.
    if (DEDICATED.has(chapter.heading) || headings.has(chapter.heading)) continue;
    accepted.push({ heading: chapter.heading, text: chapter.markdown });
    headings.add(chapter.heading);
  }
  for (const incoming of accepted) {
    companion = installSection(companion, incoming.heading, projectGrantMarkdown(incoming.text));
  }
  for (const heading of [
    '## Current alternatives, commercial units and customer value',
    '## Customer value and delivery economics',
    '## Application review, corrections and complete handover',
  ]) {
    const incoming = section(manuscript, heading);
    if (incoming) companion = installSection(companion, heading, projectGrantMarkdown(incoming.text));
  }
  const incoming = OPENFN_PARAGRAPHS.map(prefix => paragraph(manuscript, prefix));
  need(incoming.every(Boolean) || incoming.every(value => value === null), 'Select both accepted OpenFn paragraphs from the complete canonical manuscript.');
  if (incoming.every(Boolean)) {
    const current = section(companion, OPENFN);
    let updated = current ? current.text : OPENFN + '\n';
    for (let i = 0; i < OPENFN_PARAGRAPHS.length; i++) {
      const prior = paragraph(updated, OPENFN_PARAGRAPHS[i]), next = projectGrantMarkdown(incoming[i]).trim();
      updated = prior ? updated.replace(prior, next) : clean(updated) + '\n' + next + '\n';
    }
    companion = installSection(companion, OPENFN, updated);
  }
  // Receive the complete canonical threat/monitoring chapter through the same
  // original companion heading. Independently headed recovery products remain
  // separate chapters and keep their own ordinary source receiving.
  const threatMonitoring = section(manuscript, '# 7. Threat response, privacy and measurement');
  if (threatMonitoring) {
    const threatHeading = '## 7. Threat response and useful-outcome measurement';
    need(section(companion, threatHeading), 'Retain the existing threat-response and measurement chapter.');
    const received = threatMonitoring.text.replace('# 7. Threat response, privacy and measurement', threatHeading);
    companion = installSection(companion, threatHeading, projectGrantMarkdown(received));
  }
  // Receive the complete accepted finance chapter through the ordinary manuscript
  // path, preserving its original reader heading and the other customer chapters.
  const deliveryFinance = section(manuscript, '# 8. Delivery capacity and cash timing');
  if (deliveryFinance) {
    const financeHeading = '## 8. Capacity and cash plan';
    need(section(companion, financeHeading), 'Retain the existing capacity and cash chapter.');
    const received = deliveryFinance.text.replace('# 8. Delivery capacity and cash timing', financeHeading);
    companion = installSection(companion, financeHeading, projectGrantMarkdown(received));
  }
  return projectGrantMarkdown(receiveIatiOperatingCompanion(companion));
}

/** Public index projection preserves source identities and measured file metadata. */
export function projectGrantSourceIndex(value) {
  if (Array.isArray(value)) return value.map(projectGrantSourceIndex).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const restrictedReference = authenticatedGrantSource(value.url) ? value.url : null;
    const projected = Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (key === 'canonical_manuscript') return [];
      const publicItem = projectGrantSourceIndex(item);
      return publicItem === undefined ? [] : [[key, publicItem]];
    }));
    if (restrictedReference) {
      projected.access = 'authenticated-source';
      const reader = workflowForPrivateSource(restrictedReference);
      if (reader) projected.reader_url = reader;
    }
    return projected;
  }
  if (authenticatedGrantSource(value)) return undefined;
  return value;
}

/** Follow each retained customer source URL when rebuilding the public source register. */
export function receiveGrantCustomerSources(index, companion) {
  const receive = (id, title, pattern, sectionText) => {
    const found = sectionText.match(pattern);
    if (!found) return;
    const [url, commit, path] = found, at = index.sources.findIndex(item => item.id === id);
    const previous = at < 0 ? {} : index.sources[at];
    // A product declaration owns its selected edition and measured file identity.
    // An older link elsewhere in the narrative must not replace that selection.
    // The original product receiver applies an intentional owned update afterward.
    if (previous.source_registration !== undefined) {
      need(typeof previous.source_registration === 'string' &&
        /^[a-z0-9][a-z0-9._-]{0,119}$/.test(previous.source_registration),
        'Retain a valid original product registration for source ' + id + '.');
      return;
    }
    const source = { ...previous, id, kind: 'published-source', label: previous.label || title,
      repository: url.split('/').slice(3, 5).join('/'), commit, path, url };
    // A projected register may omit the private URL. File measurements belong to
    // the repository, commit and path, rather than a public link representation.
    const identityChanged = at >= 0 &&
      (previous.repository !== source.repository || previous.commit !== commit || previous.path !== path);
    if (identityChanged) {
      for (const key of ['git_blob', 'sha256', 'bytes', 'product_byte_identity']) delete source[key];
    }
    if (previous.access === 'authenticated-source') {
      delete source.access;
      delete source.reader_url;
    }
    if (at < 0) index.sources.push(source); else index.sources[at] = source;
  };
  const installationUse = section(companion, INSTALLATION_USE)?.text || '';
  receive('customer-use-calendar', 'Saved customer-use calendar and complete editable receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/CUSTOMER_USE_CALENDAR\.md)/, installationUse);
  receive('customer-use-installations', 'Original Installation selection, preview, immutable editions and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/INSTALLATIONS\.md)/, installationUse);
  const economic = section(companion, '## Recurring economic-report installation')?.text || '';
  receive('economic-county-report', 'County report publication, original purchase and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/fred\/qcew\/MERCHANT\.md)/, economic);
  receive('economic-county-source-methods', 'Original county source, calculation profiles and complete report production',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/fred\/qcew\/README\.md)/, economic);
  receive('economic-fred-current-publications', 'Original Federal Reserve publication comparison and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/fred\/ddp\/PUBLISHED-WORKSPACE\.md)/, economic);
  const federal = section(companion, FEDERAL)?.text || '';
  receive('federal-awards-readme', 'Federal awards complete product guide',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/federal-awards\/README\.md)/, federal);
  receive('federal-awards-operating', 'Federal awards installed operating guide',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/federal-awards\/OPERATING\.md)/, federal);
  receive('federal-awards-receiving', 'Federal awards complete workspace receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/federal-awards\/RECEIVING\.md)/, federal);
  receive('federal-awards-report-guide', 'Complete funding report, merchant and buyer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/federal-awards\/FUNDING_REPORTS\.md)/, federal);
  receive('federal-awards-federal-awards', 'Federal awards complete product selection',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/selections\/federal-awards\.json)/, federal);
  const webhook = section(companion, WEBHOOK)?.text || '';
  const openfn = section(companion, OPENFN)?.text || '';
  receive('webhook-customer-commissioning', 'Complete webhook customer commissioning',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/webhook-feed\/COMMISSIONING\.md)/, webhook);
  receive('openfn-commissioning-service', 'OpenFn source-to-PostgreSQL commissioning and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/tree\/([a-f0-9]{40})\/(opportunities\/openfn-commissioning-\d{8})/, openfn);
  receive('openfn-grant-inclusion', 'OpenFn customer workflow and existing funded packages',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/openfn-commissioning-\d{8}\/SCF_INCLUSION\.md)/, openfn);
  const referral = section(companion, REFERRAL)?.text || '';
  receive('gravity-referral-source', 'Referral source, operating contract and responsibilities',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(tools\/revenue_owner_console_\d{8}\/case_assets\/elimu-gravity-referral-implementation-\d{8}-450e\/SOURCE_DOMAIN\.md)/, referral);
  receive('gravity-referral-receiving', 'Complete referral operating result and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(tools\/revenue_owner_console_\d{8}\/case_assets\/elimu-gravity-referral-implementation-\d{8}-450e\/OPERATED_GRAVITY_RECEIVING\.md)/, referral);
  receive('gravity-referral-commissioning', 'Complete referral commissioning and staff handover scope',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(tools\/revenue_owner_console_\d{8}\/case_assets\/elimu-gravity-referral-implementation-\d{8}-450e\/Elimu_Referral_Implementation_Workshare_Offer_\d{8}\.md)/, referral);
  const subscriptions = section(companion, RISINGWAVE)?.text || '';
  receive('risingwave-subscription-operation', 'Source subscription delivery and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/public-commons-sprint-2026\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/risingwave\/README\.md)/, subscriptions);
  receive('risingwave-subscription-commissioning', 'Complete subscription delivery commercial and receiving package',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/tree\/([a-f0-9]{40})\/(tools\/revenue_owner_console_\d{8}\/case_assets\/risingwave-subscription-delivery-pilot-\d{8})/, subscriptions);
  const billing = section(companion, BILLING)?.text || '';
  receive('merchant-bank-statements-operation', 'Original bank statements and shared customer payment coverage',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-bank-statements\/README\.md)/, billing);
  receive('merchant-bank-statements-installation', 'Complete bank product installation and original runtime transfer',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-bank-statements\/INSTALLATION\.md)/, billing);
  receive('merchant-bank-statements-handover', 'Original bank source, remittances and complete accountant handover',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-bank-statements\/HANDOVER\.md)/, billing);
  receive('merchant-bank-statements-example', 'Complete bank account and original browser receiving example',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-bank-statements\/EXAMPLE\.md)/, billing);
  receive('merchant-bank-statements-selection', 'Committed bank application source selection',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/selections\/merchant-bank-statements\.json)/, billing);
  receive('merchant-receivables-operation', 'Customer invoices, receipts and retained accounting work',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-receivables\/README\.md)/, billing);
  receive('merchant-payment-plan-operation', 'Dated collection schedules and complete customer editions',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-payment-plans\/README\.md)/, billing);
  receive('merchant-xero-customer-receiving', 'Accountant document receiving and complete customer handover',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/merchant-settlement-accounting\/receivables\/xero\/README\.md)/, billing);
  receive('merchant-service-renewal-operation', 'Accepted customer service renewal and merchant support operation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf74-merchant-support-console\/SERVICE_RENEWALS\.md)/, billing);
  receive('merchant-accepted-service-calendar', 'Accepted renewal periods and complete financial receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/merchant-service-agreements\/README\.md)#accepted-service-renewals/, billing);
  receive('facilitator-public-response-receiving', 'Complete public facilitator responses and original SDK review',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf82-seller-pilot\/FACILITATOR_RESPONSES\.md)/, companion);
  receive('publisher-facilitator-operations', 'Original Publisher provider review, release lifecycle and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/socrata\/FACILITATORS\.md)/, companion);
  receive('installation-source-builds', 'Product selection, source comparison and installation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/runtime-workspace\/SOURCE_BUILDS\.md)/, companion);
  receive('request-collection-authoring', 'Reusable buyer request plans and complete prepared periods',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf88-operator-buyer-cli\/collections\/AUTHORING\.md)/, companion);
  receive('installation-product-requirements', 'Complete capability selection and committed dependency inspection',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/discovery\/PRODUCT_REQUIREMENTS\.md)/, companion);
  receive('installation-product-plans', 'Saved product, original installed Runtime and complete customer handoff',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/runtime-workspace\/PRODUCT_PLANS\.md)/, companion);
  receive('grant-operating-case', 'Grant Operations complete delivery, cash and customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/grant-operations\/OPERATING\.md)/, companion);
  receive('grant-customer-task-outcomes', 'Complete customer task comparison, reviewed editions and native receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/TASK_OUTCOMES\.md)/, companion);
  receive('grant-supplier-accounts', 'Original supplier work, invoices and dated account receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/PAYABLES\.md)/, companion);
  receive('grant-account-statements', 'Reviewed original account statements and cash movements',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/STATEMENTS\.md)/, companion);
  receive('grant-installation-portfolio', 'Dated installation capacity and original operating forecast',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/PORTFOLIO\.md)/, companion);
  receive('grant-delivery-calendar', 'Original grant delivery calendar and complete exports',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/CALENDAR\.md)/, companion);
  receive('grant-amendment-calendar', 'Saved grant amendment and complete paired calendar receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/AMENDMENT_CALENDAR\.md)/, companion);
  receive('grant-work-invoice-intake', 'Recorded work, supplier invoice intake and original-case receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/WORK_INTAKE\.md)/, companion);
  receive('grant-customer-operating-procedures', 'Editable customer procedures from original grant work packages',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar-forge\/developer-site\/GRANT_OPERATING_PLANS\.md)/, companion);
  receive('grant-operating-forecast', 'Reviewed remaining effort, cash obligations and original operating forecast',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/FORECAST\.md)/, companion);
  receive('grant-application-handoff', 'Complete grant case and saved Application customer handoff',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/grant-operations\/HANDOFF\.md)/, companion);
  const lineage = section(companion, OPENLINEAGE)?.text || '';
  receive('openlineage-installed-operations', 'OpenLineage operations — installed product',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/openlineage\/OPERATING\.md)/, lineage);
  receive('openlineage-source-contract', 'OpenLineage original source contracts',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/openlineage-workspace\/SOURCE_CONTRACT\.md)/, lineage);
  receive('openlineage-service-levels', 'OpenLineage service policies, assessments and incidents',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/openlineage-workspace\/SERVICE_LEVELS\.md)/, lineage);
  receive('openlineage-service-levels-operator', 'OpenLineage service-level operator desk and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/openlineage-workspace\/SERVICE_LEVELS_OPERATOR\.md)/, lineage);
  receive('openlineage-service-levels-native-receiving', 'OpenLineage original service-level receiving programme',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(\.swarm-delivery\/openlineage-service-levels-bbbd-\d{8}\/SERVICE_LEVELS_RECEIVING\.mjs)/, lineage);
  receive('openlineage-quality-operator', 'OpenLineage dataset quality operations',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/openlineage-workspace\/QUALITY_OPERATOR\.md)/, lineage);
  receive("analysis-openlineage-operations", "Analysis source, query and workbook lineage publication",
    /https:\/\/github\.com\/woahwhattheheck\/public-commons-sprint-2026\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf88-operator-buyer-cli\/python\/ANALYSIS_LINEAGE\.md)/, lineage);
  receive("analysis-openlineage-native-receiving", "Analysis and OpenLineage complete native receiving",
    /https:\/\/github\.com\/woahwhattheheck\/public-commons-sprint-2026\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf88-operator-buyer-cli\/python\/examples\/ANALYSIS_LINEAGE_NATIVE\.md)/, lineage);
  const analytical = section(companion, A2A)?.text || '';
  receive("a2a-analysis-installed-product", "Complete analytical service and merchant product",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/a2a-analysis\/README\.md)/, analytical);
  receive("a2a-analysis-operating", "Analytical service installed operation",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/a2a-analysis\/OPERATING\.md)/, analytical);
  receive("a2a-analysis-customer-receiving", "Complete analytical output and workspace receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/a2a-analysis\/RECEIVING\.md)/, analytical);
  receive("a2a-analysis-native-service", "Native A2A analytical procedures and task authority",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar-forge\/a2a-analysis-agent\/README\.md)/, analytical);
  receive("a2a-merchant-operator", "Merchant Agent, publication and release operation",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/a2a\/OPERATOR\.md)/, analytical);
  receive("a2a-merchant-commissioning", "Original merchant A2A commissioning source",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/a2a\/receiving\/commission\.mjs)/, analytical);
  receive("a2a-complete-native-programme", "Complete analytical service native commissioning entry",
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(operations\/scf-a2a-native-analysis-0c7a-\d{8}\/RUN_NATIVE\.md)/, analytical);
  receiveGrantA2ASources(index, analytical);
  const workshares = section(companion, CUSTOMER_WORKSHARES)?.text || '';
  receive("medstar-study-workspace", "Study operations original application",
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/medstar_shadow_study_2026\/workspace\/README\.md)/, workshares);
  receive("medstar-study-integration", "Study operations implementation and customer receiving",
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/medstar_shadow_study_2026\/workspace\/INTEGRATION_HANDOVER\.md)/, workshares);
  receive("medstar-study-api", "Study review, comparison and report API",
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/medstar_shadow_study_2026\/workspace\/API_CONTRACT\.md)/, workshares);
  const airQuality = section(companion, AIR_QUALITY)?.text || '';
  receive('openaq-customer-operation', 'Air-quality reporting and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/openaq\/README\.md)/, airQuality);
  const municipal = section(companion, MUNICIPAL)?.text || '';
  receive('municipal-installed-gis-receiving', 'Municipal source operations and GIS receiving installation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/open311\/gis\/INSTALL\.md)/, municipal);
  receive('municipal-native-format-interchange', 'Municipal GIS original format interchange result',
    /https:\/\/github\.com\/woahwhattheheck\/public-commons-sprint-2026\/blob\/([a-f0-9]{40})\/(operations\/open311-gis-8e5f-\d{8}\/format-interchange-result\.json)/, municipal);
  receive('municipal-suite-operating', 'Municipal six-application operation and saved Applications',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/open311\/OPERATING\.md)/, municipal);
  receive('municipal-suite-receiving', 'Municipal complete editable workspace receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/open311\/RECEIVING\.md)/, municipal);
  receive('municipal-suite-workflows', 'Municipal cross-application source and returned-file workflows',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/open311\/WORKFLOWS\.md)/, municipal);
  receive('municipal-service-configuration-installation', 'Municipal six-application installation and service configuration',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/open311\/service-configuration\/INSTALL\.md)/, municipal);
  receive('municipal-suite-distribution-selection', 'Municipal complete six-application distribution selection',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/selections\/open311-service-configuration\.json)/, municipal);
  const iati = section(receiveIatiOperatingCompanion(companion), IATI)?.text || '';
  receive("iati-document-operating-procedures", "IATI customer operating procedure and complete analyst handover",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence\/OPERATING_PROCEDURES\.md)/, iati);
  receive("iati-document-operating-source", "IATI complete original saved-case source reader",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence\/operating_source\.py)/, iati);
  receive("iati-document-operating-model", "IATI editable procedure, original plan receiver and renderer",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence\/operating_procedure\.mjs)/, iati);
  receive("iati-document-operating-cli", "IATI installed procedure capture, create, show and receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence_operating_cli\.mjs)/, iati);
  receive("iati-complete-installed-operator", "IATI complete installed applications and operating handover",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/selections\/IATI_OPERATOR\.md)/, iati);
  receive('iati-organisation-financial-workspace', 'IATI organisation and programme financial review',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/ORGANISATION_RECONCILIATION\.md)/, iati);
  receive('iati-complete-financial-receiving', 'IATI complete source and financial customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/reconciliation_receiving\.py)/, iati);
  receive('iati-fcdo-wadi-original-source', 'Original FCDO organisation and WADI activity publication',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/fcdo-wadi-2026\/SOURCE\.md)/, iati);
  receive("iati-document-evidence-workspace", "IATI published-document evidence and named source review",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/DOCUMENT_EVIDENCE\.md)/, iati);
  receive("iati-document-evidence-receiving", "IATI document native, SDK, Merchant and browser receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence\/RECEIVING\.md)/, iati);
  receive("iati-document-following-observation", "IATI following publisher observation and complete customer receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/document_evidence\/FOLLOWING\.md)/, iati);
  receive("iati-fcdo-document-native-result", "FCDO document evidence original native receiving result",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/fcdo-organisation-2026\/document-evidence-native-result\.json)/, iati);
  receive("iati-fcdo-document-connected-result", "FCDO document evidence original SDK, Merchant and browser result",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/fcdo-organisation-2026\/document-evidence-connected-result\.json)/, iati);
  receive('iati-geography-workspace', 'IATI saved geography review and complete source contract',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/GEOGRAPHY\.md)/, iati);
  receive('iati-geography-operator', 'IATI geographic review, browser and typed client',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/GEOGRAPHY_UI\.md)/, iati);
  receive('iati-geography-native-receiving', 'Complete original geography native and customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/receiving\/geography\.py)/, iati);
  receive('iati-geography-browser-receiving', 'Original geography browser and saved-request continuation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/receiving\/GEOGRAPHY_BROWSER\.md)/, iati);
  receive('iati-aiddata-nigeria-attribution', 'Original AidData Nigeria research source and attribution',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/aiddata-nigeria-2016\/AIDDATA_NIGERIA\.md)/, iati);
  receive('iati-aiddata-nigeria-metadata', 'Original AidData Nigeria documentary source identities',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/aiddata-nigeria-2016\/aiddata-nigeria\.json)/, iati);
  receive('iati-aiddata-nigeria-xml', 'Complete original AidData Nigeria IATI publication',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/iati\/examples\/aiddata-nigeria-2016\/iati_2\.03_NigeriaAIMS_GeocodedResearchRelease\.xml)/, iati);
  const institutionalRepository = section(companion, INSTITUTIONAL_REPOSITORY)?.text || '';
  receive('tind-institutional-migration', 'Institutional repository migration and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/tind\/OPERATING\.md)/, institutionalRepository);
  receive('oai-original-record-collections', 'Original scholarly response intake and complete record selections',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/oai-pmh\/README\.md)/, institutionalRepository);
  receive('tind-msu-original-source-receiving', 'Original MSU source cases and complete institutional receiving',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/discoverygarden_msu2026112_\d{8}\/tind-operator\/OPERATOR_CASES\.md)/, institutionalRepository);
  receive('tind-institutional-repository-contribution', 'Repository commissioning, recurring service and funded contribution',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/tind\/GRANT\.md)/, institutionalRepository);
  const companyResearch = section(companion, '## Company research, recurring reference data and complete receiving')?.text || '';
  const airbyte = section(companion, AIRBYTE)?.text || '';
  receive('airbyte-native-commissioning', 'Original Airbyte CDK environment and completed native receiving',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/airbyte-connector-commissioning-\d{8}\/reference\/openfema\/NATIVE_ENVIRONMENT\.md)/, airbyte);
  receive('airbyte-source-contract', 'Original source, acknowledged state and complete dataset contract',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/airbyte-connector-commissioning-\d{8}\/reference\/openfema\/README\.md)/, airbyte);
  receive('airbyte-managed-receiving', 'Complete managed Application and second-operator receiving',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/airbyte-connector-commissioning-\d{8}\/applications\/MANAGED_RECEIVING\.md)/, airbyte);
  receive('airbyte-customer-commissioning', 'Customer commissioning scope, selected source and complete handover',
    /https:\/\/github\.com\/woahwhattheheck\/commons\/blob\/([a-f0-9]{40})\/(opportunities\/airbyte-connector-commissioning-\d{8}\/commercial\/metaops-\d{8}\/IMPLEMENTATION-AND-HANDOVER\.md)/, airbyte);
  receive('gleif-company-research-operating', 'Company research, source review, customer files and native dataset receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/gleif\/OPERATING\.md)/, companyResearch);
  receive('gleif-company-source-contract', 'Original legal-entity records, source editions and complete receiving contract',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/sf30-seller-sdk\/gleif\/SOURCE_CONTRACT\.md)/, companyResearch);
  receive('gleif-company-grant-workflow', 'Company research service, customer commissioning and existing funded packages',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/gleif\/GRANT\.md)/, companyResearch);
  const x402apiMerchant = section(companion, '## Merchant invoices, paid fulfillment and portable operating projects')?.text || '';
  const haystack = section(companion, HAYSTACK)?.text || '';
  receive("haystack-installed-operations", "Haystack installed modelling, corrective work and contractor receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/haystack\/OPERATING\.md)/, haystack);
  receive("haystack-point-modelling", "Original point lists, reviewed mapping, dictionary and model history",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/SEMANTIC_MODELLING\.md)/, haystack);
  receive("haystack-native-semantic", "Exact Brick 1.4.4 native validation and offline receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/SEMANTIC_NATIVE\.md)/, haystack);
  receive("haystack-source-contract", "Original typed Haystack grid and source meaning",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/HAYSTACK_CONTRACT\.md)/, haystack);
  receive("haystack-charlie-original", "Original anonymized Charlie example source",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/fixture-charlie\.json)/, haystack);
  receive("haystack-corrective-work", "Corrective work, event ancestry and returned contractor history",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/CORRECTIVE_WORK\.md)/, haystack);
  receive("haystack-source-license", "Original Haystack source licence and attribution",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/HAYSTACK_LICENSE\.txt)/, haystack);
  receive("haystack-semantic-dependencies", "Complete offline semantic dependency archive selection",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/semantic-dependencies\.json)/, haystack);
  receive("haystack-semantic-native-receiving", "Complete original point modelling native receiving programme",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/SEMANTIC_RECEIVING\.mjs)/, haystack);
  receive("haystack-semantic-browser-receiving", "Complete original model and contractor browser programme",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/haystack-workspace\/SEMANTIC_BROWSER\.mjs)/, haystack);
  receive('x402api-merchant-operating', 'Merchant invoices, installed application and operator handover',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/OPERATING\.md)/, x402apiMerchant);
  receive('x402api-merchant-application', 'Merchant invoice, payment, fulfillment and result interfaces',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/README\.md)/, x402apiMerchant);
  receive('x402api-merchant-native-receiving', 'Original complete merchant protocol commissioning and receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/NATIVE_RECEIVING\.md)/, x402apiMerchant);
  receive('x402api-merchant-installed-receiving', 'Installed merchant Applications and completed-workspace receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/INSTALLED_RECEIVING\.md)/, x402apiMerchant);
  receive('x402api-merchant-portable-project', 'Complete merchant project, native reservation recovery and customer activation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/PORTABLE_PROJECT\.md)/, x402apiMerchant);
  receive('x402api-merchant-portable-archive', 'Original merchant browser archive and whole-file receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/PORTABLE\.md)/, x402apiMerchant);
  receive('x402api-merchant-received-review', 'Managed received merchant invoice review and cold reopen',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/RECEIVED_REVIEW\.md)/, x402apiMerchant);
  receive('x402api-merchant-project-intake', 'Managed complete merchant project intake and recovery',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/PROJECT_INTAKE\.md)/, x402apiMerchant);
  receive('x402api-merchant-invoice-register', 'Complete invoice register, original amounts and exports',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/INVOICE_REGISTER\.md)/, x402apiMerchant);
  receive('x402api-merchant-invoice-intake', 'Original accounting source, retained invoice plan and continuation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/INVOICE_INTAKE\.md)/, x402apiMerchant);
  receive('x402api-merchant-operator-client', 'Original typed merchant operator client and CLI',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/OPERATOR_CLIENT\.md)/, x402apiMerchant);
  receive('x402api-merchant-project-agent', 'Received merchant project agent and retained file delivery',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/PROJECT_AGENT\.md)/, x402apiMerchant);
  receive('x402api-merchant-invoice-agent', 'Live merchant invoice agent, original operation and complete delivery',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/INVOICE_AGENT\.md)/, x402apiMerchant);

  receive('x402api-merchant-payment-desk', 'Original invoice payment desk and private work recovery',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/x402api-merchant-workspace\/PAYMENTS\.md)/, x402apiMerchant);

  const preparation = section(companion, "## SQL preparation, reusable pipelines and complete analyst receiving")?.text || '';
  receive("preparation-workspace-operating", "Complete installed SQL preparation and managed pipeline operation",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/data-preparation\/OPERATING\.md)/, preparation);
  receive("preparation-pipeline-original-engine", "Original saved pipeline, stage execution and complete delivery",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/sf30-seller-sdk\/data-preparation\/pipelines\/README\.md)/, preparation);
  receive("preparation-workspace-selection", "Complete installed data-preparation product selection",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-20261009\/distribution\/selections\/data-preparation-workspace\.json)/, preparation);
  receive("preparation-workspace-receiving", "Original complete preparation and pipeline customer receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/data-preparation\/RECEIVING\.md)/, preparation);
  receive("preparation-workspace-source", "Complete frozen source for original customer receiving",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/data-preparation\/receiving-source\.json)/, preparation);
  receive("preparation-workspace-native-receiving", "Native original-case continuation, shutdown and complete preservation",
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(products\/data-preparation\/receiving\.py)/, preparation);

  const connectedSystems = section(companion, '## Connected Systems observations: customer commissioning and repeat use')?.text || '';
  receive('connected-systems-customer-operator', 'Connected Systems source, operator installation and complete customer receiving',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf-starforge-\d{8}\/distribution\/selections\/CONNECTED_SYSTEMS\.md)/, connectedSystems);
  receive('connected-systems-publisher-observation', 'Original publisher observation used by the native receiving example',
    /https:\/\/github\.com\/opengeospatial\/ogcapi-connected-systems\/blob\/([a-f0-9]{40})\/(api\/part2\/openapi\/examples\/observations\/obs-simple\.json)/, connectedSystems);
  receive('connected-systems-commissioning-programme', 'Original Workshare phases and Customer Installation operating programme',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf49_data_commissioning\/installation-workorders\/GEOROBOTIX_CSAPI\.md)/, connectedSystems);
  receive('connected-systems-workshare-intake', 'Original Workshare scope and plan intake into Customer Installation',
    /https:\/\/github\.com\/woahwhattheheck\/tjlabs-stellar-merchant-workspace\/blob\/([a-f0-9]{40})\/(stellar\/scf_2026\/sf47_budget_model\/workspace\/workshare_intake\.py)/, connectedSystems);
  index.narrative_source = { ...index.narrative_source, composition: {
    ...index.narrative_source?.composition,
    retained_product_sections: headings(clean(companion)).filter(item => item.level === 2).map(item => item.text.slice(3)),
  } };
  return index;
}
