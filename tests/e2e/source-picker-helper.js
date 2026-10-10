export async function chooseSource(row, section, value) {
  await row.locator('.source-trigger').click();
  await row.locator(`[data-source-module="${section}"]`).click();
  const [path, index] = value.split('::');
  await row.locator(`[data-source-field="${path}"][data-source-index="${index}"]`).click();
}
