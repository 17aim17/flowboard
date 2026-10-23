import { z } from 'zod';
import { Color, ContainerType, FieldType, Id, Key, type ValidationIssue } from './common.ts';

const OptionId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Use lowercase letters, digits, _ or - (max 40)');

export const FieldOption = z.object({
  id: OptionId,
  label: z.string().trim().min(1).max(100),
  color: Color.optional(),
});
export type FieldOption = z.infer<typeof FieldOption>;

export const FieldDefinition = z.object({
  id: Id,
  key: Key,
  name: z.string(),
  type: FieldType,
  required: z.boolean(),
  options: z.array(FieldOption),
  ownerType: ContainerType,
  ownerId: Id,
  position: z.string(),
});
export type FieldDefinition = z.infer<typeof FieldDefinition>;

export const ContainerFields = z.object({
  local: z.array(FieldDefinition),
  resolved: z.array(FieldDefinition),
});

const isSelect = (type: FieldType) => type === 'single_select' || type === 'multi_select';

/** Option ids are optional on input; the server generates missing ones. */
const OptionInput = FieldOption.extend({ id: OptionId.optional() });

const checkOptions = (
  body: { type?: FieldType; options?: { id?: string | undefined }[] },
  ctx: z.RefinementCtx,
) => {
  if (!body.type || !body.options) return;
  if (isSelect(body.type) && body.options.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Select fields need at least one option' });
  }
  if (!isSelect(body.type) && body.options.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only select fields have options' });
  }
  const ids = body.options.flatMap((o) => (o.id ? [o.id] : []));
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique' });
  }
};

export const CreateFieldBody = z
  .object({
    key: Key,
    name: z.string().trim().min(1).max(100),
    type: FieldType,
    required: z.boolean().default(false),
    options: z.array(OptionInput).default([]),
  })
  .superRefine(checkOptions);
export type CreateFieldBody = z.infer<typeof CreateFieldBody>;

/** `options`, when sent, replaces the whole list: keep an option by sending its id. */
export const UpdateFieldBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    type: FieldType.optional(),
    required: z.boolean().optional(),
    options: z.array(OptionInput).optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Send at least one field');
export type UpdateFieldBody = z.infer<typeof UpdateFieldBody>;

export type CustomFieldValues = Record<string, unknown>;
type FieldSchema = Pick<FieldDefinition, 'key' | 'type' | 'required' | 'options'>;

/**
 * - create: required fields must have a value.
 * - update: values are merged into existing ones; a required field can't be cleared.
 * - move:   like update, and the destination's required fields must have a value afterwards.
 */
export type ValidationMode = 'create' | 'update' | 'move';

const MAX_TEXT = 5000;

/** Empty text and an empty multi-select count as "no value", the same as null. */
const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

function checkValue(field: FieldSchema, value: unknown): Omit<ValidationIssue, 'path'> | null {
  const optionIds = new Set(field.options.map((o) => o.id));
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string') return { code: 'invalid_type', message: 'Expected text' };
      if (value.length > MAX_TEXT) return { code: 'too_long', message: `At most ${MAX_TEXT} characters` };
      return null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : { code: 'invalid_type', message: 'Expected a number' };
    case 'checkbox':
      return typeof value === 'boolean' ? null : { code: 'invalid_type', message: 'Expected true or false' };
    case 'date':
      if (typeof value !== 'string' || !isCalendarDate(value)) {
        return { code: 'invalid_date', message: 'Expected a date as YYYY-MM-DD' };
      }
      return null;
    case 'single_select':
      if (typeof value !== 'string') return { code: 'invalid_type', message: 'Expected an option id' };
      return optionIds.has(value) ? null : { code: 'invalid_option', message: `Unknown option "${value}"` };
    case 'multi_select': {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        return { code: 'invalid_type', message: 'Expected a list of option ids' };
      }
      const unknown = value.filter((v) => !optionIds.has(v));
      if (unknown.length > 0)
        return { code: 'invalid_option', message: `Unknown option(s): ${unknown.join(', ')}` };
      if (new Set(value).size !== value.length)
        return { code: 'duplicate_option', message: 'Options repeat' };
      return null;
    }
  }
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Validates custom field input against a list's resolved fields and returns the values to store.
 * Every problem is reported at once, each with a path like "customFields.estimate".
 * Values in `existing` for fields the list doesn't have (orphans) are kept untouched.
 */
export function validateCustomFields(
  fields: FieldSchema[],
  input: CustomFieldValues,
  mode: ValidationMode,
  existing: CustomFieldValues = {},
): { values: CustomFieldValues; issues: ValidationIssue[] } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const values: CustomFieldValues = { ...existing };
  const issues: ValidationIssue[] = [];
  const path = (key: string) => `customFields.${key}`;

  for (const [key, value] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) {
      issues.push({ path: path(key), code: 'unknown_field', message: 'This list has no such field' });
    } else if (isEmpty(value)) {
      delete values[key];
    } else {
      const problem = checkValue(field, value);
      if (problem) issues.push({ path: path(key), ...problem });
      else values[key] = value;
    }
  }

  for (const field of fields) {
    if (!field.required || !isEmpty(values[field.key])) continue;
    if (issues.some((issue) => issue.path === path(field.key))) continue; // already reported as invalid
    const cleared = field.key in input;
    if (mode !== 'update' || cleared) {
      issues.push({ path: path(field.key), code: 'required', message: 'This field is required' });
    }
  }

  return { values, issues };
}
