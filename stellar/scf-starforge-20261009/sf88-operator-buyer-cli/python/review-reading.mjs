// MIT — Python research actions share the original library and search writers.
import {openContentSearch} from '../resource-library/content-search/engine.mjs';
import {openReadingExchange} from '../resource-library/reading-exchange/exchange.mjs';
import {requireValue} from '../resource-library/files.mjs';

export const researchActions=['research.status','research.index','research.search','research.saved',
  'research.save','research.capture','research.prepare','research.handovers','research.operation'];
export function createResearchBinding(library){
  let initializing=null,search=null,exchange=null,closed=false;const jobs=new Set();
  const ready=()=>initializing??=(async()=>{search=await openContentSearch(library);exchange=await openReadingExchange(search);return {search,exchange};})();
  async function dispatch(action,value,signal){
    requireValue(!closed,'READING_EXCHANGE_CLOSED',409);
    const owned=await ready();
    switch(action){
      case 'research.status':return owned.search.status();
      case 'research.index':{
        const job=owned.search.index({signal});jobs.add(job);try{return await job;}finally{jobs.delete(job);}
      }
      case 'research.search':return owned.search.search(value);
      case 'research.saved':return owned.search.listSaved();
      case 'research.save':return owned.search.saveQuery(value);
      case 'research.capture':return owned.exchange.capture(value);
      case 'research.prepare':return owned.exchange.prepare(value,{signal});
      case 'research.handovers':return owned.exchange.status();
      case 'research.operation':return owned.exchange.operation(value.operationId);
      default:requireValue(false,'RESEARCH_ACTION_INVALID');
    }
  }
  return {dispatch,async download(id,signal){const owned=await ready();return owned.exchange.download(id,{signal});},
    async close(){if(closed)return;closed=true;if(initializing)await initializing.catch(()=>{});
      search?.cancel();await Promise.allSettled([...jobs]);await exchange?.close();search?.close();}};
}
