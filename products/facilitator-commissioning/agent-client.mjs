// SPDX-License-Identifier: MIT
// The caller supplies its existing authenticated Merchant tool transport.
export class CommissioningCustomerClient{
  constructor({callTool,instance}){if(typeof callTool!=='function'||typeof instance!=='string')throw new TypeError('Supply the original authenticated callTool and configured instance.');this.callTool=callTool;this.instance=instance;}
  invoke(action,args={}){return this.callTool('merchant_commissioning_'+action,{...args,instance:this.instance});}
  instances(){return this.callTool('merchant_commissioning_instances',{});}
  state(){return this.invoke('state');}
  installations(jobId){return this.invoke('installations',{jobId});}
  installation(input){return this.invoke('installation',input);}
  installationReceivings(jobId){return this.invoke('installation_receivings',{jobId});}
  installationReceiving(input){return this.invoke('installation_receiving',input);}
  release(releaseId){return this.invoke('release',{releaseId});}
  history(input){return this.invoke('history',input);}
  sourceBegin(upload){return this.invoke('source_begin',{upload});}
  sourceStatus(uploadId){return this.invoke('source_status',{uploadId});}
  sourceChunk({uploadId,offset,data}){return this.invoke('source_chunk',{uploadId,offset,data});}
  sourceComplete(uploadId){return this.invoke('source_complete',{uploadId});}
  sourceImport(source,uploadId){return this.invoke('source_import',{source,uploadId});}
  prepare(command){return this.invoke('prepare',{command});}
  apply(operationId){return this.invoke('apply',{operationId});}
  receive(operationId){return this.invoke('receive',{operationId});}
  pending(input={}){return this.invoke('pending',input);}
  capture(input){return this.invoke('capture',input);}
  manifest(captureId){return this.invoke('manifest',{captureId});}
  file(input){return this.invoke('file',input);}
  fileRelease(captureId,readId){return this.invoke('file_release',{captureId,readId});}
  receiveArchive(input){return this.invoke('receive_archive',input);}
  async allHistory({jobId,revision,kind='results'}){
    const items=[];let offset=0,total;
    for(;;){
      const page=await this.history({jobId,revision,kind,offset,limit:250});
      if(page.instance!==this.instance||page.jobId!==jobId||page.revision!==revision||page.offset!==offset||!Array.isArray(page.items)||
        !Number.isSafeInteger(page.total)||page.total<0||total!==undefined&&page.total!==total)
        throw new Error('The original complete history selection changed.');
      total=page.total;items.push(...page.items);
      if(page.next_offset===null){if(items.length!==total)throw new Error('The complete original history ended before its total.');return{instance:this.instance,jobId,revision,kind,items,total};}
      if(page.next_offset!==offset+page.items.length||page.next_offset<=offset||page.next_offset>=total)throw new Error('The original history cursor is inconsistent.');
      offset=page.next_offset;
    }
  }
}
