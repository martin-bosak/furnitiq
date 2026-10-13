/** Imperative handle to the 3D viewport, used by the photo button. */
export const viewportApi: { capture: null | (() => Promise<string>) } = { capture: null };
