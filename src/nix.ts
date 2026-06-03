import type { MimeSymbol, SymbolKind, TreeSitterNode } from "@plurnk/plurnk-mimetypes";

// Nix SPEC §3 mapping for tree-sitter-nix.
//
// Nix is expression-oriented: a .nix file is one top-level expression. We
// peel through wrappers (function_expression, let_expression) to surface the
// declarations users actually navigate:
//
//   binding (in attrset or let): expression: function_expression → function
//   binding: expression: anything else → field / constant / variable
//
// For the attrset case (most .nix files are `{ key = val; ... }`), we walk
// the binding_set and emit one symbol per top-level binding, using the
// attrpath as the name (dotted for `meta.description`).
//
// For function-wrapper files (`{ stdenv, lib }: stdenv.mkDerivation ...`),
// we descend into the body. Same for let-expressions: emit let bindings,
// then recurse into the `in` body.
export function extract(root: TreeSitterNode): MimeSymbol[] {
    const out: MimeSymbol[] = [];
    const expr = root.childForFieldName("expression");
    if (expr) walkExpression(expr, out);
    return out;
}

function walkExpression(node: TreeSitterNode, out: MimeSymbol[]): void {
    switch (node.type) {
        case "attrset_expression":
        case "rec_attrset_expression": {
            const bindingSet = findChildOfType(node, "binding_set");
            if (bindingSet) emitBindings(bindingSet, out);
            return;
        }
        case "let_expression": {
            const bindingSet = findChildOfType(node, "binding_set");
            if (bindingSet) emitBindings(bindingSet, out);
            // Also walk the `body` (the `in` expression) for nested structure.
            const body = node.childForFieldName("body");
            if (body) walkExpression(body, out);
            return;
        }
        case "function_expression": {
            // `{ a, b }: body` or `arg: body` — descend into body.
            const body = node.childForFieldName("body");
            if (body) walkExpression(body, out);
            return;
        }
        case "apply_expression":
        case "select_expression": {
            // Common in derivations: `stdenv.mkDerivation { ... }` — the
            // argument's attrset is what we want to surface.
            const args = node.childForFieldName("argument");
            if (args) walkExpression(args, out);
            return;
        }
        default:
            return;
    }
}

function emitBindings(bindingSet: TreeSitterNode, out: MimeSymbol[]): void {
    for (let i = 0; i < bindingSet.namedChildCount; i += 1) {
        const child = bindingSet.namedChild(i);
        if (!child) continue;
        if (child.type === "binding") {
            emitBinding(child, out);
        } else if (child.type === "inherit" || child.type === "inherit_from") {
            // `inherit foo bar;` or `inherit (src) foo bar;` — the names live
            // inside an `inherited_attrs` child, not directly.
            const attrs = findChildOfType(child, "inherited_attrs");
            if (!attrs) continue;
            for (let j = 0; j < attrs.namedChildCount; j += 1) {
                const sub = attrs.namedChild(j);
                if (sub && sub.type === "identifier") {
                    push(out, "field", sub.text, sub);
                }
            }
        }
    }
}

function emitBinding(binding: TreeSitterNode, out: MimeSymbol[]): void {
    const attrpath = binding.childForFieldName("attrpath");
    const expr = binding.childForFieldName("expression");
    if (!attrpath) return;
    const name = attrpathText(attrpath);
    if (!name) return;

    const kind: SymbolKind = expr && expr.type === "function_expression"
        ? "function"
        : (isScreamingSnake(name) ? "constant" : "field");

    if (kind === "function" && expr) {
        out.push({
            name,
            kind,
            line: binding.startPosition.row + 1,
            endLine: binding.endPosition.row + 1,
            params: extractFunctionParams(expr),
        });
    } else {
        push(out, kind, name, binding);
    }
}

// Attrpath like `meta.description` → "meta.description" as one symbol name.
// Reflects what jsonpath users would write to navigate it (with bracket
// notation if literal dots cause friction).
function attrpathText(attrpath: TreeSitterNode): string | null {
    const parts: string[] = [];
    for (let i = 0; i < attrpath.namedChildCount; i += 1) {
        const child = attrpath.namedChild(i);
        if (!child) continue;
        if (child.type === "identifier") {
            parts.push(child.text);
        } else if (child.type === "string_expression") {
            const sub = child.namedChild(0);
            if (sub) parts.push(sub.text);
        }
    }
    return parts.length > 0 ? parts.join(".") : null;
}

function extractFunctionParams(fn: TreeSitterNode): string[] {
    const out: string[] = [];
    // Universal arg: `arg: body`
    const universal = fn.childForFieldName("universal");
    if (universal && universal.type === "identifier") {
        out.push(universal.text);
    }
    // Destructured: `{ a, b ? default, ... }: body`
    const formals = fn.childForFieldName("formals");
    if (formals) {
        for (let i = 0; i < formals.namedChildCount; i += 1) {
            const child = formals.namedChild(i);
            if (!child) continue;
            if (child.type === "formal") {
                const name = child.childForFieldName("name");
                if (name) out.push(name.text);
            } else if (child.type === "ellipses") {
                out.push("...");
            }
        }
    }
    return out;
}

function findChildOfType(node: TreeSitterNode, type: string): TreeSitterNode | null {
    for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (child && child.type === type) return child;
    }
    return null;
}

function isScreamingSnake(name: string): boolean {
    if (name.length < 2) return false;
    let hasLetter = false;
    for (const c of name) {
        if (c >= "A" && c <= "Z") hasLetter = true;
        else if (c === "_" || (c >= "0" && c <= "9") || c === ".") continue;
        else return false;
    }
    return hasLetter;
}

function push(out: MimeSymbol[], kind: SymbolKind, name: string, node: TreeSitterNode): void {
    out.push({
        name,
        kind,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
    });
}
