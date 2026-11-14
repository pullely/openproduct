"use client";

// Talk's client pieces, as ONE module — so they are one chunk
// (openproduct-redesign OPR-4). `gates.tsx` asks for each by name from here;
// three separate imports would be three chunks, each carrying its own copy
// of what the three share (Talk's classes, its model, the overlay hook).

export { TalkList } from "./talk-list";
export { ThreadActions } from "./thread-actions";
export { TalkTitleField } from "./title-field";
