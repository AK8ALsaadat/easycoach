import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
const config = [
  ...next,
  ...ts,
  { ignores: [".next/**", ".next-preview*/**", ".local-dev/**", "data/**", "artifacts/**", "outputs/**", "test-results/**", "next-env.d.ts"] },
];
export default config;
