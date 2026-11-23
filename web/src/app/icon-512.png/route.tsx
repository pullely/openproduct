import { markImage } from "../shell/mark-image";

export const dynamic = "force-static";

/** The web manifest's large icon. */
export function GET(): Response {
  return markImage(512);
}
