import * as migration_20260203_111507_init from './20260203_111507_init';
import * as migration_20260204_225235_optional_category_relationship from './20260204_225235_optional_category_relationship';
import * as migration_20260210_123514 from './20260210_123514';
import * as migration_20260213_071200_replace_slugField_with_payload_s from './20260213_071200_replace_slugField_with_payload_s';
import * as migration_20260213_185705_fix_img_full_url from './20260213_185705_fix_img_full_url';
import * as migration_20260214_144447_shop_analytics from './20260214_144447_shop_analytics';
import * as migration_20260214_211145_partner_content_cleanup from './20260214_211145_partner_content_cleanup';
import * as migration_20260215_184235 from './20260215_184235';
import * as migration_20260309_051932 from './20260309_051932';
import * as migration_20260310_100454 from './20260310_100454';
import * as migration_20260314_193220 from './20260314_193220';
import * as migration_20260316_140421 from './20260316_140421';
import * as migration_20260322_185733 from './20260322_185733';
import * as migration_20260418_214851 from './20260418_214851';
import * as migration_20260418_234555 from './20260418_234555';
import * as migration_20260517_100032 from './20260517_100032';
import * as migration_20260517_141537 from './20260517_141537';
import * as migration_20260517_232052 from './20260517_232052';
import * as migration_20260523_173532 from './20260523_173532';
import * as migration_20260608_004551_notification_cascade_delete from './20260608_004551_notification_cascade_delete';
import * as migration_20260608_013824_fix_notification_cascade from './20260608_013824_fix_notification_cascade';
import * as migration_20260620_215834 from './20260620_215834';
import * as migration_20260621_220355_reactions_to_polymorphic from './20260621_220355_reactions_to_polymorphic';
import * as migration_20260621_220614_fix_user_news_cascade from './20260621_220614_fix_user_news_cascade';
import * as migration_20260622_120000_comments_cascade_delete from './20260622_120000_comments_cascade_delete';
import * as migration_20260627_122202 from './20260627_122202';
import * as migration_20260627_131103 from './20260627_131103';
import * as migration_20260627_132437 from './20260627_132437';
import * as migration_20260702_095305 from './20260702_095305';
import * as migration_20260702_102512 from './20260702_102512';
import * as migration_20260718_071254 from './20260718_071254';
import * as migration_20260719_060000_backfill_comment_counts from './20260719_060000_backfill_comment_counts';
import * as migration_20260721_110118 from './20260721_110118';
import * as migration_20260811_093634 from './20260811_093634';
import * as migration_20260815_041656 from './20260815_041656';
import * as migration_20260815_091616 from './20260815_091616';
import * as migration_20260816_010657 from './20260816_010657';
import * as migration_20260818_171212 from './20260818_171212';
import * as migration_20260820_172902_scheduled_notification_timezone from './20260820_172902_scheduled_notification_timezone';
import * as migration_20260821_000000_fix_comments_news_cascade from './20260821_000000_fix_comments_news_cascade';
import * as migration_20260821_010000_reapply_cascade_fixes from './20260821_010000_reapply_cascade_fixes';
import * as migration_20260822_194144_drop_legacy_lottery from './20260822_194144_drop_legacy_lottery';
import * as migration_20260823_073220_partner_content_weight from './20260823_073220_partner_content_weight';
import * as migration_20260823_090000_delete_cascade_notifications from './20260823_090000_delete_cascade_notifications';
import * as migration_20260823_093000_delete_cascade_partners_giveaway from './20260823_093000_delete_cascade_partners_giveaway';
import * as migration_20260905_120000_analytics_retention_and_feed_indexes from './20260905_120000_analytics_retention_and_feed_indexes';
import * as migration_20260914_090000_engagement_source_and_ssv from './20260914_090000_engagement_source_and_ssv';
import * as migration_20260919_031416_schema_catchup_payload_3_90 from './20260919_031416_schema_catchup_payload_3_90';
import * as migration_20260919_050533_narrow_news_type_to_article from './20260919_050533_narrow_news_type_to_article';
import * as migration_20260920_053947_analytics_event_ids from './20260920_053947_analytics_event_ids';
import * as migration_20260920_215557_partner_postbacks from './20260920_215557_partner_postbacks';
import * as migration_20260922_130000_drop_partner_api_key from './20260922_130000_drop_partner_api_key';
import * as migration_20260929_091515 from './20260929_091515';
import * as migration_20260929_131630 from './20260929_131630';
import * as migration_20261002_063111_giveaway_send_announcement from './20261002_063111_giveaway_send_announcement';
import * as migration_20261003_170057_discover_events from './20261003_170057_discover_events';
import * as migration_20261003_170128_game_reports from './20261003_170128_game_reports';
import * as migration_20261005_210416 from './20261005_210416';
import * as migration_20261006_080000_email_templates_visual_only from './20261006_080000_email_templates_visual_only';
import * as migration_20261006_083000_email_templates_slug_lock from './20261006_083000_email_templates_slug_lock';
import * as migration_20261006_084500_email_templates_builtin_slug from './20261006_084500_email_templates_builtin_slug';
import * as migration_20261006_090000_email_templates_no_audit_sidebar from './20261006_090000_email_templates_no_audit_sidebar';
import * as migration_20261014_080850_featured_until from './20261014_080850_featured_until';
import * as migration_20261014_191943 from './20261014_191943';
import * as migration_20261017_161124_faq from './20261017_161124_faq';
import * as migration_20261017_161125_faq_seed from './20261017_161125_faq_seed';
import * as migration_20261020_080630_guest_events from './20261020_080630_guest_events';
import * as migration_20261020_152240_survey_settings_and_provider_ref from './20261020_152240_survey_settings_and_provider_ref';
import * as migration_20261020_152616_add_survey_offer_events from './20261020_152616_add_survey_offer_events';
import * as migration_20261020_214706_partner_offers from './20261020_214706_partner_offers';
import * as migration_20261021_034146_partner_content_events from './20261021_034146_partner_content_events';
import * as migration_20261022_150623_review_prompted_at from './20261022_150623_review_prompted_at';
import * as migration_20261022_170313_admins_trash from './20261022_170313_admins_trash';
import * as migration_20261030_092949_news_notification_copy from './20261030_092949_news_notification_copy';

