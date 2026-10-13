import { CORE_JS } from "./appJsCore.js";
import { GRAPH_JS } from "./appJsGraph.js";
import { LAYOUT_JS } from "./appJsLayout.js";
import { RESULTS_JS } from "./appJsResults.js";

/** Browser bundle assembled from plain-JS parts that share one strict-mode scope. */
export const APP_JS: string = [
  "(function () {",
  "'use strict';",
  CORE_JS,
  RESULTS_JS,
  LAYOUT_JS,
  GRAPH_JS,
  "})();",
  "",
].join("\n");
