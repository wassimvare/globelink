import { runNodeSequence } from "./lib/run-node-sequence.mjs";

runNodeSequence(
  "GlobeLink map checks",
  Array.from({ length: 15 }, (_, index) => `scripts/map-v${index + 2}-check.mjs`),
);
