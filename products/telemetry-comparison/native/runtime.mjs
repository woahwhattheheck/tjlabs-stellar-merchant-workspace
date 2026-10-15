import {createHash} from "node:crypto";
export const runtime={
 sha256:value=>createHash("sha256").update(typeof value==="string"?Buffer.from(value,"utf8"):Buffer.from(value)).digest("hex"),
 encode:text=>new TextEncoder().encode(text),
 decode:bytes=>new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes),
 toBase64:bytes=>Buffer.from(bytes).toString("base64"),
 fromBase64:text=>{if(typeof text!=="string"||text.length%4!==0||/[^A-Za-z0-9+/=]/.test(text)||!/^={0,2}$/.test(text.slice(text.indexOf("=")<0?text.length:text.indexOf("="))))throw Error("Invalid Base64");const b=Buffer.from(text,"base64");if(b.toString("base64")!==text)throw Error("Noncanonical Base64");return new Uint8Array(b);}
};
