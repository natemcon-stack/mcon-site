// The gallery, grouped the way someone browsing would expect rather than by date.
//
// Photos here are the ones that didn't earn a place on a service page but are still
// real work worth showing — and a gallery is the honest home for them. Kept as data so
// adding a photo is one line rather than an edit to the page layout.
import groups from "./gallery.json";

export const GALLERY_GROUPS = groups;
export const GALLERY_COUNT = groups.reduce((n, g) => n + g.photos.length, 0);
