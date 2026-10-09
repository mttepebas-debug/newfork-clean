# Employee match selection and retry

Real local employee session in the existing synthetic Shift Hub workspace, 7 September 2026. The employee chose the 13 October shift and inspected a swap with Drew's 14 October shift. No request was submitted and no assignment changed.

Final screenshots, all visually inspected:

- `final-retry-dark-390.png`: 390 ×844 CSS px, failed candidate lookup, disabled send, inline retry, retained private note and responsibility message.
- `final-retry-light-320.png`: 320 ×844 CSS px, same error recovery controls in the light theme.
- `final-recovered-light-320.png`: successful retry, focus returned to the eligible shift selector; selecting Drew enables send and shows the received shift.

The normal candidate refresh was blocked only for the `shift-exchanges?shift_id=*` request through the tested browser tab's DevTools network control. Cached selection and note remained visible while sending was blocked. After unblocking, Enter on Retry made a real API request. The first run exposed focus falling back to the page; code was fixed, then the fresh form was exercised again and focus restoration was observed. The earlier `swap-retry-dark-390.png` records the first run, before that focus fix; it is not the final focus evidence.

`measurements.json` records viewport dimensions, dialog scroll/client width, retained note, disabled/enabled sending and focus on the match selector. Final records have no horizontal dialog overflow. The images show a scrolled form, so the header and other content can be above the captured viewport. The whole dialog remains scrollable.

The generic browser screenshot initially scaled the inactive tab's physical surface rather than the emulated CSS viewport. Final images use explicit CSS viewport clips through the tab's screenshot protocol. Temporary theme and viewport overrides and request blocking were cleared; account preferences were not saved. The synthetic draft was discarded and the original manager session restored.

Component tests separately prove direct-cover and swap selection disappearing on refetch, Enter/form-submit guarding, retry preserving the selection/note, switching an empty swap search to the cover pool, and avoiding focus theft when the user edits the note during retry. Removal of a selected candidate was not performed through the backend in this browser run. Native zoom, screen reader, real safe-area hardware and human task/visual scores remain separate acceptance gates.
