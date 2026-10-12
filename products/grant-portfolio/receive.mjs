#!/usr/bin/env node
// MIT. Receive the whole original Comic Relief journey from a READY installed product.
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {installedSource, inspectPython, prepareProduct, statusProduct, options,
  productDirectory, nativeJSON, SDK_PATH} from './product.mjs';
import {absolute, canonical, digest, regular, readJSON, saveJSON, need, operationLease, operationRunning}
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const SCHEMA = 'stellar-forge.grant-portfolio-installed-receiving.v1';
const OPERATION = 'scf-grant-portfolio-comic-relief-9b23-20261012';
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
async function original(path, value) {
  const previous = await readJSON(path, true);
  if (previous) need(same(previous,value), 'GRANT_PRODUCT_RECEIVING_INPUT_CHANGED');
  else await saveJSON(path,value);
}
async function runJourney(args, pythonExecutable) {
  const child = spawn(process.execPath,args,{shell:false,stdio:'inherit',
    env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_GRANT_PORTFOLIO_PYTHON:pythonExecutable}});
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
  try {
    const code = await new Promise((yes,no) => {
      child.once('error',no);child.once('close',(status,signal) => yes(status ?? (signal === 'SIGTERM' ? 143 : 130)));
    });
    need(code === 0,'GRANT_PRODUCT_JOURNEY_INCOMPLETE',
      'Continue this same installed receiving directory with its original input and saved native journey.');
  } finally {process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);}
}

