/* JSON 은 vite 가 번들한다. 타입은 data.ts 에서 직접 붙인다(거대한 JSON 추론을 피함). */
declare module '*.json' {
  const value: unknown;
  export default value;
}
