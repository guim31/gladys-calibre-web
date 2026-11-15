// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Read the latest additions as a sentence (for a "say" or a notification:
// "2 new book(s) on Calibre-Web in the last 7 days: A (author) and B.").
// Nothing is written to Calibre-Web.
// -----------------------------------------------------------------------------

import { pick } from './texts.js';

export const SCENE_ACTIONS = {
  async read_latest_additions(hub) {
    const { sentence, count, title } = await hub.latestAdditions();
    return { sentence: pick(sentence, hub.config.language), count, title };
  },
};
