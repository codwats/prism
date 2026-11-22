// Local escape: core/utils' escapeHtml needs a DOM, and this module is unit-tested in Node.
const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// wa-lightbox is experimental in WA 3.15.0. Unupgraded, the tags are inert
// wrappers, so the thumbnail still renders and the page behaves as before.
export function lightboxHtml(artwork, thumbHtml) {
  if (!artwork.imageUrl) return thumbHtml;
  return `<wa-lightbox><wa-lightbox-item src="${escapeHtml(artwork.imageUrl)}" alt="${escapeHtml(artwork.title)}">${thumbHtml}</wa-lightbox-item></wa-lightbox>`;
}
