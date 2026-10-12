import { createPlan,savePlan } from "./plan.mjs";
import { connectionClient,beginSession,captureSession,compareSessions } from "./client.mjs";
import { exportHandover,receiveHandover } from "./handover.mjs";
import { readJSON,readFile,need } from "./io.mjs";
export const AIRFLOW_TOOLS=[
  {name:"airflow_plan",description:"Compile native Airflow provider configuration from original environment and workspace observations"},
  {name:"airflow_begin",description:"Save the original event baseline before executing the selected DAGs"},
  {name:"airflow_review",description:"Review received native DAG/task events and save their full edition"},
  {name:"airflow_compare",description:"Compare two complete saved commissioning editions"},
  {name:"airflow_export",description:"Export the original workspace and complete Airflow operating handover"},
  {name:"airflow_receive",description:"Receive a full Airflow handover and reopen its original workspace"}
];
export function createAirflowOperator({resolveInput,resolveDirectory,resolveOutput,readToken=async()=>null}) {
  need(typeof resolveInput==="function"&&typeof resolveDirectory==="function"&&typeof resolveOutput==="function","Supply the maintained host's existing input/directory/output alias resolvers");
  return {
    tools:AIRFLOW_TOOLS,
    async invoke(name,args={}) {
      if(name==="airflow_plan"){
        const environment=await readJSON(await resolveInput(args.environment)),connection=await readJSON(await resolveInput(args.connection));
        return args.directory?savePlan(environment,connection,args.options,await resolveDirectory(args.directory)):createPlan(environment,connection,args.options);
      }
      if(name==="airflow_receive")return receiveHandover(await readFile(await resolveInput(args.input)),await resolveOutput(args.destination));
      const directory=await resolveDirectory(args.directory),plan=await readJSON(await resolveInput(args.plan));
      const client=connectionClient(plan,{token:await readToken(args.token)});
      if(name==="airflow_begin")return beginSession(client,plan,directory,{sessionId:args.sessionId});
      if(name==="airflow_review")return captureSession(client,plan,directory,{sessionId:args.sessionId,title:args.title,
        execution:args.execution?await readJSON(await resolveInput(args.execution)):null,runIds:args.runIds??{}});
      if(name==="airflow_compare")return compareSessions(client,directory,args.first,args.second);
      if(name==="airflow_export")return exportHandover(client,directory,await resolveOutput(args.output));
      throw new Error("Unknown Airflow operator action");
    }
  };
}
