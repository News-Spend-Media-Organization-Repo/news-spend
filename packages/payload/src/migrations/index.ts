import * as migration_20260203_111507_init from "./20260203_111507_init";
import * as migration_20260204_225235_optional_category_relationship from "./20260204_225235_optional_category_relationship";
import * as migration_20260210_123514 from "./20260210_123514";
import * as migration_20260213_071200_replace_slugField_with_payload_s from "./20260213_071200_replace_slugField_with_payload_s";
import * as migration_20260213_185705_fix_img_full_url from "./20260213_185705_fix_img_full_url";
import * as migration_20260214_144447_shop_analytics from "./20260214_144447_shop_analytics";
import * as migration_20260214_211145_partner_content_cleanup from "./20260214_211145_partner_content_cleanup";
import * as migration_20260215_184235 from "./20260215_184235";
import * as migration_20260309_051932 from "./20260309_051932";
import * as migration_20260310_100454 from "./20260310_100454";
import * as migration_20260314_193220 from "./20260314_193220";
import * as migration_20260316_140421 from "./20260316_140421";
import * as migration_20260322_185733 from "./20260322_185733";
import * as migration_20260418_214851 from "./20260418_214851";
import * as migration_20260418_234555 from "./20260418_234555";
import * as migration_20260517_100032 from "./20260517_100032";
import * as migration_20260517_141537 from "./20260517_141537";
import * as migration_20260517_232052 from "./20260517_232052";

export const migrations = [
  {
    up: migration_20260203_111507_init.up,
    down: migration_20260203_111507_init.down,
    name: "20260203_111507_init",
  },
  {
    up: migration_20260204_225235_optional_category_relationship.up,
    down: migration_20260204_225235_optional_category_relationship.down,
    name: "20260204_225235_optional_category_relationship",
  },
  {
    up: migration_20260210_123514.up,
    down: migration_20260210_123514.down,
    name: "20260210_123514",
  },
  {
    up: migration_20260213_071200_replace_slugField_with_payload_s.up,
    down: migration_20260213_071200_replace_slugField_with_payload_s.down,
    name: "20260213_071200_replace_slugField_with_payload_s",
  },
  {
    up: migration_20260213_185705_fix_img_full_url.up,
    down: migration_20260213_185705_fix_img_full_url.down,
    name: "20260213_185705_fix_img_full_url",
  },
  {
    up: migration_20260214_144447_shop_analytics.up,
    down: migration_20260214_144447_shop_analytics.down,
    name: "20260214_144447_shop_analytics",
  },
  {
    up: migration_20260214_211145_partner_content_cleanup.up,
    down: migration_20260214_211145_partner_content_cleanup.down,
    name: "20260214_211145_partner_content_cleanup",
  },
  {
    up: migration_20260215_184235.up,
    down: migration_20260215_184235.down,
    name: "20260215_184235",
  },
  {
    up: migration_20260309_051932.up,
    down: migration_20260309_051932.down,
    name: "20260309_051932",
  },
  {
    up: migration_20260310_100454.up,
    down: migration_20260310_100454.down,
    name: "20260310_100454",
  },
  {
    up: migration_20260314_193220.up,
    down: migration_20260314_193220.down,
    name: "20260314_193220",
  },
  {
    up: migration_20260316_140421.up,
    down: migration_20260316_140421.down,
    name: "20260316_140421",
  },
  {
    up: migration_20260322_185733.up,
    down: migration_20260322_185733.down,
    name: "20260322_185733",
  },
  {
    up: migration_20260418_214851.up,
    down: migration_20260418_214851.down,
    name: "20260418_214851",
  },
  {
    up: migration_20260418_234555.up,
    down: migration_20260418_234555.down,
    name: "20260418_234555",
  },
  {
    up: migration_20260517_100032.up,
    down: migration_20260517_100032.down,
    name: "20260517_100032",
  },
  {
    up: migration_20260517_141537.up,
    down: migration_20260517_141537.down,
    name: "20260517_141537",
  },
  {
    up: migration_20260517_232052.up,
    down: migration_20260517_232052.down,
    name: "20260517_232052",
  },
];
