import type { Template } from "./model";
import type { TemplateMeta } from "./management";

export function availableTemplates(
  templates: Template[],
  metadata: TemplateMeta[] = [],
) {
  const archived = new Set(
    metadata.filter((item) => item.archived).map((item) => item.template_id),
  );
  return templates.filter((template) => !archived.has(template.id));
}

export type TemplateLibraryState =
  | { kind: "empty"; activeTemplates: [] }
  | { kind: "all-archived"; activeTemplates: [] }
  | { kind: "active"; activeTemplates: Template[] };

export function templateLibraryState(
  templates: Template[],
  activeTemplates: Template[],
): TemplateLibraryState {
  if (templates.length === 0) return { kind: "empty", activeTemplates: [] };

  if (activeTemplates.length === 0) {
    return { kind: "all-archived", activeTemplates: [] };
  }

  return { kind: "active", activeTemplates };
}
