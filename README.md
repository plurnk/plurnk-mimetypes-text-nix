# @plurnk/plurnk-mimetypes-text-nix

`text/x-nix` mimetype handler for the [plurnk](https://github.com/plurnk) ecosystem. Tier 2 — uses [nix-community/tree-sitter-nix](https://github.com/nix-community/tree-sitter-nix) built to WASM (83 KB).

## what it does

Nix is expression-oriented; a `.nix` file is one top-level expression. Symbol extraction peels through `let` and `function_expression` wrappers to surface the bindings users actually navigate:

- `binding` whose value is a `function_expression` → **function** (with formals as params)
- `binding` whose name is SCREAMING_SNAKE_CASE → **constant**
- Other bindings → **field**
- `inherit foo bar;` / `inherit (src) foo bar;` → **field** per name
- `let x = ...; in body` → bindings emit as above; body is recursed
- `{ stdenv, lib }: stdenv.mkDerivation { ... }` → unwraps the function wrapper and surfaces the derivation's inner attrset (the standard derivation idiom)
- `rec { ... }` behaves the same as `{ ... }`

Three channels per the framework's #10 contract: symbols (above), deep-json (inherited TreeSitterExtractor walker — full named-children walk of the Nix AST), deep-xml (framework-projected).

## license

MIT.
