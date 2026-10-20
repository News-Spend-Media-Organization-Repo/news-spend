/**
 * The most one survey may pay, in Dream Points. Normal surveys pay hundreds;
 * this is a ceiling against a typo (200000 for 200) or a hostile edit, enforced
 * both when a survey is saved and when its points are awarded, so a survey that
 * already holds a larger value cannot pay it out.
 */
export const MAX_SURVEY_POINTS = 5000;

/** What a survey with no points set pays. */
export const DEFAULT_SURVEY_POINTS = 10;
