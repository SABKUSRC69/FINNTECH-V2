/** Preserve upstream JSON numeric lexemes before any IEEE-754 conversion.
 * Quoted strings are copied untouched; JSON.parse still validates the resulting grammar.
 * Numeric fields remain strings and must pass the relevant decimal/time/code validation.
 */
export function parseProviderJson(text: string): unknown {
  if (text.length > 1_048_576) throw new Error('provider_payload_too_large')
  const token = /"(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[\da-fA-F]{4})*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  return JSON.parse(text.replace(token, value => value.startsWith('"') ? value : JSON.stringify(value))) as unknown
}
