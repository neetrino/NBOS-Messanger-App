import { loadEnvConfig } from "@next/env";
import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..", "..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
