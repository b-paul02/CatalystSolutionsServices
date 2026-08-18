import type { MetadataRoute } from "next";
import { serviceData } from "@/lib/services";
import { programBySlug } from "@/lib/programs";
import { samples, demoSites } from "@/lib/proof";

const base = "https://catalystsolutionservices.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/services", "/industries", "/add-ons", "/work", "/use-cases", "/resources", "/about", "/contact", "/growth-audit", "/privacy", "/proof"];
  const services = Object.keys(serviceData).map((slug) => `/services/${slug}`);
  const bundles = Object.keys(programBySlug).map((slug) => `/bundles/${slug}`);
  // Demo sites themselves are noindex (they'd compete with the real thing), so only
  // the samples and the wrapper pages belong in the sitemap.
  const proof = [...samples.map((s) => `/proof/samples/${s.slug}`), ...demoSites.map((s) => `/proof/sites/${s.slug}`)];
  return [...routes, ...services, ...bundles, ...proof].map((path) => ({ url: base + path, lastModified: new Date() }));
}
