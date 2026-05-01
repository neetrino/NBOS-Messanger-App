import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

type AppJsonShape = { expo: Record<string, unknown> };

const appJson = JSON.parse(
  readFileSync(path.join(__dirname, "app.json"), "utf8"),
) as AppJsonShape;

export default appJson.expo;
