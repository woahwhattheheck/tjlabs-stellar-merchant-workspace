#!/usr/bin/env node
// MIT. Receive the whole original Comic Relief journey from a READY installed product.
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {installedSource, inspectPython, prepareProduct, statusProduct, options,
  productDirectory, nativeJSON, SDK_PATH} from './product.mjs';
import {absolute, canonical, digest, regular, readJSON, saveJSON, need, operationLease}
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
  const resultFile = join(directory,'customer-console-recovery.json');
  const initial = await statusProduct(product.directory);
  need(initial.console === 'CLOSED' || initial.console === 'RECOVERABLE',
    'GRANT_PRODUCT_CUSTOMER_CONSOLE_ACTIVE','Close this customer console before continuing its installed receiving.');
  need(initial.workspace.sources.length === 3 && initial.workspace.portfolios.length >= 1,
    'GRANT_PRODUCT_COMPLETE_CUSTOMER_REQUIRED');
  const selected = {schema:RECOVERY,operationId:OPERATION,workspaceId:product.workspaceId,
    workspaceDirectory:product.workspaceDirectory,bindingSha256:product.bindingSha256,
    sourceCommit:product.installation.sourceCommit,stateSha256:stateHash(initial.workspace)};
  await original(baselineFile,selected);
  const previous = await readJSON(resultFile,true);
  if (previous) {
    need(previous.schema === RECOVERY && previous.state === 'COMPLETED' &&
      same(previous.selected,selected) && initial.console === 'CLOSED' &&
      previous.resources?.closed === true,'GRANT_PRODUCT_CONSOLE_RECOVERY_CHANGED');
    return previous;
  }
  const sessions = [];
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const session of sessions) if (!session.closed) session.child.kill('SIGTERM');
  };
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  async function start() {
    need(!interrupted,'GRANT_PRODUCT_CONSOLE_RECOVERY_INTERRUPTED');
    const child = spawn(product.pythonExecutable,[
      join(product.installation.authoringDirectory,'cli.py'),'--workspace',product.workspaceDirectory,
      'serve','--port','0','--expected-binding',product.bindingSha256,
      '--connection-file',product.connectionFile],{shell:false,stdio:['ignore','pipe','pipe'],
      env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath,
        SF30_NDJSON_NODE:process.execPath,SF30_GRANT_PORTFOLIO_NODE:process.execPath}});
    const session = {child,closed:false};sessions.push(session);
    let accept,reject,output = '',outputBytes = 0;
    const ready = new Promise((yes,no) => {accept=yes;reject=no;});
    session.exit = new Promise(yes => {
      child.once('error',error => {session.closed=true;reject(error);yes({error:error.code ?? 'SPAWN_ERROR'});});
      child.once('close',(code,signal) => {session.closed=true;yes({code,signal});});
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk => {
      outputBytes += Buffer.byteLength(chunk);output += chunk;
      if (outputBytes > 32768) {reject(new Error('Original console startup exceeded its complete launch limit.'));return;}
      const newline = output.indexOf('\n');
      if (newline >= 0) {
        try {accept(JSON.parse(output.slice(0,newline)));}
        catch {reject(new Error('Original console did not return complete startup JSON.'));}
      }
    });
    // Drain the owned process without copying a private launch into public logs.
    child.stderr.resume();
    const launch = await deadline(Promise.race([ready,session.exit.then(() => {
      throw new Error('The original customer console stopped before readiness.');
    })]),90000,'The original customer console did not announce readiness.');
    need(launch.schema === 'stellar-forge.grant-portfolio-workspace-launch.v1' &&
      launch.status === 'GRANT_PORTFOLIO_WORKSPACE_READY' && launch.pid === child.pid &&
      launch.workspaceId === product.workspaceId && launch.bindingSha256 === product.bindingSha256 &&
      launch.connectionFile === product.connectionFile,'GRANT_PRODUCT_RECOVERY_LAUNCH_CHANGED');
    const active = await statusProduct(product.directory);
    need(active.console === 'RUNNING' && stateHash(active.workspace) === selected.stateSha256,
      'GRANT_PRODUCT_RECOVERY_CUSTOMER_CHANGED');
    session.connection = await nativeJSON(product,['connection','--file',product.connectionFile]);
    need(session.connection.writerActive === true && session.connection.exists === true,
      'GRANT_PRODUCT_RECOVERY_WRITER_REQUIRED');
    return session;
  }
  async function stop(session, signal) {
    if (!session.closed) session.child.kill(signal);
    return deadline(session.exit,30000,'The owned original console did not release its process.');
  }
  let first,second,killed,closed;
  try {
    first = await start();
    killed = await stop(first,'SIGKILL');
    need(killed.signal === 'SIGKILL','GRANT_PRODUCT_PROCESS_DEATH_NOT_OBSERVED');
    const retained = await statusProduct(product.directory);
    need(retained.console === 'RECOVERABLE' && retained.connection.exists === true &&
      retained.connection.writerActive === false &&
      retained.connection.sha256 === first.connection.sha256 &&
      stateHash(retained.workspace) === selected.stateSha256,
    'GRANT_PRODUCT_STOPPED_CONNECTION_CHANGED');
    second = await start();
    need(second.connection.sha256 !== first.connection.sha256,
      'GRANT_PRODUCT_CONNECTION_NOT_REPLACED');
    closed = await stop(second,'SIGTERM');
    need(closed.code === 0 && !closed.signal,'GRANT_PRODUCT_CONSOLE_CLOSE_INCOMPLETE');
    const final = await statusProduct(product.directory);
    need(!interrupted && final.console === 'CLOSED' &&
      stateHash(final.workspace) === selected.stateSha256,
    'GRANT_PRODUCT_RECOVERED_CUSTOMER_CHANGED');
    const result = {schema:RECOVERY,operationId:OPERATION,state:'COMPLETED',selected,
      killed:{pid:first.child.pid,signal:killed.signal,connectionSha256:first.connection.sha256},
      reopened:{pid:second.child.pid,exitCode:closed.code,connectionSha256:second.connection.sha256},
      preserved:{sources:final.workspace.sources.length,portfolios:final.workspace.portfolios.length,
        requests:final.workspace.requests.length,revision:final.workspace.revision,
        stateSha256:stateHash(final.workspace)},
      resources:{closed:true,consoleProcessesClosed:true,connectionRemoved:true}};
    await original(resultFile,result);return result;
  } finally {
    try {
      for (const session of [...sessions].reverse()) if (!session.closed) {
        try {await stop(session,'SIGTERM');}
        catch {await stop(session,'SIGKILL');}
      }
    } finally {process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
  }
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
