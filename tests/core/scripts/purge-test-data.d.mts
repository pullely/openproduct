export const REASON: "test_data";
export const CATALOGUE_CEILING: 10;
export const ACTS_PATH: "/v1/openproduct/reports/acts";
export const CATALOGUE_PATH: "/v1/products";
export function run(input: {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof globalThis.fetch;
  log?: (line: string) => void;
}): Promise<number>;
