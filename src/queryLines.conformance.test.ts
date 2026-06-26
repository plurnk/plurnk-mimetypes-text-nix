import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextNix.ts";

const h = new Handler({"mimetype":"text/x-nix","glyph":"❄️","extensions":[".nix"]});

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [{ source: "{ pkgs }:\n{\n  a = 1;\n  b = pkgs.hello;\n}\n", dialect: "jsonpath", pattern: "$..*" }]);
    });
});
