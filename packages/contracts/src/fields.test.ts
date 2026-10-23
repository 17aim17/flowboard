import { describe, expect, it } from 'vitest';
import { validateCustomFields, type CustomFieldValues, type ValidationMode } from './fields.ts';

const fields: Parameters<typeof validateCustomFields>[0] = [
  { key: 'estimate', type: 'number', required: false, options: [] },
  {
    key: 'severity',
    type: 'single_select',
    required: true,
    options: [
      { id: 'low', label: 'Low' },
      { id: 'high', label: 'High' },
    ],
  },
  {
    key: 'component',
    type: 'multi_select',
    required: false,
    options: [
      { id: 'api', label: 'API' },
      { id: 'web', label: 'Web' },
    ],
  },
  { key: 'notes', type: 'text', required: false, options: [] },
  { key: 'due', type: 'date', required: false, options: [] },
  { key: 'needs_qa', type: 'checkbox', required: false, options: [] },
];

const validate = (input: CustomFieldValues, mode: ValidationMode, existing?: CustomFieldValues) =>
  validateCustomFields(fields, input, mode, existing);

describe('validateCustomFields', () => {
  it('accepts a valid value of every type', () => {
    const input = {
      estimate: 5,
      severity: 'high',
      component: ['api', 'web'],
      notes: 'See PR',
      due: '2026-11-02',
      needs_qa: false,
    };
    expect(validate(input, 'create')).toEqual({ values: input, issues: [] });
  });

  it('rejects a string for a number, with the field path', () => {
    const { issues } = validate({ severity: 'low', estimate: '5' }, 'create');
    expect(issues).toEqual([{ path: 'customFields.estimate', code: 'invalid_type', message: 'Expected a number' }]);
  });

  it('rejects select values that are not options', () => {
    const { issues } = validate({ severity: 'urgent', component: ['api', 'mobile'] }, 'create');
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ['customFields.severity', 'invalid_option'],
      ['customFields.component', 'invalid_option'],
    ]);
  });

  it('rejects impossible dates and unknown keys', () => {
    const { issues } = validate({ severity: 'low', due: '2026-02-30', colour: 'red' }, 'create');
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ['customFields.due', 'invalid_date'],
      ['customFields.colour', 'unknown_field'],
    ]);
  });

  it('requires required fields on create', () => {
    const { issues } = validate({ estimate: 3 }, 'create');
    expect(issues).toEqual([{ path: 'customFields.severity', code: 'required', message: 'This field is required' }]);
  });

  it('on update, merges values and clears with null or empty', () => {
    const existing = { severity: 'low', estimate: 3, notes: 'old' };
    const { values, issues } = validate({ estimate: 8, notes: '' }, 'update', existing);
    expect(issues).toEqual([]);
    expect(values).toEqual({ severity: 'low', estimate: 8 });
  });

  it('on update, refuses to clear a required field', () => {
    const { issues } = validate({ severity: null }, 'update', { severity: 'low' });
    expect(issues.map((i) => [i.path, i.code])).toEqual([['customFields.severity', 'required']]);
  });

  it('on update, does not block old tasks that predate a required field', () => {
    expect(validate({ estimate: 1 }, 'update', {}).issues).toEqual([]);
  });

  it('on move, requires the destination required fields and keeps orphan values', () => {
    const existing = { channel: 'blog' }; // from the source list; the destination has no "channel"
    expect(validate({}, 'move', existing).issues.map((i) => i.code)).toEqual(['required']);
    expect(validate({ severity: 'high' }, 'move', existing)).toEqual({
      values: { channel: 'blog', severity: 'high' },
      issues: [],
    });
  });

  it('reports an invalid value once, not also as missing', () => {
    const { issues } = validate({ severity: 42 }, 'create');
    expect(issues.map((i) => i.code)).toEqual(['invalid_type']);
  });
});
