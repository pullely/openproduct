// @ts-check

/**
 * `no-principal-id-as-name` (saas-people PP6).
 *
 * Fails a build that renders a principal id where a human reads a **name**.
 *
 * The epic swept 22 such sites out of the console; this is what stops the 23rd
 * from arriving. PP4's `person-sweep.test.ts` pins the sites already paid for —
 * this catches new ones anywhere, including the demo routes.
 *
 * ## What counts as "read as a name"
 *
 * Four sinks, per `specs/epics/saas-people/design.md`:
 *
 *   - a JSX **text child**            `<span>{m.subjectId}</span>`
 *   - `title`                          `title={actor.actorId}`
 *   - `aria-label`                     `aria-label={`Role for ${m.subjectId}`}`
 *   - `resourceName`                   `resourceName={pendingRemove.subjectId}`
 *
 * ## What does not
 *
 * PP-1 is about names, not about hiding ids. Ids stay first-class **as ids**,
 * so the rule deliberately does not fire on:
 *
 *   - `<code>` / `<pre>`, or any element whose className carries `font-mono` —
 *     the person page prints the id in mono beside a copy button on purpose;
 *   - any other attribute (`value`, `copyValue`, `key`, `href`, `subjectId`) —
 *     those are identifiers used as identifiers;
 *   - anything inside `<Person …>` or a `Person*` component's own definition.
 *
 * R-2 in the epic's risks says the failure mode of a rule like this is false
 * positives, because a rule people disable protects nothing. Hence the narrow
 * sinks and the mono/code exemptions — and hence the escape hatch below.
 *
 * ## Escape hatch
 *
 * A line preceded by `// people-lint: id-as-id <reason>` is allowed. The reason
 * is required: an allowlist entry that does not say why is how a guard rots.
 */

/** Identifier suffixes that name a principal. */
const PRINCIPAL_RE = /^(subjectId|actorId|principalId|createdBy|invitedBy|spawnedBy|revokedBy|approvedBy|adoptedBy)$/;

/** Attributes a human reads as the thing's name. */
const NAME_ATTRIBUTES = new Set([
  "title",
  "aria-label",
  "resourceName",
  "label",
  // `name` earns its place: the members roster's `<SubjectIdentity name={…}>`
  // was inventory O1, the worst site in the epic. It is safe despite how common
  // the attribute is, because the rule only fires when the VALUE is a principal
  // reference — `name="email"` on a form field never matches.
  "name",
]);

/** Elements whose content is understood as machine text, not a name. */
const MONO_ELEMENTS = new Set(["code", "pre", "MonoRef"]);

const ALLOW_MARKER = /people-lint:\s*id-as-id\b(.*)$/;

/**
 * True when a line carries the escape hatch AND an actual reason.
 *
 * The reason is mandatory, so the trailing comment delimiters have to be
 * stripped before measuring it — otherwise `{/* people-lint: id-as-id *\/}`
 * reads its own `*\/` as the justification, which is how a "reason required"
 * rule quietly becomes a "marker required" one.
 */
function hasAllowReason(text) {
  const match = ALLOW_MARKER.exec(text ?? "");
  if (!match) return false;
  const reason = (match[1] ?? "")
    .replace(/\*\/\s*\}?\s*$/, "")
    .replace(/-->\s*$/, "")
    .trim();
  return reason.length >= 3;
}

/** The identifier at the end of `a.b.subjectId` / `subjectId`, or null. */
function principalName(node) {
  if (!node) return null;
  if (node.type === "Identifier" && PRINCIPAL_RE.test(node.name)) return node.name;
  if (node.type === "MemberExpression" && node.property?.type === "Identifier") {
    if (PRINCIPAL_RE.test(node.property.name)) return node.property.name;
    // `createdBy.id` / `actor.id` — the id OF a principal-shaped object.
    if (
      node.property.name === "id" &&
      node.object?.type === "MemberExpression" &&
      node.object.property?.type === "Identifier" &&
      PRINCIPAL_RE.test(node.object.property.name)
    ) {
      return `${node.object.property.name}.id`;
    }
  }
  if (node.type === "ChainExpression") return principalName(node.expression);
  if (node.type === "TSNonNullExpression") return principalName(node.expression);
  return null;
}