const executeFile = promisify(execFile);
const RECOVERY = 'stellar-forge.grant-portfolio-console-recovery.v1';
const stateHash = value => digest(JSON.stringify(canonical(value)) + '\n');
async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise,new Promise((_,reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message),
        {code:'GRANT_PRODUCT_CONSOLE_RECOVERY_INCOMPLETE'})),milliseconds);
    })]);
  } finally {clearTimeout(timer);}
}
async function receiveConsoleRecovery(product, directory) {
  const baselineFile = join(directory,'customer-console-recovery-input.json');
  const journalFile = join(directory,'customer-console-recovery-journal.json');
  const resultFile = join(directory,'customer-console-recovery.json');
  const processSchema = 'stellar-forge.grant-portfolio-console-process.v1';
  const helper = join(product.installation.sourceRoot,'products/grant-portfolio/console-recovery.py');
  const custodyRoot = join(directory,'console-recovery');
  const environment = {...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath,
    SF30_NDJSON_NODE:process.execPath,SF30_GRANT_PORTFOLIO_NODE:process.execPath};
  const initial = await statusProduct(product.directory);
  need(initial.workspace.sources.length === 3 && initial.workspace.portfolios.length >= 1,
    'GRANT_PRODUCT_COMPLETE_CUSTOMER_REQUIRED');
  const selected = {schema:RECOVERY,operationId:OPERATION,workspaceId:product.workspaceId,
    workspaceDirectory:product.workspaceDirectory,bindingSha256:product.bindingSha256,
    sourceCommit:product.installation.sourceCommit,stateSha256:stateHash(initial.workspace)};
  const baseline = await readJSON(baselineFile,true);
  if (baseline) need(same(baseline,selected),'GRANT_PRODUCT_CONSOLE_RECOVERY_CHANGED');
  else {
    need(initial.console === 'CLOSED' || initial.console === 'RECOVERABLE',
      'GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE','Close this customer console before starting its installed receiving.');
    await original(baselineFile,selected);
  }
  const previous = await readJSON(resultFile,true);
  if (previous) {
    need(previous.schema === RECOVERY && previous.state === 'COMPLETED' &&
      same(previous.selected,selected) && initial.console === 'CLOSED' &&
      previous.resources?.closed === true,'GRANT_PRODUCT_CONSOLE_RECOVERY_CHANGED');
    return previous;
  }
  let journal = await readJSON(journalFile,true);
  if (journal) {
    need(journal.schema === RECOVERY && same(journal.selected,selected) &&
      typeof journal.recoveryId === 'string' && Array.isArray(journal.first?.attempts) &&
      Array.isArray(journal.reopened?.attempts),'GRANT_PRODUCT_CONSOLE_RECOVERY_CHANGED');
  } else {
    need(initial.console !== 'RUNNING','GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE');
    journal = {schema:RECOVERY,selected,recoveryId:randomUUID(),state:'RUNNING',
      first:{attempts:[]},reopened:{attempts:[]}};
    await saveJSON(journalFile,journal);
  }
  await productDirectory(custodyRoot);
  for (const stage of ['first','reopened']) await productDirectory(join(custodyRoot,stage));
  const persist = () => saveJSON(journalFile,journal,true);
  const children = new Map();
  let interrupted = false;
  const interrupt = () => {interrupted = true;};
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  const alive = () => need(!interrupted,'GRANT_PRODUCT_CONSOLE_RECOVERY_INTERRUPTED',
    'Continue this same receiving directory and its original console transition.');
  const pause = milliseconds => new Promise(yes => setTimeout(yes,milliseconds));
  const checkState = state => need(stateHash(state.workspace) === selected.stateSha256,
    'GRANT_PRODUCT_RECOVERY_CUSTOMER_CHANGED');
  async function control(attempt, command, signal) {
    need(attempt.directory === join(custodyRoot,attempt.stage,attempt.id),
      'GRANT_PRODUCT_CONSOLE_CUSTODY_CHANGED');
    const args = [helper,command,'--directory',attempt.directory];
    if (signal) args.push('--signal',signal);
    let response;
    try {
      response = await executeFile(product.pythonExecutable,args,
        {env:environment,encoding:'utf8',maxBuffer:65536,timeout:45000});
    } catch (error) {
      let details;
      try {details = JSON.parse(error.stdout);} catch {}
      throw Object.assign(new Error('The original console process-custody action did not complete.'),
        {code:details?.code ?? error.code ?? 'GRANT_PRODUCT_CONSOLE_CUSTODY_INCOMPLETE'});
    }
    const value = JSON.parse(response.stdout);
    need(value.schema === processSchema && ['PENDING','RUNNING','EXITED','FOREIGN'].includes(value.state),
      'GRANT_PRODUCT_CONSOLE_CUSTODY_CHANGED');
    if (attempt.intentSha256) need(value.intentSha256 === attempt.intentSha256,
      'GRANT_PRODUCT_CONSOLE_CUSTODY_CHANGED');
    else {attempt.intentSha256 = value.intentSha256;await persist();}
    if (attempt.processSha256) need(value.processSha256 === attempt.processSha256,
      'GRANT_PRODUCT_CONSOLE_CUSTODY_CHANGED');
    else if (value.processSha256) {
      attempt.processSha256 = value.processSha256;attempt.identity = value.identity;await persist();
    }
    return value;
  }
  async function waitChild(attempt, milliseconds = 30000) {
    const child = children.get(attempt.id);
    if (!child) return null;
    const outcome = await deadline(child.exit,milliseconds,'The owned original console has not exited.');
    if (attempt.identity && child.child.pid === attempt.identity.pid) {
      if (!attempt.wait) {attempt.wait = outcome;await persist();}
    } else {
      // A resumed PENDING launch may have lost the exclusive bootstrap race
      // to its earlier orphan. Its exit is not the retained native PID's exit.
      const observation = {pid:child.child.pid ?? null,...outcome};
      attempt.bootstrapExits ??= [];
      if (!attempt.bootstrapExits.some(value => same(value,observation))) {
        attempt.bootstrapExits.push(observation);await persist();
      }
    }
    return outcome;
  }
  function spawnBootstrap(attempt) {
    // The bootstrap persists its immutable identity before exec. An orphaned
    // earlier bootstrap and a retried spawn cannot both open the native CLI.
    const child = spawn(product.pythonExecutable,[helper,'run','--directory',attempt.directory],
      {shell:false,stdio:'ignore',env:environment});
    const session = {child,closed:false};
    session.exit = new Promise(yes => {
      child.once('error',error => {session.closed=true;yes({error:error.code ?? 'SPAWN_ERROR'});});
      child.once('close',(code,signal) => {session.closed=true;yes({code,signal});});
    });
    children.set(attempt.id,session);
  }
  async function newAttempt(stage) {
    alive();
    const status = await statusProduct(product.directory);checkState(status);
    need(status.console === 'CLOSED' || status.console === 'RECOVERABLE',
      'GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE','Preserve the original active customer console.');
    const id = randomUUID(), attempt = {id,stage,directory:join(custodyRoot,stage,id)};
    await productDirectory(attempt.directory);
    const intent = {schema:processSchema,operationId:OPERATION,recoveryId:journal.recoveryId,
      stage,attemptId:id,directory:attempt.directory,pythonExecutable:product.pythonExecutable,
      cli:join(product.installation.authoringDirectory,'cli.py'),workspace:product.workspaceDirectory,
      workspaceId:product.workspaceId,bindingSha256:product.bindingSha256,
      connectionFile:product.connectionFile,sourceCommit:product.installation.sourceCommit,
      stateSha256:selected.stateSha256};
    await original(join(attempt.directory,'intent.json'),intent);
    journal[stage].attempts.push(attempt);
    await persist(); // The complete stage and launch intent precede every spawn.
    return attempt;
  }
  async function freeWriter() {
    need(!await operationRunning(join(product.workspaceDirectory,'.workspace.lock')),
      'GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE','The original native workspace still has an active writer.');
    const status = await statusProduct(product.directory);checkState(status);
    need(status.console === 'CLOSED' || status.console === 'RECOVERABLE',
      'GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE');
    return status;
  }
  async function readiness(attempt) {
    let observed = await control(attempt,'inspect');
    if (observed.state === 'PENDING') {
      const prior = children.get(attempt.id);
      if (!prior || prior.closed) spawnBootstrap(attempt);
    }
    const expires = performance.now() + 90000;
    while (performance.now() < expires) {
      alive();
      observed = await control(attempt,'inspect');
      if (observed.state === 'EXITED' || observed.state === 'FOREIGN') return {attempt,observed};
      const launch = await readJSON(product.connectionFile,true);
      if (observed.state === 'RUNNING' && observed.command === 'native' &&
          launch?.pid === observed.identity.pid) {
        need(launch.schema === 'stellar-forge.grant-portfolio-workspace-launch.v1' &&
          launch.status === 'GRANT_PORTFOLIO_WORKSPACE_READY' &&
          launch.workspace === product.workspaceDirectory && launch.workspaceId === product.workspaceId &&
          launch.bindingSha256 === product.bindingSha256 && launch.connectionFile === product.connectionFile,
        'GRANT_PRODUCT_RECOVERY_LAUNCH_CHANGED');
        const connection = await nativeJSON(product,['connection','--file',product.connectionFile]);
        if (!connection.writerActive) {await pause(150);continue;}
        const active = await statusProduct(product.directory);checkState(active);
        need(active.console === 'RUNNING' && connection.exists === true,
          'GRANT_PRODUCT_RECOVERY_WRITER_REQUIRED');
        const unchanged = await nativeJSON(product,['connection','--file',product.connectionFile]);
        const live = await control(attempt,'inspect');
        need(live.state === 'RUNNING' && live.command === 'native' &&
          live.processSha256 === observed.processSha256 && unchanged.writerActive &&
          unchanged.sha256 === connection.sha256,'GRANT_PRODUCT_RECOVERY_LAUNCH_CHANGED');
        const ready = {processSha256:observed.processSha256,identity:observed.identity,
          connectionSha256:connection.sha256};
        if (attempt.ready) need(same(attempt.ready,ready),'GRANT_PRODUCT_RECOVERY_LAUNCH_CHANGED');
        else {attempt.ready=ready;await persist();}
        return {attempt,observed:live,connection};
      }
      const owned = children.get(attempt.id);
      if (observed.state === 'PENDING' && owned?.closed) {
        await waitChild(attempt);
        need(false,'GRANT_PRODUCT_CONSOLE_START_INCOMPLETE','Continue the original retained console launch.');
      }
      await pause(200);
    }
    need(false,'GRANT_PRODUCT_CONSOLE_RECOVERY_INCOMPLETE',
      'The original customer console has not announced readiness; continue this same receiving directory.');
  }
  async function activeAttempt(stage) {
    while (true) {
      alive();
      let attempt = journal[stage].attempts.at(-1);
      if (!attempt || attempt.retired) attempt = await newAttempt(stage);
      const value = await readiness(attempt);
      if (value.observed.state === 'RUNNING') return value;
      need(value.observed.state !== 'FOREIGN','GRANT_PRODUCT_ORIGINAL_PROCESS_HOST_REQUIRED',
        'Continue the retained console transition in its original process namespace.');
      await freeWriter();
      attempt.retired = {reason:'ORIGINAL_PROCESS_ENDED_BEFORE_TRANSITION',
        observation:value.observed};
      await waitChild(attempt);
      await persist();
      // A completed stage is never retried. This new attempt finishes only the
      // transition whose original process ended before it was reserved.
      need(!attempt.killIntent && !attempt.closeIntent,
        'GRANT_PRODUCT_ORIGINAL_TRANSITION_REQUIRED');
      need(!children.has(attempt.id),'GRANT_PRODUCT_CONSOLE_START_INCOMPLETE',
        'The original console start ended; retain this attempt and continue after its native cause is resolved.');
    }
  }
  async function stopOriginal(attempt, signal) {
    const outcome = await control(attempt,'stop',signal);
    attempt.stops ??= {};
    attempt.stops[signal] = outcome;
    await persist();
    if (outcome.state === 'EXITED') await waitChild(attempt);
    return outcome;
  }
  async function finishKill(attempt) {
    need(attempt.ready && attempt.killIntent &&
      attempt.killIntent.processSha256 === attempt.processSha256 &&
      attempt.killIntent.connectionSha256 === attempt.ready.connectionSha256,
    'GRANT_PRODUCT_ORIGINAL_TRANSITION_REQUIRED');
    const outcome = await stopOriginal(attempt,'SIGKILL');
    need(outcome.state === 'EXITED','GRANT_PRODUCT_CONSOLE_RECOVERY_INCOMPLETE');
    const retained = await statusProduct(product.directory);checkState(retained);
    need(retained.console === 'RECOVERABLE' && retained.connection.exists === true &&
      retained.connection.writerActive === false &&
      retained.connection.sha256 === attempt.ready.connectionSha256,
    'GRANT_PRODUCT_STOPPED_CONNECTION_CHANGED');
    if (attempt.wait) need(!attempt.wait.error &&
      (outcome.dispatch !== 'SENT' || attempt.wait.signal === 'SIGKILL'),
    'GRANT_PRODUCT_PROCESS_DEATH_CHANGED');
    journal.killed = {attemptId:attempt.id,processSha256:attempt.processSha256,
      pid:attempt.identity.pid,identity:attempt.identity,requestedSignal:'SIGKILL',
      signal:outcome.dispatch === 'SENT' || attempt.wait?.signal === 'SIGKILL' ? 'SIGKILL' : null,
      dispatch:outcome.dispatch,
      connectionSha256:attempt.ready.connectionSha256,
      wait:attempt.wait ?? null,staleConnectionRetained:true,writerReleased:true};
    await persist();
  }
  async function finishClose(attempt) {
    need(attempt.ready && attempt.closeIntent &&
      attempt.closeIntent.processSha256 === attempt.processSha256 &&
      attempt.closeIntent.connectionSha256 === attempt.ready.connectionSha256,
    'GRANT_PRODUCT_ORIGINAL_TRANSITION_REQUIRED');
    const observed = await control(attempt,'inspect');
    need(observed.state !== 'FOREIGN','GRANT_PRODUCT_ORIGINAL_PROCESS_HOST_REQUIRED',
      'Continue the retained console transition in its original process namespace.');
    const outcome = await stopOriginal(attempt,'SIGTERM');
    need(outcome.state === 'EXITED','GRANT_PRODUCT_CONSOLE_RECOVERY_INCOMPLETE');
    const final = await statusProduct(product.directory);checkState(final);
    if (final.console === 'RECOVERABLE') {
      need(final.connection.writerActive === false &&
        final.connection.sha256 === attempt.ready.connectionSha256,
      'GRANT_PRODUCT_STOPPED_CONNECTION_CHANGED');
      attempt.retired = {reason:'ORIGINAL_PROCESS_ENDED_BEFORE_CLEAN_CLOSE',observation:outcome};
      await persist();return false;
    }
    need(final.console === 'CLOSED','GRANT_PRODUCT_CONSOLE_CLOSE_INCOMPLETE');
    if (attempt.wait) need(!attempt.wait.error && attempt.wait.code === 0 && !attempt.wait.signal,
      'GRANT_PRODUCT_CONSOLE_CLOSE_INCOMPLETE');
    journal.closed = {attemptId:attempt.id,processSha256:attempt.processSha256,
      pid:attempt.identity.pid,identity:attempt.identity,signal:'SIGTERM',dispatch:outcome.dispatch,
      connectionSha256:attempt.ready.connectionSha256,wait:attempt.wait ?? null,
      connectionRemoved:true,writerReleased:true};
    await persist();return true;
  }
  async function cleanup() {
    const failures = [];
    for (const attempt of [...journal.first.attempts,...journal.reopened.attempts].reverse()) {
      try {
        let observed = await control(attempt,'inspect');
        if (observed.state === 'PENDING') {
          const session = children.get(attempt.id);
          if (session && !session.closed) {
            // The current ChildProcess handle is still owned before bootstrap
            // publication; no native CLI can have opened without process.json.
            session.child.kill('SIGTERM');
            await waitChild(attempt);
          }
          observed = await control(attempt,'inspect');
        }
        if (observed.state === 'RUNNING') {
          attempt.cleanupIntent ??= {processSha256:observed.processSha256,
            signal:attempt.killIntent && !journal.killed ? 'SIGKILL':'SIGTERM'};
          await persist();
          let stopped = await stopOriginal(attempt,attempt.cleanupIntent.signal);
          if (stopped.state === 'RUNNING') {
            attempt.cleanupEscalation = {processSha256:observed.processSha256,signal:'SIGKILL'};
            await persist();stopped = await stopOriginal(attempt,'SIGKILL');
          }
          need(stopped.state === 'EXITED','GRANT_PRODUCT_CONSOLE_CLOSE_INCOMPLETE');
        } else if (observed.state === 'EXITED') await waitChild(attempt);
        else need(observed.state !== 'FOREIGN','GRANT_PRODUCT_ORIGINAL_PROCESS_HOST_REQUIRED',
          'Retain the original process custody for its original host to close.');
      } catch (error) {failures.push(error);}
    }
    if (failures.length) throw new AggregateError(failures,
      'The original customer console still requires its saved receiving continuation.');
  }
  let result, failure;
  try {
    if (!journal.killed) {
      let attempt = journal.first.attempts.at(-1);
      if (!attempt?.killIntent) {
        ({attempt} = await activeAttempt('first'));
        attempt.killIntent = {processSha256:attempt.processSha256,
          connectionSha256:attempt.ready.connectionSha256};
        await persist();
      }
      alive();await finishKill(attempt);
    }
    while (!journal.closed) {
      let attempt = journal.reopened.attempts.at(-1);
      if (!attempt?.closeIntent || attempt.retired) {
        ({attempt} = await activeAttempt('reopened'));
        need(attempt.ready.connectionSha256 !== journal.killed.connectionSha256,
          'GRANT_PRODUCT_CONNECTION_NOT_REPLACED');
        attempt.closeIntent = {processSha256:attempt.processSha256,
          connectionSha256:attempt.ready.connectionSha256};
        await persist();
      }
      alive();await finishClose(attempt);
    }
    const final = await statusProduct(product.directory);checkState(final);alive();
    need(final.console === 'CLOSED','GRANT_PRODUCT_RECOVERED_CUSTOMER_CHANGED');
    result = {schema:RECOVERY,operationId:OPERATION,state:'COMPLETED',selected,
      recoveryId:journal.recoveryId,journalFile,
      killed:journal.killed,
      reopened:{...journal.closed,exitCode:journal.closed.wait?.code ?? null},
      preserved:{sources:final.workspace.sources.length,portfolios:final.workspace.portfolios.length,
        requests:final.workspace.requests.length,revision:final.workspace.revision,
        stateSha256:stateHash(final.workspace)},
      resources:{closed:true,consoleProcessesClosed:true,connectionRemoved:true}};
  } catch (error) {failure=error;}
  finally {
    try {await cleanup();}
    catch (error) {failure=failure ? new AggregateError([failure,error],
      'Continue the original customer console recovery and retained cleanup.') : error;}
    process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
  }
  if (failure) throw failure;
  journal.state='COMPLETED';await persist();
  await original(resultFile,result);return result;
}

