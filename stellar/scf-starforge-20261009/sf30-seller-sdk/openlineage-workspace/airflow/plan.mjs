import { producerConfiguration } from "../producer.mjs";
import { canonical, sha256, jsonBytes, need, readJSON, writeNew } from "./io.mjs";
import { join } from "node:path";
import { promises as fs } from "node:fs";
export const PLAN_SCHEMA = "commons.openlineage.airflow-plan.v1";
export const PROVIDER_VERSION = "2.20.2";
export const SOURCES = Object.freeze([
  "https://airflow.apache.org/docs/apache-airflow-providers-openlineage/2.20.2/index.html",
  "https://airflow.apache.org/docs/apache-airflow-providers-openlineage/2.20.2/configurations-ref.html",
  "https://airflow.apache.org/docs/apache-airflow-providers-openlineage/2.20.2/emission_policy.html",
  "https://airflow.apache.org/docs/apache-airflow/2.11.0/cli-and-env-variables-ref.html",
  "https://airflow.apache.org/docs/apache-airflow/3.3.1/cli-and-env-variables-ref.html"
]);
const identifier = (value, field) => {
  need(typeof value === "string" && /^[A-Za-z0-9_.:-]{1,240}$/.test(value), field + " must be a nonempty identifier");
  return value;
};
function version(value, field) {
  need(typeof value === "string" && /^\d+\.\d+\.\d+(?:[a-zA-Z0-9.+-]*)$/.test(value), "Use the installed " + field + " version");
  return value.match(/^\d+\.\d+\.\d+/)[0].split(".").map(Number);
}
function ge(a,b) { for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true; }
export function validatePolicy(rules) {
  need(Array.isArray(rules), "Emission policy must be an array of native Apache provider rules");
  const controls = new Set(["emit","emit_task_events","emit_dag_events","extract_operator_metadata","include_source_code","hook_lineage","include_full_task_info"]);
  for (const rule of rules) {
    need(rule && typeof rule === "object" && !Array.isArray(rule), "Each emission rule must be an object");
    need(Object.keys(rule).every(k=>["scope","controls","match_mode","locked"].includes(k)), "Unknown provider policy property");
    need(rule.scope && typeof rule.scope === "object" && !Array.isArray(rule.scope), "Each rule requires a scope");
    const keys=Object.keys(rule.scope);
    need(keys.every(k=>["operator","dag_id","task_id"].includes(k)), "Unknown native policy scope");
    need(!(keys.includes("operator") && keys.length>1) && (!keys.includes("task_id") || keys.includes("dag_id")), "Use global, operator, DAG, or DAG/task scope");
    for(const value of Object.values(rule.scope)) need(typeof value==="string" && value.length>0 && !/[\r\n\0]/.test(value), "Use a single-line scope value");
    need(rule.match_mode===undefined || ["exact","regex"].includes(rule.match_mode), "Native match_mode is exact or regex");
    need(rule.locked===undefined || typeof rule.locked==="boolean", "Native locked property is boolean");
    need(rule.controls && Object.keys(rule.controls).length && Object.entries(rule.controls).every(([k,v])=>controls.has(k)&&typeof v==="boolean"), "Use the documented boolean emission controls");
  }
  return structuredClone(rules);
}
function packageVersion(observation,name) {
  const value=observation.packages?.[name];
  return typeof value==="string"?value:value?.version;
}
export function createPlan(observation, connection, options={}) {
  need(observation?.schema==="commons.openlineage.airflow-environment.v1", "Use the environment inspector's original JSON");
  const airflowVersion=options.airflowVersion ?? observation.airflowVersion ?? packageVersion(observation,"apache-airflow");
  const major=version(airflowVersion,"Airflow");
  need(ge(major,[2,11,0]), "Apache provider 2.20.2 requires Airflow 2.11.0 or later");
  const pythonVersion=options.pythonVersion ?? observation.pythonVersion ?? observation.python?.version;
  version(pythonVersion,"Python");
  const operationId=identifier(options.operationId,"operationId");
  const namespace=options.namespace;
  need(typeof namespace==="string"&&namespace.trim()&&namespace.length<=2048&&!/[\r\n\0]/.test(namespace),"Use the actual Airflow namespace");
  const mode=options.mode??"connection";
  need(["connection","environment"].includes(mode),"Choose connection or environment configuration");
  const connectionId=identifier(options.connectionId??"commons_openlineage","connectionId");
  need(/^[A-Za-z][A-Za-z0-9_]*$/.test(connectionId),"Airflow connection ID must map unambiguously to AIRFLOW_CONN_<ID>");
  const tokenEnv=options.tokenEnv??"COMMONS_OPENLINEAGE_TOKEN";
  need(/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv),"Use an environment variable name for the host token");
  const transport=producerConfiguration(connection,{compression:options.compression??"gzip",timeoutSeconds:options.timeoutSeconds??10,client:"python"}).transport;
  if(options.useAuthentication!==false)transport.auth={type:mode==="connection"?"airflow_connection_api_key":"api_key"};
  const dags=structuredClone(options.dags??[]);
  need(dags.length>0,"Select the original DAGs and logical dates to commission");
  const identities=new Set();
  for(const dag of dags){
    identifier(dag.dagId,"dagId");
    need(typeof dag.logicalDate==="string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(dag.logicalDate)&&Number.isFinite(Date.parse(dag.logicalDate)), "Each DAG needs its complete timezone-qualified logical date");
    const key=dag.dagId+"\n"+new Date(dag.logicalDate).toISOString();
    need(!identities.has(key),"The same DAG/logical date appears twice");identities.add(key);
    need(dag.runId===undefined||dag.runId===null||dag.runId==="","The native dags test command returns its actual run ID; bind that ID in the received review");
    dag.expectedTerminal??="COMPLETE";
    need(["COMPLETE","FAIL","ABORT"].includes(dag.expectedTerminal),"Expected DAG terminal is COMPLETE, FAIL or ABORT");
    if(dag.taskIds!==undefined)need(Array.isArray(dag.taskIds)&&dag.taskIds.every(x=>typeof x==="string"&&x.length>0)&&new Set(dag.taskIds).size===dag.taskIds.length,"Task IDs must be unique original identifiers");
  }
  // Target the reviewed cohort. This is actual Apache policy, evaluated by the provider.
  const policy=validatePolicy(options.emissionPolicy??[
    {scope:{},controls:{emit:false,include_source_code:false}},
    ...[...new Set(dags.map(d=>d.dagId))].map(dag_id=>({scope:{dag_id},controls:{emit:true}}))
  ]);
  const environment={
    AIRFLOW__OPENLINEAGE__CONFIG_CONN_ID:mode==="connection"?connectionId:"",
    AIRFLOW__OPENLINEAGE__CONFIG_PATH:"",
    AIRFLOW__OPENLINEAGE__NAMESPACE:namespace,
    AIRFLOW__OPENLINEAGE__DISABLED:"False",
    AIRFLOW__OPENLINEAGE__DEBUG_MODE:"False",
    AIRFLOW__OPENLINEAGE__EXECUTE_IN_THREAD:"True",
    AIRFLOW__OPENLINEAGE__EXECUTION_TIMEOUT:String(options.executionTimeoutSeconds??10),
    AIRFLOW__OPENLINEAGE__EMISSION_POLICY:JSON.stringify(policy)
  };
  if(mode==="environment")environment.AIRFLOW__OPENLINEAGE__TRANSPORT=JSON.stringify(transport);
  const plan={
    schema:PLAN_SCHEMA,operationId,title:options.title??"Airflow commissioning",createdAt:options.createdAt??new Date().toISOString(),
    providerVersion:PROVIDER_VERSION,airflowVersion,pythonVersion,
    observationSha256:sha256(jsonBytes(observation)),observation:structuredClone(observation),
    connection:{schema:connection.schema,workspaceId:connection.workspaceId,instanceId:connection.instanceId,url:connection.url},
    namespace,configuration:{mode,connectionId,tokenEnv,transport,environment,emissionPolicy:policy},
    dags,execution:{mode:"dag-test",timeoutSeconds:options.runTimeoutSeconds??3600,continueOnFailure:options.continueOnFailure??false},
    sourceReferences:[...SOURCES]
  };
  validatePlan(plan);return plan;
}
export function validatePlan(plan) {
  need(plan?.schema===PLAN_SCHEMA,"Use an original Airflow commissioning plan");
  identifier(plan.operationId,"operationId");need(plan.providerVersion===PROVIDER_VERSION,"Use this package's pinned Apache provider edition");
  need(ge(version(plan.airflowVersion,"Airflow"),[2,11,0]),"Airflow is older than the provider requirement");
  version(plan.pythonVersion,"Python");
  need(plan.configuration&&["connection","environment"].includes(plan.configuration.mode),"Unknown configuration mode");
  producerConfiguration(plan.connection,{compression:plan.configuration.transport?.compression??"identity"});
  const expected=producerConfiguration(plan.connection,{compression:plan.configuration.transport?.compression??"identity",timeoutSeconds:plan.configuration.transport?.timeout??10}).transport;
  const actual=structuredClone(plan.configuration.transport);delete actual.auth;
  need(canonical(actual)===canonical(expected),"Transport must target the original collector and workspace with the native Python transport contract");
  need(!plan.configuration.transport.auth || canonical(plan.configuration.transport.auth)===canonical({type:plan.configuration.mode==="connection"?"airflow_connection_api_key":"api_key"}),"Keep tokens in the host connection password or token environment variable");
  validatePolicy(plan.configuration.emissionPolicy);
  need(Array.isArray(plan.dags)&&plan.dags.length>0,"The plan requires original DAG selections");
  need(Number.isSafeInteger(plan.execution?.timeoutSeconds)&&plan.execution.timeoutSeconds>0&&typeof plan.execution.continueOnFailure==="boolean"&&plan.execution.mode==="dag-test","Use the native full-DAG execution selection");
  need(typeof plan.configuration.tokenEnv==="string"&&/^[A-Z_][A-Z0-9_]*$/.test(plan.configuration.tokenEnv),"Use a token environment variable name");
  need(!/(?:apiKey|password|accessToken)"\s*:/.test(JSON.stringify(plan)),"Plan files must contain credential references only");
  return plan;
}
export function installationFiles(plan) {
  validatePlan(plan);
  const python=plan.pythonVersion.match(/^\d+\.\d+/)[0];
  return {
    "requirements-airflow.txt":"apache-airflow=="+plan.airflowVersion+"\napache-airflow-providers-openlineage=="+plan.providerVersion+"\n",
    "connection.example.json":JSON.stringify({conn_type:"generic",description:plan.title,extra:{transport:plan.configuration.transport}},null,2)+"\n",
    "environment.json":JSON.stringify(plan.configuration.environment,null,2)+"\n",
    "installation.json":JSON.stringify({
      schema:"commons.openlineage.airflow-installation.v1",pythonVersion:plan.pythonVersion,
      airflowVersion:plan.airflowVersion,providerVersion:plan.providerVersion,
      commands:[
        ["python","-m","pip","install","apache-airflow=="+plan.airflowVersion,"--constraint","https://raw.githubusercontent.com/apache/airflow/constraints-"+plan.airflowVersion+"/constraints-"+python+".txt"],
        ["python","-m","pip","install","apache-airflow=="+plan.airflowVersion,"apache-airflow-providers-openlineage=="+plan.providerVersion]
      ],
      existingEnvironment:"Use the customer's original approved virtual environment or image; the executor performs no installation.",
      deployment:"Apply identical provider settings to each scheduler and worker that emits this cohort. Restart those services using their existing deployment mechanism after a persistent configuration change."
    },null,2)+"\n"
  };
}

export async function savePlan(observation,connection,selection,directory) {
  let prior=null;try{prior=await readJSON(join(directory,"plan.json"));}catch(e){if(e.code!=="ENOENT")throw e;}
  const plan=createPlan(observation,connection,{...selection,...(prior?{createdAt:prior.createdAt}:{})});
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  await writeNew(join(directory,"plan.json"),jsonBytes(plan));
  await writeNew(join(directory,"environment-observation.json"),jsonBytes(observation));
  await writeNew(join(directory,"selection.json"),jsonBytes(selection));
  for(const [name,text] of Object.entries(installationFiles(plan)))await writeNew(join(directory,name),Buffer.from(text));
  return {directory,planSha256:sha256(jsonBytes(plan)),operationId:plan.operationId,providerVersion:plan.providerVersion};
}
