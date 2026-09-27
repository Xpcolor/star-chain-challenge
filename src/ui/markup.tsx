import {
  createElement,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from "react";
/** Compatibility boundary for existing help/record/choice templates. React owns
 * these nodes, too; no innerHTML replacement, script execution, or event attributes. */
export function Markup({ html }: { html: string }) {
  return useMemo(() => parseMarkup(html), [html]);
}
export function parseMarkup(html: string): ReactNode {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const convert = (node: Node, index: number): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (
      !(node instanceof Element) ||
      ["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(node.tagName)
    )
      return null;
    const props: Record<string, unknown> = {
      key: node.getAttribute("data-focus") || node.id || index,
    };
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name)) continue;
      const key =
        attr.name === "class"
          ? "className"
          : attr.name === "for"
            ? "htmlFor"
            : attr.name;
      if (key === "style") {
        const style: Record<string, string> = {};
        for (const item of attr.value.split(";")) {
          const split = item.indexOf(":");
          if (split < 0) continue;
          const k = item.slice(0, split).trim();
          style[
            k.startsWith("--")
              ? k
              : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          ] = item.slice(split + 1).trim();
        }
        props.style = style as CSSProperties;
      } else if (
        ["disabled", "open", "hidden", "multiple", "required"].includes(key)
      )
        props[key] = true;
      else if (key === "checked") props.defaultChecked = true;
      else if (
        key === "value" &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(node.tagName)
      )
        props.defaultValue = attr.value;
      else props[key] = attr.value;
    }
    const children = Array.from(node.childNodes).map(convert);
    return createElement(node.tagName.toLowerCase(), props, ...children);
  };
  return Array.from(doc.body.childNodes).map(convert);
}
