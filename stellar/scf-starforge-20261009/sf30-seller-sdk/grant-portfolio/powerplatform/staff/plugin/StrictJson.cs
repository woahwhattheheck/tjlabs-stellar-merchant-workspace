// SPDX-License-Identifier: MIT
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace TJLabs.GrantStaff
{
    // The transport retains decimal tokens as text. No financial value passes through double.
    internal sealed class JsonNumber
    {
        internal readonly string Text;
        internal JsonNumber(string text) { Text = text; }
    }

    internal static class Json
    {
        private static readonly Regex Number = new Regex(@"\A-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\z", RegexOptions.CultureInvariant);
        internal static object Parse(string text, int maximum = 1048576)
        {
            if (text == null || Encoding.UTF8.GetByteCount(text) > maximum)
                throw new ArgumentException("The complete JSON input exceeds its declared limit.");
            var parser = new Reader(text);
            var value = parser.Value(0);
            parser.Space();
            if (parser.Position != text.Length) throw new ArgumentException("Unexpected trailing JSON data.");
            return value;
        }
        internal static Dictionary<string, object> Object(object value, string name)
        {
            var result = value as Dictionary<string, object>;
            if (result == null) throw new ArgumentException(name + " must be an object.");
            return result;
        }
        internal static List<object> Array(object value, string name)
        {
            var result = value as List<object>;
            if (result == null) throw new ArgumentException(name + " must be an array.");
            return result;
        }
        internal static string String(object value, string name, int maximum, bool empty = false)
        {
            var result = value as string;
            if (result == null || result.Length > maximum || (!empty && System.String.IsNullOrWhiteSpace(result)))
                throw new ArgumentException(name + " must contain " + (empty ? "0" : "1") + " to " + maximum + " characters.");
            Unicode(result);
            return result;
        }
        internal static object Get(Dictionary<string, object> value, string key, bool required = true)
        {
            object result;
            if (value.TryGetValue(key, out result)) return result;
            if (required) throw new ArgumentException("Missing JSON member: " + key);
            return null;
        }
        internal static void Shape(Dictionary<string, object> value, string[] allowed, string[] required)
        {
            var names = new HashSet<string>(allowed, StringComparer.Ordinal);
            foreach (var key in value.Keys)
                if (!names.Contains(key)) throw new ArgumentException("Unknown JSON member: " + key);
            foreach (var key in required)
                if (!value.ContainsKey(key)) throw new ArgumentException("Missing JSON member: " + key);
        }
        internal static int Integer(object value, string name, int minimum = 0, int maximum = Int32.MaxValue)
        {
            var token = value as JsonNumber;
            int number;
            if (token == null || !Int32.TryParse(token.Text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out number)
                || number < minimum || number > maximum)
                throw new ArgumentException(name + " must be an exact integer in range.");
            return number;
        }
        internal static string Write(object value)
        {
            var output = new StringBuilder();
            Append(output, value, 0);
            return output.ToString();
        }
        private static void Append(StringBuilder output, object value, int depth)
        {
            if (depth > 64) throw new ArgumentException("JSON nesting exceeds 64 levels.");
            if (value == null) { output.Append("null"); return; }
            if (value is bool) { output.Append((bool)value ? "true" : "false"); return; }
            if (value is string) { Quote(output, (string)value); return; }
            var number = value as JsonNumber;
            if (number != null)
            {
                if (!Number.IsMatch(number.Text)) throw new ArgumentException("Invalid retained JSON number.");
                output.Append(number.Text); return;
            }
            if (value is int || value is long)
            {
                output.Append(Convert.ToString(value, CultureInfo.InvariantCulture)); return;
            }
            var record = value as IDictionary<string, object>;
            if (record != null)
            {
                output.Append('{');
                var keys = new List<string>(record.Keys); keys.Sort(StringComparer.Ordinal);
                bool first = true;
                foreach (var key in keys)
                {
                    if (!first) output.Append(',');
                    first = false; Quote(output, key); output.Append(':'); Append(output, record[key], depth + 1);
                }
                output.Append('}'); return;
            }
            var list = value as System.Collections.IEnumerable;
            if (list != null)
            {
                output.Append('['); bool first = true;
                foreach (var item in list)
                {
                    if (!first) output.Append(',');
                    first = false; Append(output, item, depth + 1);
                }
                output.Append(']'); return;
            }
            throw new ArgumentException("Unsupported JSON value type: " + value.GetType().FullName);
        }
        private static void Unicode(string text)
        {
            for (int i = 0; i < text.Length; ++i)
            {
                if (Char.IsHighSurrogate(text[i]))
                {
                    if (++i >= text.Length || !Char.IsLowSurrogate(text[i]))
                        throw new ArgumentException("An unpaired Unicode surrogate is not permitted.");
                }
                else if (Char.IsLowSurrogate(text[i]))
                    throw new ArgumentException("An unpaired Unicode surrogate is not permitted.");
            }
        }
        private static void Quote(StringBuilder output, string text)
        {
            Unicode(text); output.Append('"');
            foreach (var c in text)
            {
                switch (c)
                {
                    case '"': output.Append("\\\""); break;
                    case '\\': output.Append("\\\\"); break;
                    case '\b': output.Append("\\b"); break;
                    case '\f': output.Append("\\f"); break;
                    case '\n': output.Append("\\n"); break;
                    case '\r': output.Append("\\r"); break;
                    case '\t': output.Append("\\t"); break;
                    default:
                        if (c < 0x20) output.Append("\\u" + ((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else output.Append(c);
                        break;
                }
            }
            output.Append('"');
        }
        private sealed class Reader
        {
            private readonly string text;
            internal int Position;
            internal Reader(string text) { this.text = text; }
            internal void Space()
            {
                while (Position < text.Length && (text[Position] == ' ' || text[Position] == '\r'
                    || text[Position] == '\n' || text[Position] == '\t')) ++Position;
            }
            private void Need(char expected)
            {
                Space();
                if (Position >= text.Length || text[Position++] != expected)
                    throw new ArgumentException("Expected JSON " + expected + ".");
            }
            internal object Value(int depth)
            {
                if (depth > 64) throw new ArgumentException("JSON nesting exceeds 64 levels.");
                Space();
                if (Position >= text.Length) throw new ArgumentException("Unexpected end of JSON.");
                char c = text[Position];
                if (c == '"') return Text();
                if (c == '{')
                {
                    ++Position; Space();
                    var value = new Dictionary<string, object>(StringComparer.Ordinal);
                    if (Position < text.Length && text[Position] == '}') { ++Position; return value; }
                    while (true)
                    {
                        Space(); string key = Text(); Need(':');
                        if (value.ContainsKey(key)) throw new ArgumentException("Duplicate JSON member: " + key);
                        value.Add(key, Value(depth + 1)); Space();
                        if (Position < text.Length && text[Position] == '}') { ++Position; return value; }
                        Need(',');
                    }
                }
                if (c == '[')
                {
                    ++Position; Space(); var value = new List<object>();
                    if (Position < text.Length && text[Position] == ']') { ++Position; return value; }
                    while (true)
                    {
                        value.Add(Value(depth + 1)); Space();
                        if (Position < text.Length && text[Position] == ']') { ++Position; return value; }
                        Need(',');
                    }
                }
                foreach (var literal in new[] { "null", "true", "false" })
                {
                    if (Position + literal.Length <= text.Length
                        && System.String.CompareOrdinal(text, Position, literal, 0, literal.Length) == 0)
                    {
                        Position += literal.Length;
                        return literal == "null" ? null : (object)(literal == "true");
                    }
                }
                int start = Position;
                while (Position < text.Length && "-+0123456789.eE".IndexOf(text[Position]) >= 0) ++Position;
                string token = text.Substring(start, Position - start);
                if (!Number.IsMatch(token)) throw new ArgumentException("Invalid JSON token.");
                return new JsonNumber(token);
            }
            private string Text()
            {
                if (Position >= text.Length || text[Position++] != '"')
                    throw new ArgumentException("Expected a JSON string.");
                var value = new StringBuilder();
                while (Position < text.Length)
                {
                    char c = text[Position++];
                    if (c == '"') { string result = value.ToString(); Unicode(result); return result; }
                    if (c < 0x20) throw new ArgumentException("Unescaped control character in JSON.");
                    if (c != '\\') { value.Append(c); continue; }
                    if (Position >= text.Length) throw new ArgumentException("Incomplete JSON escape.");
                    c = text[Position++];
                    switch (c)
                    {
                        case '"': value.Append('"'); break;
                        case '\\': value.Append('\\'); break;
                        case '/': value.Append('/'); break;
                        case 'b': value.Append('\b'); break;
                        case 'f': value.Append('\f'); break;
                        case 'n': value.Append('\n'); break;
                        case 'r': value.Append('\r'); break;
                        case 't': value.Append('\t'); break;
                        case 'u':
                            if (Position + 4 > text.Length) throw new ArgumentException("Incomplete Unicode escape.");
                            int code;
                            if (!Int32.TryParse(text.Substring(Position, 4), NumberStyles.AllowHexSpecifier,
                                    CultureInfo.InvariantCulture, out code))
                                throw new ArgumentException("Invalid Unicode escape.");
                            value.Append((char)code); Position += 4; break;
                        default: throw new ArgumentException("Invalid JSON escape.");
                    }
                }
                throw new ArgumentException("Unterminated JSON string.");
            }
        }
    }
}
