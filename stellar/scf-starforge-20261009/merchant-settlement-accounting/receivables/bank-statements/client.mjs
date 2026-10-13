// SPDX-License-Identifier: MIT
import {ReceivablesClient} from '../client.mjs';
const segment=value=>{const s=String(value??'');if(!s||s==='.'||s==='..')throw new TypeError('Choose an original bank record.');return encodeURIComponent(s);};
const query=value=>{const q=new URLSearchParams();for(const [key,item]of Object.entries(value??{}))if(item!==undefined&&item!==null&&item!=='')q.set(key,String(item));return q.size?'?'+q:'';};
/** Every mutation preserves its caller-supplied original request ID and is attempted once. */
export class BankStatementsClient extends ReceivablesClient {
  constructor({baseUrl='/api/receivables/bank-statements',...options}={}){super({baseUrl,...options});}
  state(options={}){return this.request('/state',options);}
  previewSource(value,options={}){return this.request('/source-preview',{...options,method:'POST',body:value});}
  saveAccount(value,options={}){return this.request('/accounts',{...options,method:'POST',body:value});}
  receiveSource(value,options={}){return this.request('/imports',{...options,method:'POST',body:value});}
  transactions(filters={},options={}){return this.request('/transactions'+query(filters),options);}
  detail(id,options={}){return this.request('/transactions/'+segment(id),options);}
  importDetail(id,options={}){return this.request('/imports/'+segment(id),options);}
  importFile(id,name,options={}){return this.request('/imports/'+segment(id)+'/files/'+segment(name),{...options,binary:true});}
  match(id,value,options={}){return this.request('/transactions/'+segment(id)+'/match',{...options,method:'POST',body:value});}
  receiveReceipt(id,value,options={}){return this.request('/transactions/'+segment(id)+'/receipt',{...options,method:'POST',body:value});}
  undo(id,value,options={}){return this.request('/transactions/'+segment(id)+'/undo',{...options,method:'POST',body:value});}
  resolve(id,value,options={}){return this.request('/transactions/'+segment(id)+'/resolve',{...options,method:'POST',body:value});}
  previewAssembly(value,options={}){return this.request('/assembly-preview',{...options,method:'POST',body:value});}
  previewClose(value,options={}){return this.request('/close-preview',{...options,method:'POST',body:value});}
  retainClose(value,options={}){return this.request('/closes',{...options,method:'POST',body:value});}
  closeDetail(id,options={}){return this.request('/closes/'+segment(id),options);}
  closeFile(id,name,options={}){return this.request('/closes/'+segment(id)+'/files/'+segment(name),{...options,binary:true});}
  reopenClose(id,value,options={}){return this.request('/closes/'+segment(id)+'/reopen',{...options,method:'POST',body:value});}
  getOperation(id,options={}){return this.request('/operations/'+segment(id),options);}
}
export const createBankStatementsClient=options=>new BankStatementsClient(options);
