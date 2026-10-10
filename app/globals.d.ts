// 类型定义文件，避免 TypeScript 报错
declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.scss' {
  const content: string;
  export default content;
}

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'toolcool-color-picker': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      }
    }
    interface HTMLAttributes<T> {
      // Legacy markup uses name= on layout divs; CSS/JS selects them via [name=...].
      name?: string;
      // send_textarea carries connection-state placeholder overrides read by legacy JS.
      no_connection_text?: string;
      connected_text?: string;
      // List containers use this for empty-state text; i18n writes it via data-i18n="[no_items_text]...".
      no_items_text?: string;
      // HotSwap wrapper reads no_favs for its empty-state label via .attr().
      no_favs?: string;
    }
  }
}

export {};
