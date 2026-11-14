"use client";

import dynamic from "next/dynamic";

// Talk's client pieces, as gates (openproduct-redesign OPR-4).
//
// A PRODUCT'S FOUR TABS ARE ONE MODULE, and a post's page shares its chunks:
// whatever client code that module reaches statically, every one of those
// pages downloads. Talk is drawn on one tab (and on an idea's page), so its
// client code — the filter and the signed-in read, the field's draft, a
// row's crew controls — is asked for here with `next/dynamic`, from one
// module (`client.tsx`): one chunk, fetched by a page that actually renders
// Talk and by no other. What every page carries is this file.
//
// THE SERVER STILL RENDERS THEM. `dynamic` keeps server rendering on, so the
// cached page holds the filter, the field and each row's actions as HTML —
// the same bytes for every visitor, and usable with scripts off. Only when
// the code arrives is different.
//
// THE NAMES ARE THE COMPONENTS' OWN, so the server files read as they would
// with a plain import.

export const TalkList = dynamic(() => import("./client").then((module) => module.TalkList));
export const TalkTitleField = dynamic(() => import("./client").then((module) => module.TalkTitleField));
export const ThreadActions = dynamic(() => import("./client").then((module) => module.ThreadActions));
