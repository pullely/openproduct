import type { SectionIcon } from "./shell";

import { BuildIcon, PeopleIcon, RoleIcon, TopicIcon } from "../ui/icons";

/**
 * A section's glyph (OB1, D6). The two navs — the header's pills and the
 * phone's bar — render the same list, so they render the same glyph from the
 * same switch; a second mapping is a second answer to "what does this mean".
 */
export function SectionGlyph({ icon, className }: { readonly icon: SectionIcon; readonly className?: string }) {
  switch (icon) {
    case "build":
      return <BuildIcon className={className} />;
    case "role":
      return <RoleIcon className={className} />;
    case "topic":
      return <TopicIcon className={className} />;
    case "people":
      return <PeopleIcon className={className} />;
  }
}
