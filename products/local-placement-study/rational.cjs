'use strict';
function ok(v,m,p){if(!v)throw Error((p?p+': ':'')+m);}
function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const r=a%b;a=b;b=r;}return a||1n;}
function R(n,d=1n){ok(d!==0n,'Undefined division');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return{n:n/g,d:d/g};}
function dec(x,p='number'){ok(typeof x==='string'&&/^-?(0|[1-9]\d*)(\.\d{1,18})?$/.test(x)&&x.length<=90,'Use a decimal string with at most18 fractional places; no exponent',p);const neg=x[0]==='-',t=neg?x.slice(1):x,parts=t.split('.');return R(BigInt(parts.join(''))*(neg?-1n:1n),10n**BigInt(parts[1]?.length||0));}
const add=(a,b)=>R(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>R(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a,b)=>R(a.n*b.n,a.d*b.d),div=(a,b)=>b.n===0n?null:R(a.n*b.d,a.d*b.n),zero=()=>R(0n),hundred=()=>R(100n),cmp=(a,b)=>a.n*b.d-b.n*a.d;
function display(r,places=12){if(r===null)return null;const neg=r.n<0n,n=neg?-r.n:r.n,scale=10n**BigInt(places),q=(n*scale*2n+r.d)/(2n*r.d),s=q.toString().padStart(places+1,'0'),out=places?s.slice(0,-places)+'.'+s.slice(-places):s;return(neg&&q?'−':'')+(places?out.replace(/\.?0+$/,''):out).replace(/^$/,'0');}
function value(r){if(r===null)return null;return{numerator:r.n.toString(),denominator:r.d.toString(),decimal:display(r)};}
const sum=a=>a.reduce(add,zero());

module.exports={R,dec,add,sub,mul,div,zero,hundred,cmp,display,value,sum};
