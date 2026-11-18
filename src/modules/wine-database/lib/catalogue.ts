import type { Wine } from "../types.ts";
import { wineStyle } from "./model";
export type Filters = {
  query: string;
  producer: string;
  country: string;
  style: string;
  reviewOnly: boolean;
  sort: string;
};
export function filterWines(wines: Wine[], filters: Filters, locale = "en-GB") {
  const { query, producer, country, style, reviewOnly, sort } = filters;
  const search = query.trim().toLocaleLowerCase(locale);
  return wines
    .filter(
      (wine) =>
        (!producer || wine.producer === producer) &&
        (!country || wine.country === country) &&
        (!style || wineStyle(wine) === style) &&
        (!reviewOnly || wine.registeredPrice == null) &&
        `${wine.name} ${wine.producer} ${wine.vintage} ${wine.variety} ${wine.country} ${wine.sku}`
          .toLocaleLowerCase(locale)
          .includes(search),
    )
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name, locale);
      if (sort === "price-low" || sort === "price-high") {
        if (a.sellingPrice == null) return b.sellingPrice == null ? name : 1;
        if (b.sellingPrice == null) return -1;
        return (
          (a.sellingPrice - b.sellingPrice) *
            (sort === "price-high" ? -1 : 1) || name
        );
      }
      return sort === "name"
        ? name
        : a.producer.localeCompare(b.producer, locale) || name;
    });
}
