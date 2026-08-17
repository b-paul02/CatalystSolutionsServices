import type { MetadataRoute } from "next";
import { serviceData } from "@/lib/services";
import { programBySlug } from "@/lib/programs";

const base = "https://catalystsolutionservices.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/services", "/industries", "/add-ons", "/work", "/use-cases", "/resources", "/about", "/contact", "/growth-audit", "/privacy"];
  const services = Object.keys(serviceData).map((slug) => `/services/${slug}`);
  const bundles = Object.keys(programBySlug).map((slug) => `/bundles/${slug}`);
  return [...routes, ...services, ...bundles].map((path) => ({ url: base + path, lastModified: new Date() }));
}
