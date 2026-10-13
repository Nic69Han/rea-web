import {
  parseArtifactInventoryEvidence,
  type InventorySet,
} from "../domain/artifactInventoryEvidence.js";
import type { ArtifactEdge } from "../domain/artifactGraph.js";
import {
  dylibResolutionResultSchema,
  type DylibEdge,
  type DylibResolutionResult,
} from "../domain/apple/dylibResolution.js";
import { parseEvidence, type Evidence } from "../domain/evidence.js";
import { err, ok, type Result } from "../domain/result.js";
import type {
  WebAttributeValue,
  WebEdgeResolution,
  WebGraph,
} from "./types.js";

/** Rendering caps; the analysis itself is never bounded by them. */
export const WEB_GRAPH_NODE_CAP = 500;
export const WEB_GRAPH_EDGE_CAP = 1500;

/** Evidence did not carry a projectable payload. */
export class GraphProjectionError extends Error {
  readonly _tag = "GraphProjectionError";
  constructor(message: string, options?: { readonly cause: unknown }) {
    super(message, options);
  }
}

type Attributes = Record<string, WebAttributeValue>;
type GraphNode = WebGraph["nodes"][number];
type GraphEdge = WebGraph["edges"][number];

const parseWithin = <Value>(
  parse: () => Value,
  description: string,
): Result<Value, GraphProjectionError> => {
  try {
    return ok(parse());
  } catch (cause) {
    return err(
      new GraphProjectionError(
        `${description}: ${cause instanceof Error ? cause.message : "invalid Evidence"}`,
        { cause },
      ),
    );
  }
};

const basename = (path: string): string => path.split("/").at(-1) ?? path;

const compact = (attributes: Record<string, WebAttributeValue | undefined>) =>
  Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  ) as Attributes;

/**
 * Keep the first nodes in the supplied priority order and only edges between
 * retained nodes. Omission counts stay explicit so the UI never presents a
 * capped rendering as the whole graph.
 */
