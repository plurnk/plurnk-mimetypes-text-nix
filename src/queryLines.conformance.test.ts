import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextNix.ts";

// #41: BOTH dialects carry real source lines.
const h = new Handler({"mimetype":"text/x-nix","glyph":"❄️","extensions":[".nix"]});
const src = "{ pkgs }:\n{\n  a = 1;\n}\n";

describe("#41 query-line conformance (both dialects)", () => {
    it("jsonpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "jsonpath", pattern: "$..*" }]); });
    it("xpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "xpath", pattern: "//*" }]); });
});
