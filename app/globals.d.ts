// 类型定义文件，避免 TypeScript 报错
declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.scss' {
  const content: string;
  export default content;
}
