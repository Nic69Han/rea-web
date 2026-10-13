/** Scalar graph attribute rendered in the node and edge side panel. */
export type WebAttributeValue = string | number | boolean | null;

/** How strongly an edge is established by REA analysis. */
export type WebEdgeResolution =
  | "observed"
  | "derived"
  | "inferred"
  | "resolved"
  | "ambiguous"
  | "unresolved"
  | "unknown";

/** One renderable graph projected from retained Evidence. */
export interface WebGraph {
  readonly graph_id: string;
  readonly title: string;
  readonly source_operation: string;
  readonly evidence_id: string | null;
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: string;
    readonly attributes: Readonly<Record<string, WebAttributeValue>>;
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly source: string;
    readonly target: string;
    readonly relation: string;
    readonly resolution: WebEdgeResolution;
    readonly attributes: Readonly<Record<string, WebAttributeValue>>;
  }[];
  readonly coverage: {
    readonly status: "complete" | "partial" | "unknown";
    readonly notes: readonly string[];
  };
  readonly limitations: readonly string[];
  readonly truncated: {
    readonly nodes_omitted: number;
    readonly edges_omitted: number;
  };
}

/** Provider-free operations the web UI runs. */
export type WebOperationName = "inspect_artifact" | "trace_dylib_resolution";

/** Outcome of one shared workflow; Evidence and errors are preserved verbatim. */
export interface WebOperationResult {
  readonly operation: WebOperationName;
  readonly status: "ok" | "error" | "not_applicable";
  readonly reason?: string;
  readonly evidence?: unknown;
  readonly error?: unknown;
}

/** Whether a retained upload directory was removed. */
export interface WebCleanup {
  readonly status: "removed" | "failed" | "not_needed";
  readonly detail?: string;
}

/** Response body of `POST /api/analyze`. */
export interface WebAnalysisResponse {
  readonly target: {
    readonly input_kind: "path" | "upload";
    readonly display_name: string;
    readonly local_path: string;
    readonly size_bytes: number | null;
    readonly sha256: string | null;
  };
  readonly operations: readonly WebOperationResult[];
  readonly graphs: readonly WebGraph[];
  readonly cleanup?: WebCleanup;
}
