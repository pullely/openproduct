// The workspace picker door (seam edge S13). The door itself lives in
// `ui/workspace-picker.ts` since openproduct-redesign OPR-3: `/me` lists your
// products now and offers the same door, and nothing outside `studio/` may
// import from `studio/`. This file keeps the studio's own import path.
export { LINK_WORKSPACE_LABEL, WORKSPACE_PICKER_PATH, consoleWorkspacePickerUrl } from "../ui/workspace-picker";
