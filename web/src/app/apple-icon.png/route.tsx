import { markImage } from "../shell/mark-image";

export const dynamic = "force-static";

/** The home-screen icon: square, since the phone cuts its own corner. */
export function GET(): Response {
  return markImage(180, false);
}
