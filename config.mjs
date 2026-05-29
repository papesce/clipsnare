const label = process.env.BRAND_LABEL || "My Provider";
// Derive domain: assume label is the brand name.
// We normalize it to lowercase and remove spaces.
const brandName = label.toLowerCase().replace(/\s+/g, "");
const domain = `${brandName}.com`;

export const config = {
  brand: {
    label: label,
    domain: domain,
    mediaDomain: `media.${domain}`
  }
};
