/**
 * Oracle tag job index for the Swap Planner (#294). A hidden ranking signal
 * only — no tag or job name ever reaches the UI (#278).
 *
 * A job is one allowlisted Tagger tag rolled up through its child_ids
 * subtree, minus that job's pruned subtrees. Pinned by UUID; slugs change.
 * Source list and spot check: docs/research/oracle-tag-jobs.md on the
 * research/oracle-tag-jobs branch (#287).
 */

const API_BASE = 'https://api.scryfall.com';

// [slug, uuid, pruned uuids]
export const JOBS = [
  // Ramp
  ['land-ramp', '8e3bf407-28b7-49ab-83d5-5a9c46b1cd79'],
  ['mana-rock', '523a4f29-25ee-483c-8123-a8e62b62af5a'],
  ['mana-dork', 'bb6c0ff7-302d-48ff-aee9-5cfefd44e351'],
  ['ritual', 'e6ca4e8a-7261-4e96-afb0-9b07777b2481'],
  ['cost-reducer', '1a8e9788-b694-4330-a1a4-1aed6183bd57'],
  ['extra-land', '88e643b3-9fd4-4f46-9f36-cb1a72a7bc3c'],
  // Tutors
  ['tutor-land', 'cc2644e4-57c6-46f7-a69c-0cd82dbf2e9d', ['f3cdad26-6def-42eb-80c7-1f15f130b111']], // take-the-initiative
  ['tutor-card', 'f95a613c-8d77-42a9-ae4c-962ee0667f76'],
  ['tutor-creature', '23fd5e7c-3ddc-49b0-818f-bd5fabb04d8f'],
  ['tutor-artifact', '1c3fd051-4c17-4458-ba48-6171b1c968c2'],
  ['tutor-enchantment', '7754d888-a2b0-414a-9ab1-fde7f11d519f'],
  ['tutor-instant', 'a8ff6096-c1cf-4947-8624-e880af7ba5ab'],
  ['tutor-sorcery', 'f195348a-8bef-40fe-9ba2-0a88b264f756'],
  // Interaction
  ['removal-creature', 'd91e421d-ff87-4aad-a4bf-5aefc51252b6', ['ec095f01-e8cc-4d20-858d-d9057fc8cad3']], // burn-self
  ['removal-artifact', 'ea1ae714-3500-481b-9bdd-f33c57db8678'],
  ['removal-enchantment', 'ecee5d4b-f573-4ec8-b918-ad134873005e'],
  ['removal-planeswalker', '591fb358-e9d7-490e-8c15-24aecbbe697e'],
  ['removal-land', 'd2a563f5-66f7-442c-91cd-3e8b6c0fc0c5'],
  ['sweeper', '3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0'],
  ['counterspell', '690fc968-48ba-4854-a948-3db6bf19d3a9'],
  ['hate-graveyard', '486b89e1-bd1c-4cbc-8aaf-5e9249478650'],
  ['theft', '3404c16e-d708-492a-8c0f-27bb388e4cc8', [
    'da769041-6c73-40c7-866f-92163e23ccc3', // reanimate-from-any
    '54d0706a-a865-4c79-b8ba-12df4388c4c0', // reanimate-from-opponent
  ]],
  ['threaten', '5befdcad-c325-4c57-8e69-bf90a3fe19a8'],
  ['tapper', '486472f8-d4cd-4f88-ae7c-bb01e08cdd9d'],
  ['tax', '2ffad104-2092-410d-9a71-080c57b2e8c5'],
  ['pillowfort', '0387216a-0e23-47fb-a71d-7029f36dbf4e'],
  ['fog', 'a99e6bbe-59cc-41a0-96a9-2b462e673c89'],
  // Cards
  ['draw-engine', '0e87cf9c-591e-4f2a-b4fd-675021f120ae'],
  ['burst-draw', '333eca4b-cd56-41b5-b250-b3a711e501c1'],
  ['impulsive-draw', '78844aa5-9575-4bed-81c1-3330b5c56299'],
  ['loot', '1c2215a5-d782-4f1b-a223-2bbd26c1f532'],
  ['rummage', 'dd8b138e-0261-4f35-bac0-e2a931abd96f'],
  ['wheel', '6d7e2d11-3378-4972-a40f-0cfc34b1a806'],
  // Recursion
  ['reanimate', '524d7da0-9b4b-4567-bf38-a867673e21f3', ['9ef8a6a5-ebdc-4f81-9363-d5169c9225ac']], // crucible-of-worlds
  ['regrowth', 'efbbede8-8f54-4392-82a7-62ad84528aeb', ['bb7f3c65-306e-4bfe-8ceb-8e7795f87c81']], // pwdeck-tutor
  // Protection
  ['protects-creature', '7d4c079e-5fb5-487c-bb38-769d06ce1e2b'],
  ['flicker-creature', '7dca665f-435d-49f2-8974-d225fa0a8a42'],
  // Other
  ['sacrifice-outlet', 'c7bd55a7-1ea0-49da-b25e-0be470fbe8ec'],
  ['lifegain', '4caab3cc-1d60-44fb-a26a-cc833bc67c97'],
  ['burn-player', '081ebf89-e53b-47ff-88e8-1535068212b0'],
  ['discard', 'fce2f2c1-bb65-45e8-8c0a-dd66093067d7'],
  ['mill-self', 'bcae5f6a-f68b-4217-8f6c-0b4d31abd045'],
  ['mill-opponent', '514b336c-7e68-465e-874f-e3de89dbbb53'],
  ['anthem', '0454fcef-0118-4f10-b9d7-c071845bfbd4'],
  ['untapper', '524690dc-32c2-4b32-b94a-482585d087cd', ['41950283-23da-4142-815c-8371cd718310']], // untaps-self
  ['clone', '8873d737-51bf-416b-8124-9db521e00541'],
  ['copy-spell', 'cd853464-fcf5-4328-8170-fd51d0dba1f1'],
  ['extra-turn', '03b17ebf-f5d3-4063-bfd4-1ae156a16a8f'],
  ['extra-combat-phase', 'b0fb4bcb-d667-4799-9eee-7071c69bcd55'],
  ['repeatable-token-generator', 'a9657a5d-e7f8-4000-a795-7a78b5fb8923'],
  ['combat-trick', '36f2a0d4-b689-4011-9750-472dd786f2de'],
  ['gives-evasion', '6cdeab4c-72a6-4f40-ab19-14284d6cf775', ['076a51bc-9f68-43fa-af4c-696266e9001e']], // the-ring-tempts-you
  ['alternate-win-condition', '67db1fb0-26bd-49a0-9766-84ed4069dbdd'],
];

