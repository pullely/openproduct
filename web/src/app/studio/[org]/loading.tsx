// A listing's editor, arriving from the studio (openproduct-studio OSD5).
//
// The listing's layout reads the profile before it draws the hero, so the
// first entry into an editor has nothing of it on screen yet. This is the
// editor's shape — the head row, the hero card with its cover, tile and strip,
// and the columns — rather than the studio list's, which it used to inherit.

import { TILE } from "../../ui/design";
import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../../ui/skeleton";
import { StepSkeleton } from "./[profile]/step-skeleton";

export default function ListingEditorLoading() {
  return (
    <main className="box-border mx-auto w-full max-w-[1180px] px-7 pb-[72px] pt-5 max-sm:px-4">
      <LoadingAnnouncement what="your listing" />
      <div className="flex items-center gap-3">
        <ShimmerLine width="w-[120px]" className="h-[14px]" />
        <span className="flex-1" />
        <Shimmer className="h-[24px] w-[64px] rounded-full" />
        <Shimmer className="h-[40px] w-[88px] rounded-full" />
      </div>
      <section className={`mt-4 ${TILE}`}>
        <Shimmer className="h-[96px] rounded-b-none rounded-t-[16px]" />
        <div className="-mt-9 flex items-start gap-5 px-6 max-sm:px-4">
          <Shimmer className="h-[72px] w-[72px] rounded-[16px] border-[3px] border-card" />
          <div className="flex-1 pt-11">
            <ShimmerLine width="w-[200px]" className="h-[26px]" />
            <ShimmerLine width="w-[60%]" className="mt-2.5" />
          </div>
        </div>
        <div className="mt-6 flex gap-1 border-t border-line px-5">
          {[80, 64, 58, 120, 62, 74, 96].map((w, i) => (
            <span key={i} style={{ width: w }} className="block py-2.5">
              <Shimmer className="h-[32px] rounded-full" />
            </span>
          ))}
        </div>
      </section>
      <StepSkeleton />
    </main>
  );
}
