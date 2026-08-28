/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [
      // Hosted campaign pages must stay embeddable (iframe snippet); everything
      // else refuses framing.
      {
        source: "/app/c/:path*",
        headers: securityHeaders,
      },
      {
        source: "/((?!app/c/).*)",
        headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};
export default nextConfig;
