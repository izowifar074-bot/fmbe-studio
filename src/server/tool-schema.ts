const tool = (name: string, description: string, parameters: any) => ({
  type: "function",
  function: { name, description, parameters },
});
const object = (properties: any, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const revision = { type: "integer", minimum: 1 };
export const TOOL_SCHEMAS = [
  tool(
    "context_read",
    "Read the actual project revision, parameters, semantic parts, entity budget and important diagnostics. Read this before edits. Does not advance simulation.",
    object({
      include_source: {
        type: "boolean",
        description: "Include the author program only when needed.",
      },
      part_id: {
        type: "string",
        description: "Optional semantic part ID to inspect.",
      },
    }),
  ),
  tool(
    "design_apply",
    "Atomically edit author source, parameters or a named part. Revision conflicts return 409. Preserve stable IDs. Invalid compilation is not committed.",
    object(
      {
        base_revision: revision,
        request_id: { type: "string" },
        patch: object({
          source: { type: "string", maxLength: 131072 },
          params: { type: "object", additionalProperties: { type: "number" } },
          overrides: {
            type: "object",
            additionalProperties: {
              anyOf: [
                { type: "null" },
                object({
                  size: {
                    type: "array",
                    items: { type: "number", exclusiveMinimum: 0 },
                    minItems: 3,
                    maxItems: 3,
                  },
                  position: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 3,
                    maxItems: 3,
                  },
                  rotation: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 3,
                    maxItems: 3,
                  },
                  material: { type: "string" },
                  hidden: { type: "boolean" },
                }),
              ],
            },
          },
          budget: { type: "integer", minimum: 1, maximum: 1024 },
          name: { type: "string" },
        }),
      },
      ["base_revision", "request_id", "patch"],
    ),
  ),
  tool(
    "experiment_run",
    "Run one bounded experiment: optimize dimensional costs, execute raw commands, advance simulation, inspect geometry, or request a screenshot. These modes report limitations; screenshots require an open workbench.",
    object(
      {
        mode: {
          type: "string",
          enum: ["optimize", "commands", "step", "observe", "capture"],
        },
        base_revision: revision,
        tolerance: { type: "number", minimum: 0, maximum: 0.25 },
        commands: { type: "string" },
        reset: { type: "boolean" },
        frames: { type: "integer", minimum: 1, maximum: 3600 },
        dt: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        view: {
          type: "string",
          enum: ["player", "editor", "front", "side", "top"],
        },
        width: { type: "integer", minimum: 64, maximum: 2048 },
        height: { type: "integer", minimum: 64, maximum: 2048 },
      },
      ["mode"],
    ),
  ),
  tool(
    "candidate_accept",
    "Accept a previously computed candidate from the current revision. The old version remains available for undo.",
    object(
      {
        base_revision: revision,
        runId: { type: "string" },
        candidateId: { type: "string" },
      },
      ["base_revision", "runId", "candidateId"],
    ),
  ),
  tool(
    "project_export",
    "Export an experimental FMBE command package only if compilation and budget checks pass. NetEase compatibility is not verified.",
    object({ experimental: { type: "boolean", const: true } }, [
      "experimental",
    ]),
  ),
];
