import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextNix from "./TextNix.ts";

const metadata = { mimetype: "text/x-nix", glyph: "❄️", extensions: [".nix"] };
const h = () => new TextNix(metadata);

// Fixture exercises let-bindings, a lambda definition + application, attrsets,
// inherit / inherit-from, member application, and import. The string body
// carries decoys ("mkDerivation", "helper") that must NOT surface as refs.
const SRC = `{ pkgs ? import <nixpkgs> {} }:

let
  lib = pkgs.lib;
  helper = name: pkgs.writeText name "hello";
  greeting = "world";
in
pkgs.stdenv.mkDerivation {
  pname = "demo";
  description = helper "x";
  longDescription = "calls helper and mkDerivation by name";
  meta = {
    inherit greeting;
    inherit (lib) maintainers licenses;
  };
}
`;

describe("TextNix — references", () => {
    it("function application is a call edge", async () => {
        const refs = await h().references(SRC);
        // local lambda applied by name → resolves to the `helper` binding.
        assert.ok(refs.some((r) => r.name === "helper" && r.kind === "call"));
        // member application captures the trailing attr name.
        assert.ok(refs.some((r) => r.name === "writeText" && r.kind === "call"));
        assert.ok(refs.some((r) => r.name === "mkDerivation" && r.kind === "call"));
    });

    it("inherit names are use edges", async () => {
        const refs = await h().references(SRC);
        // `inherit greeting;` → resolves to the local `greeting` binding.
        assert.ok(refs.some((r) => r.name === "greeting" && r.kind === "use"));
        // `inherit (lib) maintainers licenses;` → attrs of lib.
        assert.ok(refs.some((r) => r.name === "maintainers" && r.kind === "use"));
        assert.ok(refs.some((r) => r.name === "licenses" && r.kind === "use"));
    });

    it("bare variable reads are NOT emitted (precision over recall)", async () => {
        const refs = await h().references(SRC);
        // `lib = pkgs.lib;` reads pkgs but is not a call/inherit → no ref.
        assert.ok(!refs.some((r) => r.name === "pkgs"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["demo", "world", "calls helper and mkDerivation by name"],
            expectJoins: [
                { refName: "helper", container: "description" },
                { refName: "greeting", container: "meta" },
            ],
            expectRefs: [
                { name: "helper", kind: "call" },
                { name: "greeting", kind: "use" },
            ],
        });
    });
});