const capGraph = (
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Pick<WebGraph, "nodes" | "edges" | "truncated"> => {
  const keptNodes = nodes.slice(0, WEB_GRAPH_NODE_CAP);
  const retained = new Set(keptNodes.map(({ id }) => id));
  const keptEdges = edges
    .filter(
      ({ source, target }) => retained.has(source) && retained.has(target),
    )
    .slice(0, WEB_GRAPH_EDGE_CAP);
  return {
    nodes: keptNodes,
    edges: keptEdges,
    truncated: {
      nodes_omitted: nodes.length - keptNodes.length,
      edges_omitted: edges.length - keptEdges.length,
    },
  };
};

const mergeStrings = (...groups: readonly (readonly string[])[]): string[] => [
  ...new Set(groups.flat()),
];

/** Containment strength: structure read from the container is observed. */
const containmentResolution = (edge: ArtifactEdge): WebEdgeResolution =>
  edge.producer === null &&
  (edge.relation === "contains" || edge.relation === "slice-of")
    ? "observed"
    : "derived";

const occurrenceDepth = (path: string): number => path.split("/").length;

/** Authenticated `inspect_artifact` Evidence with its merged, verified inventory. */
export interface ParsedInventory {
  readonly evidence: Evidence;
  readonly inventory: InventorySet;
}

/** Parse `inspect_artifact` Evidence once with the domain's inventory proofs. */
export const readArtifactInventory = (
  evidenceJson: unknown,
): Result<ParsedInventory, GraphProjectionError> =>
  parseWithin(() => {
    const evidence = parseEvidence(evidenceJson);
    return {
      evidence,
      inventory: parseArtifactInventoryEvidence(evidence).inventory,
    };
  }, "inspect_artifact Evidence is not a valid artifact inventory");

/** Project a parsed inventory into the artifact containment graph. */
export const projectArtifactContainment = ({
  evidence,
  inventory,
}: ParsedInventory): WebGraph => containmentGraph(evidence, inventory);

/** Shallow entries first so a capped rendering keeps the container's shape. */
const occurrenceNodes = (inventory: InventorySet): GraphNode[] => {
  const artifacts = new Map(
    inventory.nodes.map((node) => [node.artifact_id, node]),
  );
  return inventory.occurrences
    .map((occurrence, index) => ({ occurrence, index }))
    .sort(
      (a, b) =>
        occurrenceDepth(a.occurrence.logical_path) -
          occurrenceDepth(b.occurrence.logical_path) || a.index - b.index,
    )
    .map(({ occurrence }) => {
      const artifact =
        occurrence.artifact_id === null
          ? undefined
          : artifacts.get(occurrence.artifact_id);
      return {
        id: occurrence.occurrence_id,
        label: basename(occurrence.logical_path),
        kind: occurrence.artifact_kind,
        attributes: compact({
          logical_path: occurrence.logical_path,
          entry_kind: occurrence.entry_kind,
          artifact_format: occurrence.artifact_format,
          declared_size: occurrence.declared_size,
          compressed_size: occurrence.compressed_size,
          executable: occurrence.executable,
          encrypted: occurrence.encrypted,
          hash_status: occurrence.hash_status,
          sha256: artifact?.sha256,
          size: artifact?.size,
          architecture: artifact?.architecture,
          media_type: artifact?.media_type,
          content_state: artifact?.content_state,
          limitations: occurrence.limitations.join("; ") || undefined,
        }),
      };
    });
};

/** Edges whose endpoints the inventory does not retain are skipped. */
const occurrenceEdges = (inventory: InventorySet): GraphEdge[] => {
  const byArtifact = new Map<string, string>();
  for (const occurrence of inventory.occurrences)
    if (
      occurrence.artifact_id !== null &&
      !byArtifact.has(occurrence.artifact_id)
    )
      byArtifact.set(occurrence.artifact_id, occurrence.occurrence_id);
  const occurrenceById = new Map(
    inventory.occurrences.map((occurrence) => [
      occurrence.occurrence_id,
      occurrence,
    ]),
  );
  const edges: GraphEdge[] = [];
  for (const edge of inventory.edges) {
    const child = occurrenceById.get(edge.occurrence_id);
    const parent =
      child?.parent_occurrence_id ?? byArtifact.get(edge.parent_artifact_id);
    if (child === undefined || parent === undefined) continue;
    edges.push({
      id: edge.edge_id,
      source: parent,
      target: child.occurrence_id,
      relation: edge.relation,
      resolution: containmentResolution(edge),
      attributes: compact({
        ordinal: edge.ordinal,
        producer_tool: edge.producer?.tool,
      }),
    });
  }
  return edges;
};

const containmentGraph = (
  evidence: Evidence,
  inventory: InventorySet,
): WebGraph => {
  const nodes = occurrenceNodes(inventory);
  const edges = occurrenceEdges(inventory);
  const notes: string[] = [];
  if (!inventory.complete)
    notes.push(
      "Retained nodes, occurrences, or edges are fewer than the manifest declares.",
    );
  if (edges.length < inventory.edges.length)
    notes.push(
      `${String(inventory.edges.length - edges.length)} inventory edge(s) have an endpoint outside the retained occurrences.`,
    );
  if (inventory.integrityContradictions.length > 0)
    notes.push(
      `${String(inventory.integrityContradictions.length)} integrity contradiction(s) between declared and observed digests; see raw Evidence.`,
    );
  return {
    graph_id: "artifact-containment",
    title: "Artifact containment",
    source_operation: "inspect_artifact",
    evidence_id: evidence.evidence_id,
    ...capGraph(nodes, edges),
    coverage: {
      status:
        inventory.coverage_status === "complete" && inventory.complete
          ? "complete"
          : "partial",
      notes,
    },
    limitations: mergeStrings(inventory.limitations, evidence.limitations),
  };
};

const dylibEdgeResolution = (
  status: DylibEdge["resolution"]["status"],
): WebEdgeResolution =>
  status === "resolved"
    ? "resolved"
    : status === "unresolved"
      ? "unresolved"
      : status === "conditional"
        ? "ambiguous"
        : "unknown";

/** Project `trace_dylib_resolution` Evidence into the dylib dependency graph. */
export const projectDylibDependencies = (
  evidenceJson: unknown,
): Result<WebGraph, GraphProjectionError> => {
  const parsed = parseWithin(() => {
    const evidence = parseEvidence(evidenceJson);
    return {
      evidence,
      trace: dylibResolutionResultSchema.parse(evidence.normalized_result),
    };
  }, "trace_dylib_resolution Evidence is not a valid dylib trace");
  if (!parsed.ok) return parsed;
  return ok(dylibGraph(parsed.value.evidence, parsed.value.trace));
};

const dylibGraph = (
  evidence: Evidence,
  trace: DylibResolutionResult,
): WebGraph => {
  const nodes = new Map<string, GraphNode>();
  const roots = new Set(trace.roots.map(({ image }) => image));
  const parsedImages = new Map(
    trace.images.map((image) => [image.path, image]),
  );
  const imageNode = (path: string): string => {
    const id = `image:${path}`;
    if (nodes.has(id)) return id;
    const image = parsedImages.get(path);
    nodes.set(id, {
      id,
      label: basename(path),
      kind: roots.has(path) ? "root-image" : "image",
      attributes: compact({
        path,
        root: roots.has(path),
        sha256: image?.sha256,
        parse_status: image?.parse_status,
        reason: image?.reason,
        architectures: image?.slices
          .map(({ architecture }) => architecture)
          .join(", "),
        install_name: image?.slices[0]?.install_name,
      }),
    });
    return id;
  };
  // Roots first so a capped rendering always shows the analyzed processes.
  for (const { image } of trace.roots) imageNode(image);
  for (const { path } of trace.images) imageNode(path);
  const findingsByEdge = new Map<number, string[]>();
  const notes: string[] = [];
  for (const finding of trace.findings)
    if (finding.edge_index === null)
      notes.push(`${finding.kind}: ${finding.explanation}`);
    else
      findingsByEdge.set(finding.edge_index, [
        ...(findingsByEdge.get(finding.edge_index) ?? []),
        `${finding.kind}: ${finding.explanation}`,
      ]);
  const edges = trace.edges.map((edge, index): GraphEdge => {
    const source = imageNode(edge.loader);
    const target = edge.resolution.image;
    let targetId: string;
    if (target === null) {
      targetId = `install-name:${edge.install_name}`;
      if (!nodes.has(targetId))
        nodes.set(targetId, {
          id: targetId,
          label: basename(edge.install_name),
          kind: "unresolved-install-name",
          attributes: { install_name: edge.install_name },
        });
    } else targetId = imageNode(target);
    return {
      id: `dylib-edge:${String(index)}`,
      source,
      target: targetId,
      relation: edge.command,
      resolution: dylibEdgeResolution(edge.resolution.status),
      attributes: compact({
        install_name: edge.install_name,
        root: edge.root,
        architecture: edge.architecture,
        weak: edge.weak,
        upward: edge.upward,
        reexport: edge.reexport,
        delayed_init: edge.delayed_init,
        current_version: edge.current_version,
        compatibility_version: edge.compatibility_version,
        loader_conditional: edge.loader_conditional,
        install_name_matches: edge.install_name_matches,
        via: edge.via.join(" > ") || undefined,
        candidates: edge.candidates.length,
        resolution_status: edge.resolution.status,
        findings: findingsByEdge.get(index)?.join("; "),
      }),
    };
  });
  const { coverage } = trace;
  if (coverage.unparsed_images.length > 0)
    notes.push(`Unparsed images: ${coverage.unparsed_images.join(", ")}`);
  if (coverage.roots_without_architecture.length > 0)
    notes.push(
      `Roots without the selected architecture: ${coverage.roots_without_architecture.join(", ")}`,
    );
  return {
    graph_id: "dylib-dependencies",
    title: "Dylib dependencies",
    source_operation: "trace_dylib_resolution",
    evidence_id: evidence.evidence_id,
    ...capGraph([...nodes.values()], edges),
    coverage: { status: coverage.status, notes },
    limitations: mergeStrings(trace.limitations, evidence.limitations),
  };
};
