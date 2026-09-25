import { memo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import type { Element, ElementContent } from "hast";

function hastText(node: ElementContent | Element | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(hastText).join("");
  return "";
}

/** Copy text, reporting whether the frame allowed it. */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };
  return [copied, copy];
}

function CodeBlock({ lang, text, children }: { lang?: string; text: string; children: ReactNode }) {
  const [copied, copy] = useCopy();
  return (
    <div className="code-block">
      <div className="flex h-9 items-center justify-between border-b border-[var(--line)] pl-3.5 pr-1.5 text-[12px] text-[var(--fg-muted)]">
        <span className="font-mono">{lang || "code"}</span>
        <button
          type="button"
          onClick={() => copy(text)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    const code = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
    const classes = code?.properties?.className;
    const lang = Array.isArray(classes)
      ? classes.map(String).find((c) => c.startsWith("language-"))?.slice("language-".length)
      : undefined;
    return (
      <CodeBlock lang={lang} text={hastText(code).replace(/\n$/, "")}>
        {children}
      </CodeBlock>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

const plugins = [remarkGfm];

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