export const migrations = [
  {
    up: migration_20260203_111507_init.up,
    down: migration_20260203_111507_init.down,
    name: '20260203_111507_init',
  },
  {
    up: migration_20260204_225235_optional_category_relationship.up,
    down: migration_20260204_225235_optional_category_relationship.down,
    name: '20260204_225235_optional_category_relationship',
  },
  {
    up: migration_20260210_123514.up,
    down: migration_20260210_123514.down,
    name: '20260210_123514',
  },
  {
    up: migration_20260213_071200_replace_slugField_with_payload_s.up,
    down: migration_20260213_071200_replace_slugField_with_payload_s.down,
    name: '20260213_071200_replace_slugField_with_payload_s',
  },
  {
    up: migration_20260213_185705_fix_img_full_url.up,
    down: migration_20260213_185705_fix_img_full_url.down,
    name: '20260213_185705_fix_img_full_url',
  },
  {
    up: migration_20260214_144447_shop_analytics.up,
    down: migration_20260214_144447_shop_analytics.down,
    name: '20260214_144447_shop_analytics',
  },
  {
    up: migration_20260214_211145_partner_content_cleanup.up,
    down: migration_20260214_211145_partner_content_cleanup.down,
    name: '20260214_211145_partner_content_cleanup',
  },
  {
    up: migration_20260215_184235.up,
    down: migration_20260215_184235.down,
    name: '20260215_184235',
  },
  {
    up: migration_20260309_051932.up,
    down: migration_20260309_051932.down,
    name: '20260309_051932',
  },
  {
    up: migration_20260310_100454.up,
    down: migration_20260310_100454.down,
    name: '20260310_100454',
  },
  {
    up: migration_20260314_193220.up,
    down: migration_20260314_193220.down,
    name: '20260314_193220',
  },
  {
    up: migration_20260316_140421.up,
    down: migration_20260316_140421.down,
    name: '20260316_140421',
  },
  {
    up: migration_20260322_185733.up,
    down: migration_20260322_185733.down,
    name: '20260322_185733',
  },
  {
    up: migration_20260418_214851.up,
    down: migration_20260418_214851.down,
    name: '20260418_214851',
  },
  {
    up: migration_20260418_234555.up,
    down: migration_20260418_234555.down,
    name: '20260418_234555',
  },
  {
    up: migration_20260517_100032.up,
    down: migration_20260517_100032.down,
    name: '20260517_100032',
  },
  {
    up: migration_20260517_141537.up,
    down: migration_20260517_141537.down,
    name: '20260517_141537',
  },
  {
    up: migration_20260517_232052.up,
    down: migration_20260517_232052.down,
    name: '20260517_232052',
  },
  {
    up: migration_20260523_173532.up,
    down: migration_20260523_173532.down,
    name: '20260523_173532',
  },
  {
    up: migration_20260608_004551_notification_cascade_delete.up,
    down: migration_20260608_004551_notification_cascade_delete.down,
    name: '20260608_004551_notification_cascade_delete',
  },
  {
    up: migration_20260608_013824_fix_notification_cascade.up,
    down: migration_20260608_013824_fix_notification_cascade.down,
    name: '20260608_013824_fix_notification_cascade',
  },
  {
    up: migration_20260620_215834.up,
    down: migration_20260620_215834.down,
    name: '20260620_215834',
  },
  {
    up: migration_20260621_220355_reactions_to_polymorphic.up,
    down: migration_20260621_220355_reactions_to_polymorphic.down,
    name: '20260621_220355_reactions_to_polymorphic',
  },
  {
    up: migration_20260621_220614_fix_user_news_cascade.up,
    down: migration_20260621_220614_fix_user_news_cascade.down,
    name: '20260621_220614_fix_user_news_cascade',
  },
  {
    up: migration_20260622_120000_comments_cascade_delete.up,
    down: migration_20260622_120000_comments_cascade_delete.down,
    name: '20260622_120000_comments_cascade_delete',
  },
  {
    up: migration_20260627_122202.up,
    down: migration_20260627_122202.down,
    name: '20260627_122202',
  },
  {
    up: migration_20260627_131103.up,
    down: migration_20260627_131103.down,
    name: '20260627_131103',
  },
  {
    up: migration_20260627_132437.up,
    down: migration_20260627_132437.down,
    name: '20260627_132437',
  },
  {
    up: migration_20260702_095305.up,
    down: migration_20260702_095305.down,
    name: '20260702_095305',
  },
  {
    up: migration_20260702_102512.up,
    down: migration_20260702_102512.down,
    name: '20260702_102512',
  },
  {
    up: migration_20260718_071254.up,
    down: migration_20260718_071254.down,
    name: '20260718_071254',
  },
  {
    up: migration_20260719_060000_backfill_comment_counts.up,
    down: migration_20260719_060000_backfill_comment_counts.down,
    name: '20260719_060000_backfill_comment_counts',
  },
  {
    up: migration_20260721_110118.up,
    down: migration_20260721_110118.down,
    name: '20260721_110118',
  },
  {
    up: migration_20260811_093634.up,
    down: migration_20260811_093634.down,
    name: '20260811_093634',
  },
  {
    up: migration_20260815_041656.up,
    down: migration_20260815_041656.down,
    name: '20260815_041656',
  },
  {
    up: migration_20260815_091616.up,
    down: migration_20260815_091616.down,
    name: '20260815_091616',
  },
  {
    up: migration_20260816_010657.up,
    down: migration_20260816_010657.down,
    name: '20260816_010657',
  },
  {
    up: migration_20260818_171212.up,
    down: migration_20260818_171212.down,
    name: '20260818_171212',
  },
  {
    up: migration_20260820_172902_scheduled_notification_timezone.up,
    down: migration_20260820_172902_scheduled_notification_timezone.down,
    name: '20260820_172902_scheduled_notification_timezone',
  },
  {
    up: migration_20260821_000000_fix_comments_news_cascade.up,
    down: migration_20260821_000000_fix_comments_news_cascade.down,
    name: '20260821_000000_fix_comments_news_cascade',
  },
  {
    up: migration_20260821_010000_reapply_cascade_fixes.up,
    down: migration_20260821_010000_reapply_cascade_fixes.down,
    name: '20260821_010000_reapply_cascade_fixes',
  },
  {
    up: migration_20260822_194144_drop_legacy_lottery.up,
    down: migration_20260822_194144_drop_legacy_lottery.down,
    name: '20260822_194144_drop_legacy_lottery',
  },
  {
    up: migration_20260823_073220_partner_content_weight.up,
    down: migration_20260823_073220_partner_content_weight.down,
    name: '20260823_073220_partner_content_weight',
  },
  {
    up: migration_20260823_090000_delete_cascade_notifications.up,
    down: migration_20260823_090000_delete_cascade_notifications.down,
    name: '20260823_090000_delete_cascade_notifications',
  },
  {
    up: migration_20260823_093000_delete_cascade_partners_giveaway.up,
    down: migration_20260823_093000_delete_cascade_partners_giveaway.down,
    name: '20260823_093000_delete_cascade_partners_giveaway',
  },
  {
    up: migration_20260905_120000_analytics_retention_and_feed_indexes.up,
    down: migration_20260905_120000_analytics_retention_and_feed_indexes.down,
    name: '20260905_120000_analytics_retention_and_feed_indexes',
  },
  {
    up: migration_20260914_090000_engagement_source_and_ssv.up,
    down: migration_20260914_090000_engagement_source_and_ssv.down,
    name: '20260914_090000_engagement_source_and_ssv',
  },
  {
    up: migration_20260919_031416_schema_catchup_payload_3_90.up,
    down: migration_20260919_031416_schema_catchup_payload_3_90.down,
    name: '20260919_031416_schema_catchup_payload_3_90',
  },
  {
    up: migration_20260919_050533_narrow_news_type_to_article.up,
    down: migration_20260919_050533_narrow_news_type_to_article.down,
    name: '20260919_050533_narrow_news_type_to_article',
  },
  {
    up: migration_20260920_053947_analytics_event_ids.up,
    down: migration_20260920_053947_analytics_event_ids.down,
    name: '20260920_053947_analytics_event_ids',
  },
  {
    up: migration_20260920_215557_partner_postbacks.up,
    down: migration_20260920_215557_partner_postbacks.down,
    name: '20260920_215557_partner_postbacks',
  },
  {
    up: migration_20260922_130000_drop_partner_api_key.up,
    down: migration_20260922_130000_drop_partner_api_key.down,
    name: '20260922_130000_drop_partner_api_key',
  },
  {
    up: migration_20260929_091515.up,
    down: migration_20260929_091515.down,
    name: '20260929_091515',
  },
  {
    up: migration_20260929_131630.up,
    down: migration_20260929_131630.down,
    name: '20260929_131630',
  },
  {
    up: migration_20261002_063111_giveaway_send_announcement.up,
    down: migration_20261002_063111_giveaway_send_announcement.down,
    name: '20261002_063111_giveaway_send_announcement',
  },
  {
    up: migration_20261003_170057_discover_events.up,
    down: migration_20261003_170057_discover_events.down,
    name: '20261003_170057_discover_events',
  },
  {
    up: migration_20261003_170128_game_reports.up,
    down: migration_20261003_170128_game_reports.down,
    name: '20261003_170128_game_reports',
  },
  {
    up: migration_20261005_210416.up,
    down: migration_20261005_210416.down,
    name: '20261005_210416',
  },
  {
    up: migration_20261006_080000_email_templates_visual_only.up,
    down: migration_20261006_080000_email_templates_visual_only.down,
    name: '20261006_080000_email_templates_visual_only',
  },
  {
    up: migration_20261006_083000_email_templates_slug_lock.up,
    down: migration_20261006_083000_email_templates_slug_lock.down,
    name: '20261006_083000_email_templates_slug_lock',
  },
  {
    up: migration_20261006_084500_email_templates_builtin_slug.up,
    down: migration_20261006_084500_email_templates_builtin_slug.down,
    name: '20261006_084500_email_templates_builtin_slug',
  },
  {
    up: migration_20261006_090000_email_templates_no_audit_sidebar.up,
    down: migration_20261006_090000_email_templates_no_audit_sidebar.down,
    name: '20261006_090000_email_templates_no_audit_sidebar',
  },
  {
    up: migration_20261014_080850_featured_until.up,
    down: migration_20261014_080850_featured_until.down,
    name: '20261014_080850_featured_until',
  },
  {
    up: migration_20261014_191943.up,
    down: migration_20261014_191943.down,
    name: '20261014_191943',
  },
  {
    up: migration_20261017_161124_faq.up,
    down: migration_20261017_161124_faq.down,
    name: '20261017_161124_faq',
  },
  {
    up: migration_20261017_161125_faq_seed.up,
    down: migration_20261017_161125_faq_seed.down,
    name: '20261017_161125_faq_seed',
  },
  {
    up: migration_20261020_080630_guest_events.up,
    down: migration_20261020_080630_guest_events.down,
    name: '20261020_080630_guest_events',
  },
  {
    up: migration_20261020_152240_survey_settings_and_provider_ref.up,
    down: migration_20261020_152240_survey_settings_and_provider_ref.down,
    name: '20261020_152240_survey_settings_and_provider_ref',
  },
  {
    up: migration_20261020_152616_add_survey_offer_events.up,
    down: migration_20261020_152616_add_survey_offer_events.down,
    name: '20261020_152616_add_survey_offer_events',
  },
  {
    up: migration_20261020_214706_partner_offers.up,
    down: migration_20261020_214706_partner_offers.down,
    name: '20261020_214706_partner_offers',
  },
  {
    up: migration_20261021_034146_partner_content_events.up,
    down: migration_20261021_034146_partner_content_events.down,
    name: '20261021_034146_partner_content_events',
  },
  {
    up: migration_20261022_150623_review_prompted_at.up,
    down: migration_20261022_150623_review_prompted_at.down,
    name: '20261022_150623_review_prompted_at',
  },
  {
    up: migration_20261022_170313_admins_trash.up,
    down: migration_20261022_170313_admins_trash.down,
    name: '20261022_170313_admins_trash',
  },
  {
    up: migration_20261030_092949_news_notification_copy.up,
    down: migration_20261030_092949_news_notification_copy.down,
    name: '20261030_092949_news_notification_copy'
  },
];
