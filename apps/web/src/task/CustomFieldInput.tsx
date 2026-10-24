import type { FieldDefinition } from '@flowboard/contracts';
import { Checkbox, MultiSelect, NumberInput, Select, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';

type Props = {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error: string | undefined;
};

/** The input for one custom field, chosen by its type. Empty inputs report null ("no value"). */
export function CustomFieldInput({ field, value, onChange, error }: Props) {
  const common = { label: field.name, required: field.required, error };
  const options = field.options.map((o) => ({ value: o.id, label: o.label }));

  switch (field.type) {
    case 'text':
      return (
        <TextInput
          {...common}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.currentTarget.value || null)}
        />
      );
    case 'number':
      return (
        <NumberInput
          {...common}
          value={(value as number) ?? ''}
          onChange={(next) => onChange(typeof next === 'number' ? next : null)}
        />
      );
    case 'single_select':
      return (
        <Select {...common} data={options} value={(value as string) ?? null} onChange={onChange} clearable />
      );
    case 'multi_select':
      return (
        <MultiSelect
          {...common}
          data={options}
          value={(value as string[]) ?? []}
          onChange={onChange}
          clearable
        />
      );
    case 'date':
      return (
        <DateInput
          {...common}
          valueFormat="MMM D, YYYY"
          value={(value as string) ?? null}
          onChange={onChange}
          clearable
        />
      );
    case 'checkbox':
      return (
        <Checkbox
          label={field.name}
          error={error}
          checked={value === true}
          onChange={(e) => onChange(e.currentTarget.checked)}
          mt="xs"
        />
      );
  }
}
