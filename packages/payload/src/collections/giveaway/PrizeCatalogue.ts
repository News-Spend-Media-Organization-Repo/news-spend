import { type CollectionConfig, ValidationError } from "payload";

import { isIdentityProviderConfigured } from "../../lib/giveaway/didit";
import {
  ReloadlyClient,
  reloadlyConfigFromEnv,
} from "../../lib/giveaway/reloadly";

import {
  ADMIN_GROUP,
  FULFILMENT_TYPE_OPTIONS,
  PRIZE_TIER_OPTIONS,
} from "./constants";

const RELOADLY_NETWORK_OPERATORS = {
  mtn: 345,
  airtel: 646,
  glo: 647,
  t2: 645,
} as const;

/**
 * Master Prize Catalogue (spec 2).
 *
 * The single source of truth for all prize definitions. Every prize belongs to
 * exactly one tier, and duplicate prize names are rejected regardless of tier.
 * All giveaway configurations, winner records, reports, notifications and
 * fulfilment records reference prizes by this collection's ID.
 */
export const PrizeCatalogue: CollectionConfig = {
  slug: "prize-catalogue",
  admin: {
    group: ADMIN_GROUP,
    useAsTitle: "name",
    defaultColumns: ["name", "tier", "active", "updatedAt"],
    description:
      "Single source of truth for prizes. A prize belongs to exactly one tier.",
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ req, data, originalDoc, operation }) => {
        const name = data?.name?.trim();

        if (name) {
          // Duplicate prize names are not permitted across tiers, so the check
          // is case-insensitive and deliberately ignores the tier field.
          const duplicate = await req.payload.find({
            collection: "prize-catalogue",
            where: { name: { equals: name } },
            limit: 1,
            pagination: false,
          });

          const clash = duplicate.docs[0];
          if (clash && clash.id !== originalDoc?.id) {
            throw new ValidationError({
              collection: "prize-catalogue",
              errors: [
                {
                  path: "name",
                  message: `"${name}" already exists in the catalogue (${clash.tier}). Duplicate prize names are not permitted across tiers.`,
                },
              ],
            });
          }
        }

        // A prize may never move between tiers once giveaways reference it.
        if (
          operation === "update" &&
          originalDoc?.tier &&
          data?.tier &&
          data.tier !== originalDoc.tier
        ) {
          const inUse = await req.payload.find({
            collection: "giveaway-prizes",
            where: { prize: { equals: originalDoc.id } },
            limit: 1,
            pagination: false,
          });

          if (inUse.docs.length > 0) {
            throw new ValidationError({
              collection: "prize-catalogue",
              errors: [
                {
                  path: "tier",
                  message:
                    "This prize is already used in one or more giveaways and cannot be reassigned to a different tier.",
                },
              ],
            });
          }
        }

        // Auto-populate operator IDs and validate Reloadly data plans
        if (
          data?.fulfilmentType === "data" &&
          data?.reloadlyDataPlans?.length
        ) {
          // Auto-populate operator IDs based on network selection
          data.reloadlyDataPlans = data.reloadlyDataPlans.map((plan: any) => ({
            ...plan,
            reloadlyOperatorId:
              RELOADLY_NETWORK_OPERATORS[
                plan.network as keyof typeof RELOADLY_NETWORK_OPERATORS
              ] || plan.reloadlyOperatorId,
          }));

          const config = reloadlyConfigFromEnv();
          if (config) {
            const client = new ReloadlyClient(config);
            const errors: Array<{
              path: string;
              message: string;
            }> = [];

            for (let i = 0; i < data.reloadlyDataPlans.length; i++) {
              const plan = data.reloadlyDataPlans[i];

              if (!plan.reloadlyOperatorId) {
                errors.push({
                  path: `reloadlyDataPlans.${i}.reloadlyOperatorId`,
                  message: "Operator ID is required",
                });
                continue;
              }

              if (!plan.reloadlyLocalAmount) {
                errors.push({
                  path: `reloadlyDataPlans.${i}.reloadlyLocalAmount`,
                  message: "Amount is required",
                });
                continue;
              }

              try {
                const operator = await client.getOperatorProducts(
                  plan.reloadlyOperatorId
                );

                if (
                  operator.denominationType === "FIXED" &&
                  operator.localFixedAmounts &&
                  !operator.localFixedAmounts.includes(plan.reloadlyLocalAmount)
                ) {
                  const available = operator.localFixedAmounts.join(", ");
                  errors.push({
                    path: `reloadlyDataPlans.${i}.reloadlyLocalAmount`,
                    message: `Amount ₦${plan.reloadlyLocalAmount} is not available for this operator. Available amounts: ${available}`,
                  });
                } else if (
                  operator.denominationType === "RANGE" &&
                  operator.localMinAmount &&
                  operator.localMaxAmount
                ) {
                  if (
                    plan.reloadlyLocalAmount < operator.localMinAmount ||
                    plan.reloadlyLocalAmount > operator.localMaxAmount
                  ) {
                    errors.push({
                      path: `reloadlyDataPlans.${i}.reloadlyLocalAmount`,
                      message: `Amount ₦${plan.reloadlyLocalAmount} is outside the valid range (₦${operator.localMinAmount} - ₦${operator.localMaxAmount})`,
                    });
                  }
                }
              } catch (err: any) {
                errors.push({
                  path: `reloadlyDataPlans.${i}.reloadlyOperatorId`,
                  message: `Could not validate operator: ${err.message}`,
                });
              }
            }

            if (errors.length > 0) {
              throw new ValidationError({
                collection: "prize-catalogue",
                errors,
              });
            }
          }
        }

        return { ...data, ...(name ? { name } : {}) };
      },
    ],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "Must be unique across the entire catalogue, including other tiers.",
      },
    },
    {
      name: "tier",
      type: "select",
      required: true,
      index: true,
      options: [...PRIZE_TIER_OPTIONS],
      admin: {
        description:
          "The one and only tier this prize belongs to. Cannot be changed once the prize is used in a giveaway.",
      },
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "fulfilmentType",
      label: "How is this delivered?",
      type: "select",
      required: true,
      index: true,
      defaultValue: "physical",
      options: [...FULFILMENT_TYPE_OPTIONS],
      admin: {
        description:
          "Drives the whole claim flow: what the app asks the winner for, and whether fulfilment is automatic or arranged by hand.",
      },
    },
    {
      name: "pointsAmount",
      label: "Points awarded",
      type: "number",
      min: 1,
      admin: {
        condition: (data) => data?.fulfilmentType === "points",
        description:
          "Credited to the winner the moment they claim. Required for a points prize.",
      },
      validate: (value: number | null | undefined, { siblingData }: any) => {
        if (siblingData?.fulfilmentType !== "points") {
          return true;
        }
        if (value === null || value === undefined) {
          return "A points prize needs an amount.";
        }
        if (!Number.isInteger(value) || value < 1) {
          return "Must be a whole number of at least 1.";
        }
        return true;
      },
    },
    {
      name: "valueNaira",
      label: "Value (₦)",
      type: "number",
      min: 0,
      admin: {
        description:
          "Retail value of one unit. Only required if a giveaway sets a monetary budget cap; otherwise it is for reporting.",
      },
      validate: (value: number | null | undefined) => {
        if (value !== null && value !== undefined && value < 0) {
          return "Cannot be negative.";
        }
        return true;
      },
    },
    {
      name: "requiresVerification",
      label: "Requires identity verification before dispatch",
      type: "checkbox",
      defaultValue: false,
      index: true,
      admin: {
        description:
          "The winner can still claim immediately: this only gates delivery, so nobody loses a prize to the 14-day clock while verifying. Use it for high-value items, not for airtime or points. Cannot be enabled until an identity provider is configured.",
      },
      validate: (value: boolean | null | undefined) => {
        // Without a provider this checkbox does not gate anything: it parks
        // the winner in `awaiting_verification` with no way out, which is
        // worse than not gating at all. Refusing here is the only warning an
        // administrator gets, since the box itself looks harmless.
        if (value && !isIdentityProviderConfigured()) {
          return "No identity verification provider is configured, so a winner of this prize could never complete verification and the prize would never be dispatched. Configure Didit first.";
        }
        return true;
      },
    },
    {
      name: "reloadlyLocalAmount",
      label: "Reloadly amount (local currency)",
      type: "number",
      min: 0,
      admin: {
        condition: (data) => data?.fulfilmentType === "airtime",
        description:
          "Pick from available airtime amounts. Falls back to Value (₦) if left empty. Airtime is not network-specific the way data is, so the network is detected from the winner's own phone number at fulfilment.",
        components: {
          Field: "@news-spend-media/payload/components/ReloadlyProductSelector#AirtimeProductField",
        },
      },
    },
    {
      name: "reloadlyDataPlans",
      label: "Reloadly data plans, one per network",
      type: "array",
      admin: {
        condition: (data) => data?.fulfilmentType === "data",
        description:
          "Add one row per network this data prize should cover. Select the network, then pick from available plans. At fulfilment, the winner's actual network is detected from their phone number and matched against these rows.",
        components: {
          RowLabel: "@news-spend-media/payload/components/ReloadlyProductSelector#ReloadlyDataPlanRowLabel",
        },
      },
      fields: [
        {
          name: "network",
          type: "select",
          required: true,
          options: [
            { label: "MTN Nigeria", value: "mtn" },
            { label: "Airtel Nigeria", value: "airtel" },
            { label: "Glo Nigeria", value: "glo" },
            { label: "9mobile / T2 Nigeria", value: "t2" },
          ],
          admin: {
            description: "Select the network this plan is for",
            width: "50%",
          },
        },
        {
          name: "reloadlyOperatorId",
          label: "Operator ID",
          type: "number",
          required: true,
          admin: {
            description: "Auto-populated based on network",
            readOnly: true,
            width: "25%",
          },
        },
        {
          name: "reloadlyLocalAmount",
          label: "Data Plan",
          type: "number",
          required: true,
          min: 0,
          admin: {
            description: "Select from available plans for this network",
            components: {
              Field: "@news-spend-media/payload/components/ReloadlyProductSelector#DataPlanField",
            },
            width: "25%",
          },
        },
      ],
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required: false,
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      index: true,
      admin: {
        description:
          "Inactive prizes cannot be added to new giveaways. Existing giveaways are unaffected.",
        position: "sidebar",
      },
    },
  ],
};

export default PrizeCatalogue;
