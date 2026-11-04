"use client";

import {
  NumberField,
  SelectInput,
  useField,
  useFormFields,
} from "@payloadcms/ui";
import type { NumberFieldClientProps } from "payload";
import { useEffect, useState } from "react";

import type { GiftCardProduct } from "../../lib/giveaway/reloadlyGiftCards";

/** Shape returned by GET /api/reloadly/gift-cards/products. */
type ProductSearchResponse = {
  environment: "sandbox" | "live";
  products: GiftCardProduct[];
};

const Note = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) => (
  <div
    className="field-description"
    style={tone === "error" ? { color: "var(--theme-error-500)" } : undefined}
  >
    {children}
  </div>
);

/** These fields are top-level, so a sibling is just the field name. */
const siblingPath = (path: string, name: string) =>
  path.includes(".") ? `${path.slice(0, path.lastIndexOf("."))}.${name}` : name;

/**
 * Product picker for a gift card prize.
 *
 * The Nigerian catalogue is small (25 products live, 19 in sandbox), so the
 * whole list is fetched once and rendered in one searchable dropdown. That
 * also means an existing prize can show its saved product on load instead of
 * waiting for a search.
 */
export const GiftCardProductField = (props: NumberFieldClientProps) => {
  const { field, path, readOnly } = props;
  const { value, setValue, showError } = useField<number | undefined>({ path });

  const { setValue: setProductName } = useField<string | null>({
    path: siblingPath(path, "reloadlyGiftCardProductName"),
  });
  const { setValue: setCurrency } = useField<string | null>({
    path: siblingPath(path, "reloadlyGiftCardCurrency"),
  });
  const { setValue: setInstructions } = useField<string | null>({
    path: siblingPath(path, "reloadlyGiftCardInstructions"),
  });
  const { setValue: setEnvironment } = useField<string | null>({
    path: siblingPath(path, "reloadlyGiftCardEnvironment"),
  });
  const { setValue: setUnitPrice } = useField<number | undefined>({
    path: siblingPath(path, "reloadlyGiftCardUnitPrice"),
  });
  const { setValue: setSenderPrice } = useField<number | undefined>({
    path: siblingPath(path, "reloadlyGiftCardSenderPrice"),
  });

  const currency = useFormFields(([fields]) => {
    const state = fields?.[siblingPath(path, "reloadlyGiftCardCurrency")];
    return typeof state?.value === "string" ? state.value : undefined;
  });

  const [products, setProducts] = useState<GiftCardProduct[]>([]);
  const [environment, setEnvironmentState] = useState<
    "sandbox" | "live" | null
  >(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);

    fetch("/api/reloadly/gift-cards/products")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return body as ProductSearchResponse;
      })
      .then((data) => {
        if (!current) {
          return;
        }
        setProducts(data.products);
        setEnvironmentState(data.environment);
      })
      .catch((err: unknown) => {
        if (!current) {
          return;
        }
        setProducts([]);
        setError(
          err instanceof Error ? err.message : "Could not load the products"
        );
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, []);

  const selectProduct = (product: GiftCardProduct) => {
    setValue(product.productId);
    setProductName(product.productName);
    setCurrency(product.recipientCurrencyCode);
    setInstructions(product.redeemInstructions?.concise ?? null);
    setEnvironment(environment);
    setUnitPrice(undefined);
    setSenderPrice(undefined);
  };

  const term = filter.trim().toLowerCase();
  const matching = term
    ? products.filter((product) =>
        product.productName.toLowerCase().includes(term)
      )
    : products;

  // Keep the saved product visible even when the filter excludes its name, so
  // an existing prize never renders as an empty select.
  const saved = value ? products.find((p) => p.productId === value) : undefined;
  const options = matching.map((p) => ({
    label: p.productName,
    value: String(p.productId),
  }));
  if (saved && !options.some((o) => o.value === String(saved.productId))) {
    options.unshift({
      label: saved.productName,
      value: String(saved.productId),
    });
  }

  return (
    <div className="field-type">
      <input
        aria-label="Search gift card products"
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search gift cards…"
        style={{
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: 4,
          marginBottom: 8,
          padding: "8px 12px",
          width: "100%",
        }}
        type="search"
        value={filter}
      />

      {loading && <Note>Loading gift cards…</Note>}
      {error && <Note tone="error">{error}</Note>}

      {!(loading || error) && options.length > 0 && (
        <SelectInput
          description="Choose the card to issue. Picking one opts this prize into automatic fulfilment."
          label={field.label}
          name={field.name}
          onChange={(option: unknown) => {
            const selected = Array.isArray(option) ? option[0] : option;
            const next = (selected as { value?: string } | null)?.value;
            const product = products.find((p) => String(p.productId) === next);
            if (product) {
              selectProduct(product);
            }
          }}
          options={options}
          path={path}
          readOnly={readOnly}
          showError={showError}
          value={
            value === undefined || value === null ? undefined : String(value)
          }
        />
      )}

      {!(loading || error) && options.length === 0 && (
        <Note>
          {term
            ? "No gift cards match that search."
            : "No gift cards are available in the current Reloadly catalogue."}
        </Note>
      )}

      <Note>
        {currency ? `Card currency: ${currency}. ` : ""}
        The account charge (sender price) is shown when Reloadly gives an exact
        figure.
      </Note>
    </div>
  );
};

