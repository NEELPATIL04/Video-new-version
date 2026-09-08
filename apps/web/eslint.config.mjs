import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "component", pattern: "src/components/**" },
      ],
    },
    rules: {
      // DEV_STANDARDS.md §3.1: app/ is routing only. features/lib/components
      // must never import from it — routing depends on business logic, not
      // the other way around.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: {
                element: { types: { anyOf: ["feature", "lib", "component"] } },
              },
              disallow: { to: { element: { type: "app" } } },
              message:
                "features/lib/components must not import from app/ (routing-only) — see DEV_STANDARDS.md §3.1",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
