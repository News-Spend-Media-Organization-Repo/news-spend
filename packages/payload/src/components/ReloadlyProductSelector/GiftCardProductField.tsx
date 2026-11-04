"use client";

import {
  NumberField,
  SelectInput,
  TextInput,
  useField,
  useFormFields,
} from "@payloadcms/ui";
import type { NumberFieldClientProps } from "payload";
import type { ChangeEvent } from "react";
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
 * The admin types a product name; a debounced search fills a select, and
 * picking one writes the product id back to this field plus the snapshot
 * fields (name, currency, instructions, environment) and clears the face value
 * so a stale denomination can never be paired with the wrong card.
 */
export const GiftCardProductField = (props: NumberFieldClientProps) => {
  const { field, path, readOnly } = props;
  const { value, setValue, showError, errorMessage } = useField<
    number | undefined
  >({ path });

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

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<GiftCardProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironmentState] = useState<
    "sandbox" | "live" | null
  >(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setProducts([]);
      setEnvironmentState(null);
      setError(null);
      return;
    }

    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      fetch(
        `/api/reloadly/gift-cards/products?productName=${encodeURIComponent(
          trimmed
        )}`
      )
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
            err instanceof Error ? err.message : "Could not load products"
          );
        })
        .finally(() => {
          if (current) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const selectProduct = (product: GiftCardProduct) => {
    setValue(product.productId);
    setProductName(product.productName);
    setCurrency(product.recipientCurrencyCode);
    setInstructions(product.redeemInstructions?.concise ?? null);
    setEnvironment(environment);
    setUnitPrice(undefined);
    setSenderPrice(undefined);
  };

  return (
    <div className="field-type">
      <TextInput
        label={field.label}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setQuery(e.target.value)
        }
        path={path}
        readOnly={readOnly}
        value={query}
      />

      {loading && <Note>Searching…</Note>}
      {error && <Note tone="error">{error}</Note>}

      {!(loading || error) && products.length > 0 && (
        <SelectInput
          description="Choose the card to issue. Picking one opts this prize into automatic fulfilment."
          label=""
          name={field.name}
          onChange={(option: unknown) => {
            const selected = Array.isArray(option) ? option[0] : option;
            const next = (selected as { value?: string } | null)?.value;
            const product = products.find((p) => String(p.productId) === next);
            if (product) {
              selectProduct(product);
            }
          }}
          options={products.map((p) => ({
            label: p.productName,
            value: String(p.productId),
          }))}
          path={path}
          readOnly={readOnly}
          showError={showError}
          value={
            value === undefined || value === null ? undefined : String(value)
          }
        />
      )}

      <Note>
        {currency ? `Card currency: ${currency}. ` : ""}
        The account charge (sender price) is shown when Reloadly gives an exact
        figure.
      </Note>

      {showError && errorMessage && (
        <div className="field-error" style={{ marginTop: 8 }}>
          {errorMessage}
        </div>
      )}
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