/** Any principal reference inside a template literal or logical fallback. */
function findPrincipal(node) {
  if (!node) return null;
  const direct = principalName(node);
  if (direct) return direct;
  if (node.type === "TemplateLiteral") {
    for (const expression of node.expressions) {
      const hit = findPrincipal(expression);
      if (hit) return hit;
    }
  }
  if (node.type === "LogicalExpression" || node.type === "BinaryExpression") {
    return findPrincipal(node.left) ?? findPrincipal(node.right);
  }
  if (node.type === "ConditionalExpression") {
    return findPrincipal(node.consequent) ?? findPrincipal(node.alternate);
  }
  return null;
}

function elementName(openingElement) {
  const name = openingElement?.name;
  if (!name) return "";
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") return name.property?.name ?? "";
  return "";
}

/** True when the element presents machine text: `<code>`, or `font-mono`. */
function isMonoElement(openingElement, sourceCode) {
  if (MONO_ELEMENTS.has(elementName(openingElement))) return true;
  for (const attribute of openingElement?.attributes ?? []) {
    if (attribute.type !== "JSXAttribute") continue;
    if (attribute.name?.name !== "className") continue;
    const text = sourceCode.getText(attribute);
    if (text.includes("font-mono")) return true;
  }
  return false;
}

/**
 * Is this site allowlisted?
 *
 * Scans the source text of this line and the two above it, rather than
 * `getCommentsBefore`. In JSX the idiomatic comment is `{/* … *\/}`, which is
 * an expression container holding the comment — so ESLint does not report it as
 * a comment "before" the next container, and a token-based check silently never
 * matches. Text is what the author sees; text is what this reads.
 */
function isAllowed(node, sourceCode) {
  const start = node.loc.start.line - 1;
  for (let i = Math.max(0, start - 2); i <= start; i++) {
    if (hasAllowReason(sourceCode.lines[i])) return true;
  }
  return sourceCode.getCommentsBefore(node).some((c) => hasAllowReason(c.value));
}

/** @type {import('eslint').Rule.RuleModule} */
export const noPrincipalIdAsName = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Render a principal id through <Person> rather than as a name a human reads (saas-people PP-1).",
    },
    schema: [],
    messages: {
      asChild:
        "`{{ref}}` is a principal id rendered as text a human reads. Use <Person subjectId={…}> so it resolves to a name; ids stay available on the chip's card, in mono with a copy button, and in --json. If this really is an id shown AS an id, put it in <code>/font-mono, or add `// people-lint: id-as-id <reason>`.",
      asAttribute:
        "`{{ref}}` is a principal id used as the `{{attr}}` a human (or a screen reader) reads. Resolve it with `usePersonName(...)` first — a uuid read aloud is unusable. If it really is an id, add `// people-lint: id-as-id <reason>`.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? context.getFilename();
    // The primitive itself, and the directory that feeds it, necessarily hold
    // subject ids in every position.
    if (/[\\/]people[\\/]person|[\\/]lib[\\/]people[\\/]/.test(filename)) return {};

    return {
      JSXExpressionContainer(node) {
        const ref = findPrincipal(node.expression);
        if (!ref) return;
        const parent = node.parent;

        // Sink 1: a text child of an element.
        if (parent?.type === "JSXElement") {
          if (isMonoElement(parent.openingElement, sourceCode)) return;
          if (elementName(parent.openingElement).startsWith("Person")) return;
          if (isAllowed(node, sourceCode)) return;
          context.report({ node, messageId: "asChild", data: { ref } });
          return;
        }

        // Sink 2: a name-shaped attribute.
        if (parent?.type === "JSXAttribute") {
          const attr = parent.name?.name;
          if (typeof attr !== "string" || !NAME_ATTRIBUTES.has(attr)) return;
          const owner = parent.parent;
          if (elementName(owner).startsWith("Person")) return;
          if (isAllowed(parent, sourceCode)) return;
          context.report({ node, messageId: "asAttribute", data: { ref, attr } });
        }
      },
    };
  },
};

export default noPrincipalIdAsName;
