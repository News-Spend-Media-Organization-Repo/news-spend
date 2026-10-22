/** Most events one call may carry. */
export const PARTNER_EVENTS_MAX_BATCH = 100;

/**
 * Most distinct content items one call may name. The server looks the items up
 * in one query, so this bounds that query; a real screen shows a handful.
 */
export const PARTNER_EVENTS_MAX_DISTINCT_CONTENT = 25;

/**
 * Most events the server accepts from one device in a rolling day. A reader
 * sees a few hundred impressions a day at the extreme; this leaves room above
 * that while capping what a single scripted device id can write.
 */
export const PARTNER_EVENTS_DEVICE_DAILY_CAP = 2000;
