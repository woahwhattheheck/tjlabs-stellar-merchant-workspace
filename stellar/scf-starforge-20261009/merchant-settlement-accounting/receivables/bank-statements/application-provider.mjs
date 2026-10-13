// MIT. Bank reconciliation reopens the original accounting workspace through Applications.
import {resolve} from 'node:path';
import receivablesProvider from '../application-provider.mjs';
import {APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup} from '../../../distribution/runtime-workspace/application-provider.mjs';
const option = (args, name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'merchant-bank-statements', order: 523,
  catalog({common, field}) {
    return [{id:'merchant-bank-statements',command:'bank-statements',terminal:false,
      requiredSource:'stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/cli.mjs',
      title:'Bank statement reconciliation',
      description:'Import OFX, QFX and mapped CSV statements, reconcile customer receipts and refunds, review fees and corrections, and retain complete bank closes.',
      fields:[field('directory','Initialized private accounting workspace','path',true,
        'Reopen the existing accounting workspace and its issued customer invoices.'),...common]}];
  },
  prepare(type, settings, context) { return receivablesProvider.prepare(type,settings,context); },
  verifyLaunch(request) { return receivablesProvider.verifyLaunch(request); },
  matchRequest(request) { return !request.pythonCommand && request.command === 'bank-statements' && request.args?.[0] === 'serve'; },
  createObserver(request,directory) {
    return observeApplicationStartup(request,directory,text => {
      if (!text.startsWith('{"schema":"stellar-forge.merchant-bank-statements-startup.v1",')) return null;
      let ready, url;
      try { ready = JSON.parse(text); url = new URL(ready.url); } catch { return null; }
      const selected = option(request.args,'--directory'), port = Number(option(request.args,'--port') ?? 8448);
      if (!selected || ready.directory !== resolve(selected) ||
          ready.workspaceId !== option(request.args,'--expected-workspace-id') ||
          ready.sourcesSha256 !== option(request.args,'--expected-sources-sha256') ||
          url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/bank-statements/' ||
          url.search || url.hash || (port !== 0 && Number(url.port || 80) !== port)) return null;
      return {url:url.href,workspaceId:ready.workspaceId,
        original:{directory:ready.directory,sourcesSha256:ready.sourcesSha256},
        links:[{label:'Invoices and payments',url:new URL('/receivables/',url).href},
          {label:'Customers and statements',url:new URL('/customer-statements/',url).href}]};
    });
  },
};
