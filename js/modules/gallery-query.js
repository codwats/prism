/**
 * PostgREST query strings for public gallery artwork reads (#440).
 * Filters, sort and search run on the server so paging stays correct.
 */

export const GRID_PAGE_SIZE = 48;

// Everything the grid card, its filters and like buttons read; the detail
// view fetches '*' for one artwork.
export const GRID_COLUMNS = 'id,title,type,original_card_name,artist_id,artist_name,uploader_id,image_path,likes_count,downloads_count,downloads_enabled,highlighted,is_ai,created_at';

const ORDER = { liked: 'likes_count.desc', new: 'created_at.desc', dl: 'downloads_count.desc' };

// Double-quoted logic-tree value: commas, dots and parens are literal inside.
const quoted = v => `"${v.replace(/[\\"]/g, c => `\\${c}`)}"`;

/**
 * @param {{ type?: string, artistIds?: string[]|null, q?: string, sort?: string,
 *   featuredFirst?: boolean, id?: string, columns?: string, offset?: number, limit?: number }} spec
 */
export function artworksQuery({ type, artistIds, q, sort, featuredFirst, id, columns = GRID_COLUMNS, offset, limit } = {}) {
  const p = new URLSearchParams({ status: 'eq.approved', select: columns });
  if (id) p.set('id', `eq.${id}`);
  if (type && type !== 'all') p.set('type', `eq.${type}`);
  if (artistIds) p.set('artist_id', artistIds.length === 1 ? `eq.${artistIds[0]}` : `in.(${artistIds.join(',')})`);
  const trees = [];
  // LIKE-escape so a typed %, _ or \ matches itself (PostgREST passes them through to ILIKE).
  const term = (q || '').trim().replace(/[\\%_]/g, c => `\\${c}`);
  if (term) trees.push(`or(title.ilike.${quoted(`*${term}*`)},original_card_name.ilike.${quoted(`*${term}*`)})`);
  if (sort === 'dl') trees.push('or(type.neq.alter,downloads_enabled.is.true)'); // display-only Alters sit out (#342)
  if (trees.length) p.set('and', `(${trees.join(',')})`);
  p.set('order', `${featuredFirst ? 'highlighted.desc,' : ''}${ORDER[sort] || ORDER.liked},id.asc`);
  if (limit != null) p.set('limit', String(limit));
  if (offset != null) p.set('offset', String(offset));
  return `gallery_artworks?${p}`;
}