// Land families: the land-vs-land tiebreaker after color identity. Cycle tags
// are set-scoped, so each family rolls up its cycle-* children.
// ponytail: picked by hand from the 2026-09-27 file; extend when a family
// reads wrong in the Planner.
export const LAND_FAMILIES = [
  ['shockland', '1b645961-104e-48c9-813d-317fb21c24e2'],
  ['fetchland', 'b6f0c0ee-2bb3-48a1-8430-d3304121d95e'],
  ['painland', '69cdaa75-d349-4faf-9f7e-29f994b67ff3'],
  ['filterland', '81ed4278-4068-4529-8e38-250297bf92b2'],
  ['boltland', 'fdf6847e-6536-49a1-8e2e-c78f1dcfb67b'],
  ['conditional-tapland', 'f45f1a50-c48d-4312-87b0-ef7fd4b43852'],
  ['bounceland', '7a468894-584e-4ac4-9065-f5340efbea37'],
  ['gainland', '95f3b932-8153-4270-a69f-eee3bca4a2a8'],
  ['triland', 'f56ffe60-72b0-4275-b07d-45fcdcb199c2'],
  ['triome', '76477232-4840-4797-9281-3ea3a85010b5'],
  ['creatureland', 'b519fddd-6819-486e-83c2-280c45a59263'],
  ['storage-land', 'd417c3ae-592a-4a13-9bad-9740188a1b4b'],
  ['sol-land', 'f815d56f-f0ff-4703-b475-1339de1ff92e'],
  ['rainbow-land', '6671420c-fd48-417e-bd71-a1f3c5553866'],
  ['utility-land', '5e708c4d-9992-431e-afe1-fb5af05b2ea3'],
];

/**
 * Roll the pinned tags up into { oracleId: [slug, ...] } maps. Pure.
 * A pinned UUID missing from the day's file is skipped with a warning.
 * @param {Array} tags - tag objects from the Oracle Tags bulk file
 * @returns {{ jobs: Object<string, string[]>, landFamilies: Object<string, string[]> }}
 */
export function buildJobIndex(tags) {
  const byId = new Map(tags.map((t) => [t.id, t]));

  const rollUp = (pins) => {
    const index = {};
    for (const [slug, id, pruned = []] of pins) {
      if (!byId.has(id)) {
        console.warn(`Oracle tag ${slug} (${id}) is missing from the bulk file`);
        continue;
      }
      const seen = new Set(pruned);
      const stack = [id];
      const oracleIds = new Set();
      while (stack.length) {
        const tagId = stack.pop();
        if (seen.has(tagId) || !byId.has(tagId)) continue;
        seen.add(tagId);
        const tag = byId.get(tagId);
        for (const t of tag.taggings || []) oracleIds.add(t.oracle_id);
        stack.push(...(tag.child_ids || []));
      }
      for (const oracleId of oracleIds) (index[oracleId] ??= []).push(slug);
    }
    return index;
  };

  return { jobs: rollUp(JOBS), landFamilies: rollUp(LAND_FAMILIES) };
}

// One IndexedDB record: { day: 'YYYY-MM-DD' (UTC), jobs, landFamilies }.
// The derived index is too big for localStorage (#271).
const idbStore = {
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('prism', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('oracle-tags');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('oracle-tags', mode).objectStore('oracle-tags'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  get() {
    return this.run('readonly', (s) => s.get('index'));
  },
  set(value) {
    return this.run('readwrite', (s) => s.put(value, 'index'));
  },
};

async function downloadTags(fetchImpl) {
  const list = await (await fetchImpl(`${API_BASE}/bulk-data`)).json();
  const entry = list.data.find((d) => d.type === 'oracle_tags');
  // The file is served as application/gzip with no Content-Encoding, so the
  // browser hands over raw gzip. It is JSONL despite the docs saying array.
  const res = await fetchImpl(entry.jsonl_download_uri);
  if (!res.ok) throw new Error(`Oracle tags download failed: ${res.status}`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

let pending = null;

/**
 * The job index, built at most once a day (UTC). On any failure, the last
 * stored index if there is one, else null — ranking then falls back to type
 * and mana value.
 * @returns {Promise<{ jobs: Object, landFamilies: Object }|null>}
 */
export function loadJobIndex({ store = idbStore, fetchImpl = fetch, now = new Date() } = {}) {
  pending ??= (async () => {
    const day = now.toISOString().slice(0, 10);
    const stored = await store.get().catch(() => null);
    if (stored?.day === day) return stored;
    try {
      const index = { day, ...buildJobIndex(await downloadTags(fetchImpl)) };
      await store.set(index).catch((err) => console.warn('Oracle tag index not saved:', err.message));
      return index;
    } catch (err) {
      console.warn('Oracle tag index unavailable:', err.message);
      return stored || null;
    }
  })().finally(() => { pending = null; });
  return pending;
}
