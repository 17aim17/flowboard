import type { FieldDefinition } from '@flowboard/contracts';
import dayjs from 'dayjs';

/** A custom field value as text for tables and chips. */
export function formatFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null) return '';
  const label = (id: unknown) => field.options.find((o) => o.id === id)?.label ?? String(id);
  switch (field.type) {
    case 'single_select':
      return label(value);
    case 'multi_select':
      return Array.isArray(value) ? value.map(label).join(', ') : '';
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'date':
      return typeof value === 'string' ? dayjs(value).format('MMM D, YYYY') : '';
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}
