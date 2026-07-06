import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function getLocalNetworkDevOrigins() {
  return Object.values(networkInterfaces()).flatMap((networkInterface = []) =>
    networkInterface.filter((address) => address.family === "IPv4" && !address.internal).map((address) => address.address),
  );
}

function getConfiguredDevOrigins() {
  return (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [...new Set([...getLocalNetworkDevOrigins(), ...getConfiguredDevOrigins()])],
};

export default nextConfig;
