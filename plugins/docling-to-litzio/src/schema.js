import { readFile } from "node:fs/promises";
export const schemas = Object.fromEntries(
  await Promise.all(
    ["provenance", "losses", "complete", "review-targets", "review-complete", "pdf-evidence"].map(async (name) => [
      name,
      JSON.parse(
        await readFile(
          new URL(`../schema/${name}.schema.json`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  ),
);
// Implements only the JSON Schema keywords used in the owned generation/review schemas.
// Reject unknown keywords, rather than silently claiming general JSON Schema support.
export function validateSchema(value, schema, root = schema, path = "$") {
  const error = () => {
    throw new Error(`schema-invalid ${path}`);
  };
  const keywords = [
    "$schema",
    "$id",
    "$defs",
    "$ref",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "minLength",
    "minProperties",
    "pattern",
    "enum",
    "const",
    "minimum",
    "exclusiveMinimum",
    "anyOf",
  ];
  for (const k of Object.keys(schema))
    if (!keywords.includes(k)) throw new Error("unsupported-schema-keyword");
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/$defs/")) error();
    const def = root.$defs?.[schema.$ref.slice(8)];
    if (!def) error();
    return validateSchema(value, def, root, path);
  }
  if (schema.anyOf) {
    if (
      !schema.anyOf.some((s) => {
        try {
          validateSchema(value, s, root, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      error();
    return;
  }
  if (
    "const" in schema &&
    JSON.stringify(value) !== JSON.stringify(schema.const)
  )
    error();
  if (schema.enum && !schema.enum.includes(value)) error();
  const type = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
  if (
    schema.type &&
    ![]
      .concat(schema.type)
      .some((t) => t === type || (t === "integer" && Number.isInteger(value)))
  )
    error();
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value <= (schema.exclusiveMinimum ?? -Infinity))
  )
    error();
  if (
    typeof value === "string" &&
    (value.length < (schema.minLength ?? 0) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value)))
  )
    error();
  if (Array.isArray(value)) {
    if (
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      error();
    if (schema.items)
      value.forEach((v, i) =>
        validateSchema(v, schema.items, root, `${path}[${i}]`),
      );
  }
  if (type === "object") {
    if (Object.keys(value).length < (schema.minProperties ?? 0)) error();
    for (const k of schema.required ?? [])
      if (!Object.hasOwn(value, k)) error();
    for (const [k, v] of Object.entries(value)) {
      const s = schema.properties?.[k];
      if (s) validateSchema(v, s, root, `${path}.${k}`);
      else if (schema.additionalProperties === false) error();
      else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      )
        validateSchema(v, schema.additionalProperties, root, `${path}.${k}`);
    }
  }
}
