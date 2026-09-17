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
      // promptmanager.css reads this via attr(external_piece_text) and i18n writes it.
      external_piece_text?: string;
      // send_textarea carries connection-state placeholder overrides read by legacy JS.
      no_connection_text?: string;
      connected_text?: string;
    }
  }
}

export {};
