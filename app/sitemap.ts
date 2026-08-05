import type { MetadataRoute } from "next";
import { serviceData } from "@/lib/services";
import { bundleBySlug } from "@/lib/content";

const base = "https://catalystsolutionservices.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/services", "/industries", "/work", "/use-cases", "/resources", "/about", "/contact", "/growth-audit"];
  const services = Object.keys(serviceData).map((slug) => `/services/${slug}`);
  const bundles = Object.keys(bundleBySlug).map((slug) => `/bundles/${slug}`);
  return [...routes, ...services, ...bundles].map((path) => ({ url: base + path, lastModified: new Date() }));
}
