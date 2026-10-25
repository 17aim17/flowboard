import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

// env="test" turns off transitions and portals, so dropdowns open synchronously in jsdom.
export const renderWithMantine = (ui: ReactElement) =>
  render(<MantineProvider env="test">{ui}</MantineProvider>);
