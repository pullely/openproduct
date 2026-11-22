import {
  ActivityIcon,
  BoltIcon,
  BookIcon,
  EyeIcon,
  FeedIcon,
  FolderIcon,
  MailIcon,
  PenIcon,
  PeopleIcon,
  PersonIcon,
  PlusIcon,
  PriceIcon,
  ProductsIcon,
  RssIcon,
  SeatIcon,
  StackIcon,
  ThreadIcon,
  TopicIcon,
} from "../ui/icons";

import type { RailIcon } from "./shell";

/**
 * A rail destination's glyph (openproduct-left-rail LR2), from one switch.
 *
 * `shell.ts` names a glyph by key so it stays plain data a test can hold;
 * this is where the key becomes a component, each imported by name so the
 * rail ships exactly the glyphs it draws.
 */
export function RailGlyph({ icon, className }: { readonly icon: RailIcon; readonly className?: string }) {
  switch (icon) {
    case "feed":
      return <FeedIcon className={className} />;
    case "products":
      return <ProductsIcon className={className} />;
    case "seats":
      return <SeatIcon className={className} />;
    case "activity":
      return <ActivityIcon className={className} />;
    case "threads":
      return <ThreadIcon className={className} />;
    case "mine":
      return <PersonIcon className={className} />;
    case "build":
      return <PlusIcon className={className} />;
    case "topics":
      return <TopicIcon className={className} />;
    case "people":
      return <PeopleIcon className={className} />;
    case "stack":
      return <StackIcon className={className} />;
    case "pricing":
      return <PriceIcon className={className} />;
    case "collections":
      return <FolderIcon className={className} />;
    case "digest":
      return <MailIcon className={className} />;
    case "rss":
      return <RssIcon className={className} />;
    case "docs":
      return <BookIcon className={className} />;
    case "posting":
      return <PenIcon className={className} />;
    case "checks":
      return <BoltIcon className={className} />;
    case "transparency":
      return <EyeIcon className={className} />;
  }
}
