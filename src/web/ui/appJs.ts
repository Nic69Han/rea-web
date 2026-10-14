import { BENCH_JS } from "./appJsBench.js";
import { CORE_JS } from "./appJsCore.js";
import { DECOMPILE_JS } from "./appJsDecompile.js";
import { GRAPH_JS } from "./appJsGraph.js";
import { LAYOUT_JS } from "./appJsLayout.js";
import { INPUT_JS } from "./appJsInput.js";
import { RESULTS_JS } from "./appJsResults.js";
import { PROGRESS_JS } from "./appJsProgress.js";
import { WORKSPACE_JS } from "./appJsWorkspace.js";

/** Browser bundle assembled from plain-JS parts that share one strict-mode scope. */
export const APP_JS: string = [
  "(function () {",
  "'use strict';",
  CORE_JS,
  RESULTS_JS,
  BENCH_JS,
  PROGRESS_JS,
  DECOMPILE_JS,
  WORKSPACE_JS,
  LAYOUT_JS,
  GRAPH_JS,
  INPUT_JS,
  "})();",
  "",
].join("\n");
