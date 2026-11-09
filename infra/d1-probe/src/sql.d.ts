// wrangler bundles `*.sql` as a Text module (wrangler.template.jsonc `rules`):
// the default export is the file's text.
declare module "*.sql" {
  const text: string;
  export default text;
}
