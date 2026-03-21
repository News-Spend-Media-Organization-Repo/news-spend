export { addServerErrors as serverValidationError } from "./addServerError";
export { debounce } from "./debounce";
export { formatDistance as formatDistanceUtil } from "./formatDistance";
export { getBaseUrl } from "./getBaseUrl";
export { getImageData } from "./getImageData";

export const randomColor = () => {
  const hue = Math.random() * 360;
  const saturation = Math.random() * 100;
  const lightness = Math.random() * 80;
  const randomColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  return randomColor;
};

export const getCtaLabel = (cta?: string | null): string => cta || "Learn more";
