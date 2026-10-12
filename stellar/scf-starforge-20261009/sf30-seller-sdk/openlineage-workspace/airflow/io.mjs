import { promises as fs } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
export function need(condition, message) { if (!condition) throw new Error(message); }
export function ordinaryPath(root, name) {
  need(typeof name === "string" && name && !name.includes("\\") && !name.startsWith("/") &&
    name.split("/").every(x => x && x !== "." && x !== ".."), "Choose a relative ordinary package path");
  const result = resolve(root, name);
  need(!relative(resolve(root), result).startsWith(".."), "Package path escapes its directory");
  return result;
}
export async function readFile(path) {
  const stat = await fs.lstat(path);
  need(stat.isFile() && !stat.isSymbolicLink(), "Use the original ordinary file: " + path);
  return fs.readFile(path);
}
export async function readJSON(path) { return JSON.parse((await readFile(path)).toString("utf8")); }
export async function writeNew(path, bytes) {
  await fs.mkdir(dirname(path), {recursive:true, mode:0o700});
  const data=Buffer.from(bytes),temporary=path+".writing-"+randomUUID();
  const handle=await fs.open(temporary,"wx",0o600);
  try {await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
  try {await fs.link(temporary,path);}
  catch(e){if(e.code!=="EEXIST")throw e;need((await readFile(path)).equals(data),"Existing file has different contents: "+path);}
  finally{await fs.unlink(temporary);}
  return path;
}
export async function atomicJSON(path, value) {
  await fs.mkdir(dirname(path), {recursive:true, mode:0o700});
  const temporary = path + ".pending-" + randomUUID();
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(jsonBytes(value)); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temporary, path); }
  catch (e) { await fs.unlink(temporary).catch(()=>{}); throw e; }
}
export async function withDirectoryLock(directory, operation) {
  await fs.mkdir(directory, {recursive:true, mode:0o700});
  const path = join(directory, ".commission-lock.sqlite3");
  const handle = await fs.open(path, "a", 0o600);
  await handle.close();
  const stat = await fs.lstat(path);
  need(stat.isFile() && !stat.isSymbolicLink(), "Commissioning lock must be an ordinary private file");
  const lock = new DatabaseSync(path);
  let acquired = false;
  try {
    lock.exec("PRAGMA busy_timeout=0");
    try { lock.exec("BEGIN IMMEDIATE"); acquired = true; }
    catch (error) {
      if (error.errcode === 5 || error.errcode === 6 || /database (is )?(locked|busy)/i.test(error.message))
        throw new Error("Another process is updating this commissioning directory; receive its original result before continuing");
      throw error;
    }
    return await operation();
  } finally {
    try { if (acquired) lock.exec("ROLLBACK"); } finally { lock.close(); }
  }
}
export function html(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
