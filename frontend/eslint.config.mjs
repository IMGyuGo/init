import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/assets/interviewer-cubism/**",
    "vendor/**",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
