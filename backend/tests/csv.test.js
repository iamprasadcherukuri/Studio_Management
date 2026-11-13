import test from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "../../frontend/src/services/csv.js";
test("CSV preserves negative refund numbers while protecting spreadsheet formulas", () => {
  assert.equal(csvCell("-250.00"), '"-250.00"');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("  =1+1"), '"\'  =1+1"');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});
