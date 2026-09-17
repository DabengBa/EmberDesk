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
    }
  }
}

export {};
