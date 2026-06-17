import { TreeSitterExtractor } from "@plurnk/plurnk-mimetypes";
import type {
    HandlerContent,
    MimeRef,
    MimeSymbol,
    QueryConstructor,
    TreeSitterNode,
    TreeSitterParser,
    TreeSitterTree,
} from "@plurnk/plurnk-mimetypes";
import { extract, refsQuery } from "./nix.ts";

// text/x-nix handler. Tier 2 — tree-sitter-nix grammar built to WASM at
// publish time. Covers flakes, derivations, attrsets, let-expressions, and
// lambdas.
export default class TextNix extends TreeSitterExtractor {
    protected async loadParser(): Promise<TreeSitterParser> {
        const ts = await import("web-tree-sitter" as string) as {
            Parser: {
                init(): Promise<void>;
                new (): { setLanguage(lang: unknown): void; parse(content: string): unknown };
            };
            Language: {
                load(wasmPath: string): Promise<unknown>;
            };
            Query: QueryConstructor;
        };
        await ts.Parser.init();
        const wasmUrl = new URL("../nix.wasm", import.meta.url);
        const lang = await ts.Language.load(wasmUrl.pathname);
        this.setQueryContext(lang, ts.Query);
        const parser = new ts.Parser();
        parser.setLanguage(lang);
        return parser as unknown as TreeSitterParser;
    }

    protected extractFromTree(tree: TreeSitterTree, _content: HandlerContent): MimeSymbol[] {
        return extract(tree.rootNode);
    }

    // References channel (SPEC §16): call / use edges. The base collectRefs()
    // owns parse/compile/run/cleanup; every capture is a direct identifier and
    // the container resolves by line containment.
    override references(content: HandlerContent): Promise<MimeRef[]> {
        return this.collectRefs(content, refsQuery, (root) => extract(root));
    }
}
