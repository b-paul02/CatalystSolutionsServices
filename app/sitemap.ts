import type { MetadataRoute } from "next";
import { serviceData } from "@/lib/services";

const base = "https://catalystsolutionservices.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/services", "/industries", "/work", "/use-cases", "/resources", "/about", "/contact"];
  const services = Object.keys(serviceData).map((slug) => `/services/${slug}`);
  return [...routes, ...services].map((path) => ({ url: base + path, lastModified: new Date() }));
}