/**
 * Face value picker for a gift card prize.
 *
 * Reads the chosen product out of form state and offers its denominations: a
 * fixed list for FIXED cards (writing the matching account charge), or a
 * bounded number input for RANGE cards (account charge left at 0, recorded at
 * purchase).
 */
export const GiftCardDenominationField = (props: NumberFieldClientProps) => {
  const { field, path, readOnly } = props;
  const { value, setValue, showError } = useField<number | undefined>({ path });

  const { setValue: setSenderPrice } = useField<number | undefined>({
    path: siblingPath(path, "reloadlyGiftCardSenderPrice"),
  });

  const productId = useFormFields(([fields]) => {
    const state = fields?.[siblingPath(path, "reloadlyGiftCardProductId")];
    const v = state?.value;
    return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
  });

  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setError(null);
      return;
    }

    let current = true;
    setLoading(true);
    setError(null);

    fetch(`/api/reloadly/gift-cards/products?productId=${productId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return body as ProductSearchResponse;
      })
      .then((data) => {
        if (!current) {
          return;
        }
        setProduct(data.products[0] ?? null);
      })
      .catch((err: unknown) => {
        if (!current) {
          return;
        }
        setProduct(null);
        setError(
          err instanceof Error ? err.message : "Could not load the product"
        );
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, [productId]);

  // A RANGE card's exact account charge is only known at purchase, so the
  // stored sender price is 0 and the purchase records the real amount later.
  useEffect(() => {
    if (product?.denominationType === "RANGE") {
      setSenderPrice(0);
    }
  }, [product, setSenderPrice]);

  if (!productId) {
    return <Note>Pick a product first.</Note>;
  }

  if (loading) {
    return <Note>Loading denominations…</Note>;
  }

  if (error) {
    return <Note tone="error">{error}</Note>;
  }

  if (
    product?.denominationType === "FIXED" &&
    product.fixedRecipientDenominations?.length
  ) {
    return (
      <SelectInput
        description={`Card currency: ${product.recipientCurrencyCode}.`}
        label={field.label}
        name={field.name}
        onChange={(option: unknown) => {
          const selected = Array.isArray(option) ? option[0] : option;
          const next = (selected as { value?: string } | null)?.value;
          const index =
            product.fixedRecipientDenominations?.findIndex(
              (amount) => String(amount) === next
            ) ?? -1;

          setValue(next ? Number(next) : undefined);
          if (next && index >= 0) {
            setSenderPrice(product.fixedSenderDenominations?.[index] ?? 0);
          }
        }}
        options={product.fixedRecipientDenominations.map((amount) => ({
          label: `${product.recipientCurrencyCode} ${amount}`,
          value: String(amount),
        }))}
        path={path}
        readOnly={readOnly}
        required={field.required}
        showError={showError}
        value={
          value === undefined || value === null ? undefined : String(value)
        }
      />
    );
  }

  if (product?.denominationType === "RANGE") {
    return (
      <>
        <NumberField
          {...props}
          field={{
            ...field,
            max: product.maxRecipientDenomination ?? field.max,
            min: product.minRecipientDenomination ?? field.min,
          }}
        />
        <Note>Card currency: {product.recipientCurrencyCode}.</Note>
      </>
    );
  }

  return (
    <Note tone="error">
      This product returned no purchasable denominations.
    </Note>
  );
};