export async function receiveInstalledPortfolio({runtimeDirectory, directory, pythonExecutable,
  nativeInputs, prepared, chromium, playwrightModule} = {}) {
  for (const value of [runtimeDirectory,directory,pythonExecutable,nativeInputs,prepared,chromium,playwrightModule])
    absolute(value);
  const installation = await installedSource(runtimeDirectory);
  const python = await inspectPython(pythonExecutable);
  await productDirectory(directory);
  const lease = await operationLease(join(directory,'.receiving.lock'));
  try {
    const inputsBytes = await regular(nativeInputs), preparedBytes = await regular(prepared);
    const inputs = JSON.parse(inputsBytes), preparation = JSON.parse(preparedBytes);
    need(inputs.schema === 'stellar-forge.comic-relief-native-inputs.v1' &&
      inputs.operationId === OPERATION && preparation.operationId === OPERATION &&
      inputs.nativeReceiving === 'complete' && inputs.binding.preparedSha256 === digest(preparedBytes) &&
      inputs.sources?.length === 3,'GRANT_PRODUCT_ORIGINAL_INPUT_REQUIRED');
    const selected = {schema:SCHEMA,operationId:OPERATION,directory,
      runtimeDirectory,installationId:installation.installationId,sourceCommit:installation.sourceCommit,
      manifestSha256:installation.manifestSha256,profileSha256:installation.profileSha256,
      lockSha256:installation.lockSha256,pythonExecutable,python,nativeInputs,prepared,
      inputsSha256:digest(inputsBytes),preparedSha256:digest(preparedBytes),chromium,playwrightModule};
    await original(join(directory,'installed-input.json'),selected);
    const journeyDirectory = join(directory,'journey');
    const resultFile = join(journeyDirectory,'product-result.json');
    let journey = await readJSON(resultFile,true);
    if (journey?.state !== 'COMPLETED') {
      await runJourney([join(installation.authoringDirectory,'examples/comic-relief/product-journey.mjs'),
        '--sdk',join(installation.sourceRoot,SDK_PATH),'--native-inputs',nativeInputs,
        '--prepared',prepared,'--output',journeyDirectory,'--python',pythonExecutable,
        '--chromium',chromium,'--playwright-module',playwrightModule,
        '--source-commit',installation.sourceCommit],pythonExecutable);
      journey = await readJSON(resultFile);
    }
    need(journey.schema === 'stellar-forge.comic-relief-portfolio-journey.v1' &&
      journey.state === 'COMPLETED' && journey.operationId === OPERATION &&
      journey.binding?.selectedSourceCommit === installation.sourceCommit &&
      journey.binding?.sdk === join(installation.sourceRoot,SDK_PATH) &&
      journey.binding?.inputsSha256 === selected.inputsSha256 &&
      journey.binding?.preparedSha256 === selected.preparedSha256 &&
      Object.keys(journey.phases ?? {}).length === 9 &&
      journey.resources?.closed === true && journey.resources.consoleProcessesClosed === true &&
      journey.resources.merchantClosed === true && journey.resources.browserClosed === true,
    'GRANT_PRODUCT_JOURNEY_INCOMPLETE');
    const customer = await prepareProduct({runtimeDirectory,directory:join(directory,'customer-product'),
      workspaceDirectory:join(journeyDirectory,'workspaces/receiver'),pythonExecutable,
      title:'Comic Relief grant portfolio'});
    const second = await prepareProduct({runtimeDirectory,directory:join(directory,'second-customer-product'),
      workspaceDirectory:join(journeyDirectory,'workspaces/second'),pythonExecutable,
      title:'Comic Relief received portfolio'});
    const consoleRecovery = await receiveConsoleRecovery(customer,directory);
    const customerState = await statusProduct(customer.directory);
    const secondState = await statusProduct(second.directory);
    need(customerState.console === 'CLOSED' && secondState.console === 'CLOSED' &&
      customer.workspaceId !== second.workspaceId,'GRANT_PRODUCT_RECEIVING_WORKSPACE_CHANGED');
    const completed = {schema:SCHEMA,operationId:OPERATION,state:'COMPLETED',selected,
      nativePhases:Object.keys(journey.phases),resultFile,customerProduct:customer.directory,
      secondCustomerProduct:second.directory,customerWorkspaceId:customer.workspaceId,
      secondWorkspaceId:second.workspaceId,nativeCustomerFile:journey.refs.customerFile,
      reexportFile:journey.refs.reexportFile,resources:journey.resources,consoleRecovery,
      installedNativeSourceFiles:installation.sourceFiles.length};
    await original(join(directory,'installed-result.json'),completed);
    return completed;
  } finally {await lease.close();}
}
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && args[0] === '--help') {
    console.log('grant-portfolio-product-receiving --runtime READY_RUNTIME --directory SAME_PRIVATE_RECEIVING ' +
      '--python ABSOLUTE_PYTHON --native-inputs ORIGINAL_NATIVE_INPUTS_JSON --prepared ORIGINAL_PREPARED_JSON ' +
      '--chromium EXISTING_CHROMIUM --playwright-module EXISTING_PLAYWRIGHT_ENTRY');return 0;
  }
  const selected = options(args,['--runtime','--directory','--python','--native-inputs','--prepared','--chromium','--playwright-module']);
  const result = await receiveInstalledPortfolio({runtimeDirectory:selected['--runtime'],
    directory:selected['--directory'],pythonExecutable:selected['--python'],
    nativeInputs:selected['--native-inputs'],prepared:selected['--prepared'],
    chromium:selected['--chromium'],playwrightModule:selected['--playwright-module']});
  console.log(JSON.stringify(result,null,2));return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => {process.exitCode=code;}).catch(error => {
    console.error(JSON.stringify({error:error.code ?? 'GRANT_PRODUCT_RECEIVING_ERROR',message:error.message}));
    process.exitCode=1;
  });
