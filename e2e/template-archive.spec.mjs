import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeAll(async () => {
  // Include the observed source in the automated review evidence, alongside behavioral results.
  const workspace = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../lib/template-availability.ts', import.meta.url), 'utf8');
  const management = await readFile(new URL('../components/template-tools.tsx', import.meta.url), 'utf8');
  const lines = workspace.split(/\r?\n/);
  const calls = lines.flatMap((line, index) => /const (?:templates|templateState) = (?:availableTemplates|templateLibraryState)/.test(line)
    ? [{ line: index + 1, source: lines.slice(index, index + 4).join('\n') }] : []);
  console.log(JSON.stringify({ sourceObservation: { calls, sharedDefinition: helper,
    managementUsesFullList: management.split(/\r?\n/).filter(line => line.includes('data.templates.map')),
    inlineArchiveChecksInWorkspace: lines.filter(line => /template_metadata|m\.archived/.test(line)) } }));
});

const clientId = "c29ea1e8-c21c-40c0-9891-4c9ffe2c8894";
const clientRoute =
  "/coach/clients/c29ea1e8-c21c-40c0-9891-4c9ffe2c8894?tab=program";

test("keeps template availability consistent without changing assigned programs", async ({ page }) => {
  await test.step("uses the trusted synthetic coach session", async () => {
    expect(process.env.AUTOMATION_BROWSER_STORAGE_STATE).toBeTruthy();
  });

  async function snapshot() {
    const response = await page.request.get("/api/export");
    expect(response.status()).toBe(200);
    return response.json();
  }

  async function assignedPrograms() {
    const data = await snapshot();
    return data.programs.filter((program) => program.client_id === clientId);
  }

  async function openTraineeTemplateList() {
    await page.goto(clientRoute);
    await expect(page).toHaveURL(
      new RegExp(`${clientRoute.replace("?", "\\?")}$`),
    );
    return page.getByRole("combobox", { name: "قالب البداية" });
  }

  async function openTemplateLibrary() {
    await page.goto("/coach/library");
    await page.getByRole("tab", { name: "قوالب البرامج" }).click();
    return page.getByTestId("active-template-grid");
  }

  async function openTemplateManagement(templateId) {
    await openTemplateLibrary();
    const management = page.getByTestId("template-tools");
    const selector = management.locator("select").first();
    await expect(
      selector.locator(`option[value="${templateId}"]`),
    ).toHaveCount(1);
    await selector.selectOption(templateId);
    return management;
  }

  async function setArchived(templateId, archived) {
    const management = await openTemplateManagement(templateId);
    await management.locator('input[name="archived"]').setChecked(archived);
    await management.locator("form button").click();
    await expect.poll(async () => {
      const data = await snapshot();
      return data.management.template_metadata.find(
        (item) => item.template_id === templateId,
      )?.archived ?? false;
    }).toBe(archived);
  }

  async function expectManagementState(template, archived) {
    const management = await openTemplateManagement(template.id);
    const option = management.locator(
      `select option[value="${template.id}"]`,
    );
    await expect(option).toContainText(template.name);
    await expect(management.locator('input[name="archived"]')).toBeChecked({
      checked: archived,
    });
    if (archived) {
      await expect(
        management.getByRole("button", { name: "استعادة القالب" }),
      ).toBeVisible();
    }
  }

  const initial = await snapshot();
  expect(initial.templates.length).toBeGreaterThan(0);
  const template = initial.templates[0];
  const originallyArchived = initial.management.template_metadata.find(
    (item) => item.template_id === template.id,
  )?.archived ?? false;
  const assignedBefore = structuredClone(
    initial.programs.filter((program) => program.client_id === clientId),
  );
  expect(assignedBefore.length).toBeGreaterThan(0);

  try {
    if (originallyArchived) await setArchived(template.id, false);

    await test.step("before archival: trainee list, library, and management show the active template", async () => {
      const traineeList = await openTraineeTemplateList();
      await expect(
        traineeList.locator(`option[value="${template.id}"]`),
      ).toHaveText(template.name);

      const library = await openTemplateLibrary();
      await expect(
        library.getByRole("heading", { name: template.name, exact: true }),
      ).toBeVisible();
      await expectManagementState(template, false);
      expect(await assignedPrograms()).toEqual(assignedBefore);
    });

    await test.step("after archival: only management shows the template and the assigned program is unchanged", async () => {
      await setArchived(template.id, true);

      const traineeList = await openTraineeTemplateList();
      await expect(
        traineeList.locator(`option[value="${template.id}"]`),
      ).toHaveCount(0);

      const library = await openTemplateLibrary();
      await expect(
        library.getByRole("heading", { name: template.name, exact: true }),
      ).toHaveCount(0);
      await expectManagementState(template, true);
      expect(await assignedPrograms()).toEqual(assignedBefore);
    });

    await test.step("after restoration: trainee list and library show the template again and the assigned program is unchanged", async () => {
      await setArchived(template.id, false);

      const traineeList = await openTraineeTemplateList();
      await expect(
        traineeList.locator(`option[value="${template.id}"]`),
      ).toHaveText(template.name);

      const library = await openTemplateLibrary();
      await expect(
        library.getByRole("heading", { name: template.name, exact: true }),
      ).toBeVisible();
      await expectManagementState(template, false);
      expect(await assignedPrograms()).toEqual(assignedBefore);
    });
  } finally {
    await setArchived(template.id, originallyArchived);
  }
});
