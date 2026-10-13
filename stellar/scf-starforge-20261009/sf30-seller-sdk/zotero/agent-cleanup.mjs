// MIT. Retry the same owned resources after failed startup or receiving.
export function retainZoteroCleanup(primary,resources){
 let pending=null;const remaining=resources.filter(Boolean);
 const handle={get active(){return remaining.length>0;},get summary(){return{admitted:false,cleanupPending:remaining.length>0};},requestClose(){},
  close(){if(pending)return pending;const attempt=(async()=>{while(remaining.length){await remaining[0].close();remaining.shift();}return{state:'CLOSED'};})();pending=attempt;void attempt.catch(()=>{if(pending===attempt)pending=null;});return attempt;}};
 Object.defineProperty(primary,'zoteroCleanup',{value:handle,configurable:true});
 return handle;
}
