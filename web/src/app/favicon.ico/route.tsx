import { markImage } from "../shell/mark-image";

export const dynamic = "force-static";

/** The address a browser asks for unprompted. A PNG at this path: every browser that requests it takes one. */
export function GET(): Response {
  return markImage(48);
}
