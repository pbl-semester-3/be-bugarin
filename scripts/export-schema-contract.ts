import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";

import { updatePtProfileSchema, changePtPasswordSchema } from "../src/modules/pt/pt.schema";
import { loginSchema } from "../src/modules/auth/auth.schema";

// Schema yang kontraknya dipantau FE (yang memang dipakai form web).
const monitoredSchemas: Record<string, ZodTypeAny> = {
  "pt.updateProfile": updatePtProfileSchema,
  "pt.changePassword": changePtPasswordSchema,
  "auth.login": loginSchema,
};

type FieldRule = {
  type?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  optional: boolean;
};

type JsonSchemaLike = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

function extractFieldRules(schema: ZodTypeAny): Record<string, FieldRule> {
  const json = zodToJsonSchema(schema) as JsonSchemaLike;
  const required = new Set(json.required ?? []);
  const fields: Record<string, FieldRule> = {};

  for (const name of Object.keys(json.properties ?? {}).sort()) {
    const prop = json.properties![name];
    const rule: FieldRule = { optional: !required.has(name) };

    if (typeof prop.type === "string") rule.type = prop.type;
    for (const key of ["minLength", "maxLength", "minimum", "maximum"] as const) {
      if (typeof prop[key] === "number") rule[key] = prop[key] as number;
    }
    if (Array.isArray(prop.enum)) rule.enum = prop.enum as string[];

    fields[name] = rule;
  }

  return fields;
}

const contract = {
  version: 1,
  note: "Dihasilkan otomatis dari schema Zod backend. Aturan .refine()/lintas-field tidak tercakup.",
  schemas: Object.fromEntries(
    Object.entries(monitoredSchemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, schema]) => [name, extractFieldRules(schema)]),
  ),
};

const outPath = resolve("contract/schema-contract.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
console.log(`Kontrak ditulis: ${outPath}`);
