import { expect, type Page, test } from '@playwright/test';

const signInAs = async (page: Page, name: 'Alice' | 'Bob') => {
  await page.getByRole('banner').getByText(name, { exact: true }).click();
  await expect(page.getByRole('radio', { name })).toBeChecked();
};

const columnNames = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('region')
    .evaluateAll((columns) => columns.map((c) => c.getAttribute('aria-label')));

test('open a list, check its columns, edit a custom field and save', async ({ page }) => {
  await page.goto('/');
  await signInAs(page, 'Alice');

  await page.getByRole('link', { name: 'Sprint 12' }).click();
  await expect(page.getByRole('heading', { name: 'Sprint 12' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shipped' })).toBeVisible();
  // Sprint 12 adds In Review, renames Done to Shipped and hides Closed (docs/DESIGN.md section 5).
  expect(await columnNames(page)).toEqual(['To Do', 'In Progress', 'In Review', 'Shipped']);

  await page.getByRole('button', { name: 'Open Fix login redirect loop' }).click();
  const drawer = page.getByRole('dialog');
  const input = drawer.getByRole('textbox', { name: 'Estimate (pts)' });
  const original = await input.inputValue();
  const estimate = String(Number(original) + 1); // always differs from the saved value
  await input.fill(estimate);
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  // Reload so the value has to come back from the server, not from the form state. The open task is
  // in the URL (?task=...), so the drawer reopens on its own and loads the task again.
  await page.reload();
  await expect(input).toHaveValue(estimate);

  // Put the demo data back the way it was, so running the tests doesn't change what a reviewer sees.
  await input.fill(original);
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
});

test('switching from Alice to Bob hides the private space', async ({ page }) => {
  await page.goto('/');
  await signInAs(page, 'Alice');
  const sidebar = page.getByRole('navigation', { name: 'Workspace' });
  await expect(sidebar.getByRole('link', { name: 'Launch Content' })).toBeVisible();
  const privateListUrl = await sidebar.getByRole('link', { name: 'Launch Content' }).getAttribute('href');

  await signInAs(page, 'Bob');
  await expect(sidebar.getByRole('link', { name: 'Backlog' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Launch Content' })).toHaveCount(0);
  await expect(sidebar.getByText('Marketing')).toHaveCount(0);

  // Hiding it in the sidebar isn't the protection: opening the link directly is refused by the API.
  await page.goto(privateListUrl!);
  await expect(page.getByText("You don't have access to this")).toBeVisible();
});
