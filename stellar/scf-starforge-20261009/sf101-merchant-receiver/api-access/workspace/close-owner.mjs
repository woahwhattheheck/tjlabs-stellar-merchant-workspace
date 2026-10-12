// MIT. Retain the same customer owner when startup or cleanup returns an error.
export function attachCloseRecovery(error,owner,phase){
 let failure=error instanceof Error?error:new Error(String(error));
 const properties={closeOwner:{value:owner,configurable:true},closePhase:{value:phase,configurable:true},
  recovery:{value:{close:options=>owner.close(options)},configurable:true}};
 try{Object.defineProperties(failure,properties);}
 catch{failure=new Error(error?.message??String(error),{cause:error});Object.defineProperties(failure,properties);}
 return failure;
}
