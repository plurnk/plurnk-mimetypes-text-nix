import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextNix from "./TextNix.ts";

const metadata = { mimetype: "text/x-nix", glyph: "❄️", extensions: [".nix"] as const };
const h = () => new TextNix(metadata);

describe("TextNix — top-level attrset", () => {
    it("emits one field per binding", async () => {
        const syms = await h().extractRaw('{ name = "x"; version = "1.0"; }\n');
        assert.equal(syms.find((s) => s.name === "name")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "version")?.kind, "field");
    });

    it("dotted attrpath surfaces as a single symbol name", async () => {
        const syms = await h().extractRaw('{ meta.description = "hi"; meta.license = "MIT"; }\n');
        assert.equal(syms.find((s) => s.name === "meta.description")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "meta.license")?.kind, "field");
    });

    it("rec { ... } attrset behaves the same", async () => {
        const syms = await h().extractRaw('rec { a = 1; b = a + 1; }\n');
        assert.equal(syms.find((s) => s.name === "a")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "b")?.kind, "field");
    });
});

describe("TextNix — let expressions", () => {
    it("let bindings surface as fields", async () => {
        const syms = await h().extractRaw('let x = 1; y = 2; in x + y\n');
        assert.equal(syms.find((s) => s.name === "x")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "y")?.kind, "field");
    });

    it("SCREAMING_SNAKE in let body → constant", async () => {
        const syms = await h().extractRaw('let MAX_TRIES = 10; in MAX_TRIES\n');
        assert.equal(syms.find((s) => s.name === "MAX_TRIES")?.kind, "constant");
    });
});

describe("TextNix — function declarations", () => {
    it("binding to a function_expression → function with params", async () => {
        const syms = await h().extractRaw('{ add = a: b: a + b; }\n');
        const fn = syms.find((s) => s.name === "add");
        assert.equal(fn?.kind, "function");
        // First lambda param is captured; deeper currying levels live inside
        // the body so only the outermost param surfaces here.
        assert.deepEqual(fn?.params, ["a"]);
    });

    it("destructured formals appear in params", async () => {
        const syms = await h().extractRaw('{ wrap = { a, b ? 1 }: a + b; }\n');
        const fn = syms.find((s) => s.name === "wrap");
        assert.equal(fn?.kind, "function");
        assert.deepEqual(fn?.params, ["a", "b"]);
    });

    it("ellipses in formals surface as ...", async () => {
        const syms = await h().extractRaw('{ flexible = { a, ... }: a; }\n');
        const fn = syms.find((s) => s.name === "flexible");
        assert.deepEqual(fn?.params, ["a", "..."]);
    });
});

describe("TextNix — function-wrapper files (derivations)", () => {
    it("`{ stdenv, lib }: stdenv.mkDerivation { ... }` surfaces the inner attrset's bindings", async () => {
        const src = [
            "{ stdenv, lib }:",
            "stdenv.mkDerivation {",
            '  pname = "my-package";',
            '  version = "1.0";',
            '  src = ./.;',
            "}",
        ].join("\n");
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "pname")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "version")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "src")?.kind, "field");
    });
});

describe("TextNix — inherit", () => {
    it("inherit foo bar; emits a field per name", async () => {
        const syms = await h().extractRaw('{ inherit foo bar; }\n');
        assert.equal(syms.find((s) => s.name === "foo")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "bar")?.kind, "field");
    });
});

describe("TextNix — real-world flake.nix", () => {
    it("typical flake outputs structure parses + extracts cleanly", async () => {
        const src = [
            "{",
            '  description = "Example";',
            "  inputs = {",
            '    nixpkgs.url = "github:NixOS/nixpkgs";',
            "  };",
            "  outputs = { self, nixpkgs }: {",
            "    packages.default = nixpkgs.hello;",
            "  };",
            "}",
        ].join("\n");
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "description")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "inputs")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "outputs")?.kind, "function");
    });
});

describe("TextNix — error handling", () => {
    it("empty input → []", async () => {
        assert.deepEqual(await h().extractRaw(""), []);
    });

    it("doesn't throw on malformed source", async () => {
        await assert.doesNotReject(h().extractRaw("{ ((( broken"));
    });

    it("binary content → []", async () => {
        assert.deepEqual(await h().extractRaw(new Uint8Array([1, 2, 3])), []);
    });
});

describe("TextNix — deep-json channel", () => {
    it("returns parse tree with native node types", async () => {
        const tree = await h().deepJson('{ a = 1; }\n') as { type: string; children?: unknown[] };
        assert.equal(tree.type, "source_code");
        assert.ok(Array.isArray(tree.children));
    });
});
