import { describe, expect, it } from "vitest";
import {
  availableTemplates,
  templateLibraryState,
} from "@/lib/template-availability";
import type { Template } from "@/lib/model";

const template = (id: string): Template =>
  ({
    id,
    name: `Template ${id}`,
    content: {
      days: [],
      nutrition: {
        text: "",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    },
    updated_at: "2026-11-08T00:00:00.000Z",
  });

describe("template library state", () => {
  it("shows the create-first-template state when there are no templates", () => {
    expect(templateLibraryState([], availableTemplates([], []))).toEqual({
      kind: "empty",
      activeTemplates: [],
    });
  });

  it("shows the all-archived state without an empty active grid", () => {
    expect(
      templateLibraryState(
        [template("archived")],
        availableTemplates([template("archived")], [
          {
            template_id: "archived",
            description: "",
            archived: true,
            kind: "workout",
          },
        ]),
      ),
    ).toEqual({ kind: "all-archived", activeTemplates: [] });
  });

  it("shows the grid when one active template exists", () => {
    const active = template("active");
    const state = templateLibraryState(
      [active],
      availableTemplates([active], []),
    );

    expect(state.kind).toBe("active");
    expect(state.activeTemplates).toEqual([active]);
  });
});
