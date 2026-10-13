import { describe, expect, it } from "vitest";

import { createDirectAnalysis } from "../composition/directAnalysis.js";
import { createTestTempDirectory } from "../../tests/fixtures/temporaryDirectory.js";
import {
  writeElfExecutable,
  writeMachoApp,
  writeMachoExecutable,
} from "../../tests/fixtures/webTargets.js";
import {
  projectArtifactContainment,
  projectDylibDependencies,
  readArtifactInventory,
  WEB_GRAPH_EDGE_CAP,
  WEB_GRAPH_NODE_CAP,
} from "./graphProjection.js";

const { runProviderAnalysis } = createDirectAnalysis({});

describe("projectDylibDependencies", () => {
  it("projects resolved and unresolved dependencies with their resolution", async () => {
    const root = await createTestTempDirectory("rea-web-graph-app-");
    const app = await writeMachoApp(root);
    const result = projectDylibDependencies(
      await runProviderAnalysis(app, "trace_dylib_resolution", {}),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const graph = result.value;
    expect(graph).toMatchObject({
      graph_id: "dylib-dependencies",
      source_operation: "trace_dylib_resolution",
      coverage: { status: "complete" },
      truncated: { nodes_omitted: 0, edges_omitted: 0 },
    });
    const byInstall = (name: string) =>
      graph.edges.find(({ attributes }) => attributes.install_name === name);
    expect(byInstall("@rpath/libcore.dylib")).toMatchObject({
      relation: "LC_LOAD_DYLIB",
      resolution: "resolved",
    });
    const missing = byInstall("@rpath/libmissing.dylib");
    expect(missing?.resolution).toBe("unresolved");
    expect(graph.nodes.find(({ id }) => id === missing?.target)).toMatchObject({
      kind: "unresolved-install-name",
    });
    expect(graph.nodes.some(({ kind }) => kind === "root-image")).toBe(true);
  });

  it("caps rendering nodes and reports what was omitted", async () => {
    const root = await createTestTempDirectory("rea-web-graph-nodes-");
    const names = Array.from(
      { length: WEB_GRAPH_NODE_CAP + 50 },
      (_, index) => `/usr/lib/lib${String(index)}.dylib`,
    );
    const path = await writeMachoExecutable(root, names);
    const result = projectDylibDependencies(
      await runProviderAnalysis(path, "trace_dylib_resolution", {}),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(WEB_GRAPH_NODE_CAP);
    // The root plus one target per dependency, minus what was retained.
    expect(result.value.truncated.nodes_omitted).toBe(
      names.length + 1 - WEB_GRAPH_NODE_CAP,
    );
    expect(result.value.truncated.edges_omitted).toBe(
      names.length - result.value.edges.length,
    );
  });

  it("caps rendering edges independently of nodes", async () => {
    const root = await createTestTempDirectory("rea-web-graph-edges-");
    const path = await writeMachoExecutable(
      root,
      Array.from(
        { length: WEB_GRAPH_EDGE_CAP + 25 },
        () => "/usr/lib/libc.dylib",
      ),
    );
    const result = projectDylibDependencies(
      await runProviderAnalysis(path, "trace_dylib_resolution", {}),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edges).toHaveLength(WEB_GRAPH_EDGE_CAP);
    expect(result.value.truncated).toMatchObject({
      nodes_omitted: 0,
      edges_omitted: 25,
    });
  });

  it("rejects Evidence that is not a dylib trace", async () => {
    const root = await createTestTempDirectory("rea-web-graph-wrong-");
    const evidence = await runProviderAnalysis(
      await writeElfExecutable(root),
      "inspect_artifact",
      {},
    );
    expect(projectDylibDependencies(evidence)).toMatchObject({
      ok: false,
      error: { _tag: "GraphProjectionError" },
    });
    expect(projectDylibDependencies({ not: "evidence" }).ok).toBe(false);
  });
});

describe("projectArtifactContainment", () => {
  it("projects the inventory of an app bundle as a containment tree", async () => {
    const root = await createTestTempDirectory("rea-web-graph-contain-");
    const app = await writeMachoApp(root);
    const inventory = readArtifactInventory(
      await runProviderAnalysis(app, "inspect_artifact", {}),
    );
    expect(inventory.ok).toBe(true);
    if (!inventory.ok) return;
    const graph = projectArtifactContainment(inventory.value);
    expect(graph.graph_id).toBe("artifact-containment");
    expect(graph.evidence_id).toBe(inventory.value.evidence.evidence_id);
    const paths = graph.nodes.map(({ attributes }) => attributes.logical_path);
    expect(paths).toEqual(
      expect.arrayContaining(["Contents/MacOS/App", "Contents/Frameworks"]),
    );
    const ids = new Set(graph.nodes.map(({ id }) => id));
    for (const edge of graph.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
    // Coverage comes from the inventory, never assumed.
    expect(["complete", "partial"]).toContain(graph.coverage.status);
  });

  it("does not parse a failed projection as an inventory", () => {
    expect(readArtifactInventory({ error: "Analysis failed" })).toMatchObject({
      ok: false,
      error: { _tag: "GraphProjectionError" },
    });
  });
});
