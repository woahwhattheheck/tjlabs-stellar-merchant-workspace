/* SPDX-License-Identifier: MIT */
(function (root) {
  "use strict";
  class NumberToken { constructor(text) { this.text = text; Object.freeze(this); } }
  function parse(text) {
    if (typeof text !== "string" || text.length > 1048576) throw Error("The complete response exceeds the supported size.");
    let at = 0;
    const ws = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
    function string() {
      const start = at++;
      let escaped = false;
      while (at < text.length) {
        const c = text.charCodeAt(at++);
        if (!escaped && c === 34) {
          const value = JSON.parse(text.slice(start, at));
          for (let i = 0; i < value.length; i++) {
            const u = value.charCodeAt(i);
            if (u >= 0xD800 && u <= 0xDBFF) {
              const v = value.charCodeAt(++i);
              if (!(v >= 0xDC00 && v <= 0xDFFF)) throw Error("An unpaired Unicode surrogate is not allowed.");
            } else if (u >= 0xDC00 && u <= 0xDFFF) throw Error("An unpaired Unicode surrogate is not allowed.");
          }
          return value;
        }
        if (!escaped && c < 32) throw Error("A string contains an unescaped control character.");
        if (!escaped && c === 92) escaped = true; else escaped = false;
      }
      throw Error("A response string is incomplete.");
    }
    function value(depth) {
      if (depth > 64) throw Error("The response nesting exceeds 64 levels.");
      ws(); const c = text[at];
      if (c === '"') return string();
      if (c === "{") {
        at++; ws(); const result = Object.create(null);
        if (text[at] === "}") { at++; return result; }
        while (at < text.length) {
          ws(); if (text[at] !== '"') throw Error("An object key is missing.");
          const key = string(); ws(); if (text[at++] !== ":") throw Error("An object separator is missing.");
          if (Object.prototype.hasOwnProperty.call(result, key)) throw Error("The response repeats a JSON key.");
          result[key] = value(depth + 1); ws();
          if (text[at] === "}") { at++; return result; }
          if (text[at++] !== ",") throw Error("An object is incomplete.");
        }
      } else if (c === "[") {
        at++; ws(); const result = [];
        if (text[at] === "]") { at++; return result; }
        while (at < text.length) {
          result.push(value(depth + 1)); ws();
          if (text[at] === "]") { at++; return result; }
          if (text[at++] !== ",") throw Error("An array is incomplete.");
        }
      } else {
        for (const [literal, actual] of [["true", true], ["false", false], ["null", null]]) {
          if (text.slice(at, at + literal.length) === literal) { at += literal.length; return actual; }
        }
        const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
        if (match && match.index === 0) { at += match[0].length; return new NumberToken(match[0]); }
      }
      throw Error("The complete response contains invalid JSON.");
    }
    const result = value(0); ws(); if (at !== text.length) throw Error("Unexpected trailing response text.");
    return result;
  }
  function stringify(value, pretty = false) {
    function write(v, depth) {
      if (depth > 64) throw Error("The selected source is too deeply nested.");
      if (v === null) return "null";
      if (v === true || v === false) return String(v);
      if (v instanceof NumberToken) return v.text;
      if (typeof v === "number" && Number.isSafeInteger(v)) return String(v);
      if (typeof v === "string") return JSON.stringify(v);
      const indent = pretty ? "  ".repeat(depth) : "", next = pretty ? "\n" + "  ".repeat(depth + 1) : "";
      const sep = pretty ? ",\n" + "  ".repeat(depth + 1) : ",";
      if (Array.isArray(v)) return v.length ? "[" + next + v.map(x => write(x, depth + 1)).join(sep) + (pretty ? "\n" + indent : "") + "]" : "[]";
      if (!v || typeof v !== "object") throw Error("Use the complete supported JSON types.");
      const keys = Object.keys(v).sort();
      return keys.length ? "{" + next + keys.map(k => JSON.stringify(k) + (pretty ? ": " : ":") + write(v[k], depth + 1)).join(sep) + (pretty ? "\n" + indent : "") + "}" : "{}";
    }
    return write(value, 0);
  }
  function integer(value, name = "revision") {
    const token = value instanceof NumberToken ? value.text : String(value);
    if (!/^(?:0|[1-9][0-9]*)$/.test(token)) throw Error("The " + name + " is not an exact nonnegative integer.");
    const result = Number(token);
    if (!Number.isSafeInteger(result) || result > 2147483647) throw Error("The " + name + " is outside the native revision range.");
    return result;
  }
  function display(value) { return value instanceof NumberToken ? value.text : value === null ? "Not supplied" : typeof value === "object" ? stringify(value, true) : String(value); }
  root.TJLabsStaffJson = Object.freeze({parse, stringify, integer, display, NumberToken});
})(window);
