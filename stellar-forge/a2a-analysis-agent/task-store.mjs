// SPDX-License-Identifier: MIT
// Persistence remains in the official SDK store. This decorator only lets an executor
// await the SDK ResultManager's completed save before invoking the native analysis service.
import {DatabaseTaskStore} from '@a2a-js/sdk/server/database';
import {randomUUID} from 'node:crypto';
import {need} from './config.mjs';

export const scopeKey=(context,id)=>JSON.stringify([context?.tenant??'',context?.user?.userName??'unknown',id]);
export class CommittedTaskStore {
  constructor(database,{assertHeld=()=>{},sqlite}={}){this.original=new DatabaseTaskStore(database);this.waiters=new Map();this.assertHeld=assertHeld;this.sqlite=sqlite;}
  load(id,context){this.assertHeld();return this.original.load(id,context);}
  list(request,context){this.assertHeld();return this.original.list(request,context);}
  async save(task,context){
    this.assertHeld();await this.original.save(task,context);
    const key=scopeKey(context,task.id),waiters=this.waiters.get(key);
    for(const waiter of [...(waiters??[])])if(task.metadata?.analysisEventId===waiter.id)waiter.finish(undefined,task);
  }
  async findInitialMessage(messageId,context){
    this.assertHeld();need(this.sqlite,'A2A_ANALYSIS_SQLITE_REQUIRED');
    const ids=this.sqlite.prepare("SELECT id FROM tasks WHERE tenant=? AND owner=? AND json_extract(history,'$[0].messageId')=? LIMIT 2")
      .all(context?.tenant??'',context?.user?.userName??'unknown',messageId);
    need(ids.length<=1,'A2A_ANALYSIS_MESSAGE_ID_COLLISION');
    return ids.length?this.load(ids[0].id,context):undefined;
  }
  async publish(event,eventBus,context,{timeoutMs=30000}={}){
    const id=randomUUID(),data=event.data,taskId=event.kind==='task'?data.id:data.taskId;
    need(taskId&&['task','statusUpdate','artifactUpdate'].includes(event.kind),'A2A_ANALYSIS_PERSISTABLE_EVENT_REQUIRED');
    const annotated={...event,data:{...data,metadata:{...data.metadata,analysisEventId:id}}};
    const key=scopeKey(context,taskId);
    return new Promise((resolve,reject)=>{
      const set=this.waiters.get(key)??new Set();this.waiters.set(key,set);
      let timer;
      const waiter={id,finish:(error,task)=>{
        clearTimeout(timer);set.delete(waiter);if(set.size===0)this.waiters.delete(key);
        if(error)reject(error);else resolve(task);
      }};
      set.add(waiter);
      timer=setTimeout(()=>waiter.finish(new Error('A2A_ANALYSIS_TASK_SAVE_TIMEOUT')),timeoutMs);
      timer.unref?.();
      try{eventBus.publish(annotated);}catch(error){waiter.finish(error);}
    });
  }
}
