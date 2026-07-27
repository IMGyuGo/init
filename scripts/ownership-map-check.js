const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};

const mode = argValue("--mode", "auto");
const role = argValue("--role", "");
const root = path.resolve(__dirname, "..");
const mapPath = path.join(root, "docs", "04_implementation", "ownership-map.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const changed = fs.readFileSync(0, "utf8")
  .split(/\r?\n/)
  .map((file) => file.trim().replace(/\\/g, "/"))
  .filter(Boolean)
  .filter((file) => !/(^|\/)node_modules\//.test(file))
  .filter((file) => !/(^|\/)(\.next|dist|build|coverage)\//.test(file));

const matchesAny = (file, patterns = []) => patterns.some((pattern) => new RegExp(pattern).test(file));
const commonPatterns = [...(map.common ?? []), ...(map.baselineSkeleton ?? [])];

if (changed.length === 0) {
  console.log(mode === "role" ? "[ok] no changed files for ownership check" : "[ok] no changed files for auto ownership check");
  if (mode === "auto" && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "roles_csv=\nroles_json=[]\n");
  }
  process.exit(0);
}

if (mode === "role") {
  if (!map.roles?.[role]) {
    console.error(`[fail] invalid role: ${role}`);
    process.exit(1);
  }

  const rolePatterns = [...commonPatterns, ...map.roles[role]];
  for (const shared of map.shared ?? []) {
    if ((shared.roles ?? []).includes(role)) {
      rolePatterns.push(...(shared.patterns ?? []));
    }
  }

  const blocked = changed.filter((file) => !matchesAny(file, rolePatterns));
  if (blocked.length > 0) {
    console.log(`[fail] files outside role ${role} ownership:`);
    blocked.forEach((file) => console.log(`  ${file}`));
    console.log("[hint] If these paths are valid for this role, add narrow patterns to docs/04_implementation/ownership-map.json and request the affected owner review.");
    process.exit(1);
  }

  console.log(`[ok] verify-ownership passed for role ${role}`);
  process.exit(0);
}

const impacted = new Set();
const blocked = [];

for (const file of changed) {
  if (matchesAny(file, commonPatterns)) {
    impacted.add("COMMON");
    continue;
  }

  let matched = false;
  for (const shared of map.shared ?? []) {
    if (matchesAny(file, shared.patterns ?? [])) {
      for (const sharedRole of shared.roles ?? []) {
        impacted.add(sharedRole);
      }
      matched = true;
    }
  }
  if (matched) {
    continue;
  }

  for (const [owner, patterns] of Object.entries(map.roles ?? {})) {
    if (matchesAny(file, patterns)) {
      impacted.add(owner);
      matched = true;
    }
  }

  if (!matched) {
    blocked.push(file);
  }
}

if (blocked.length > 0) {
  console.log("[fail] files outside all known ownership:");
  blocked.forEach((file) => console.log(`  ${file}`));
  console.log("[hint] Add narrow role patterns to docs/04_implementation/ownership-map.json. Avoid broad patterns such as frontend/src/** or backend/api/src/**.");
  console.log("[fail] verify-ownership-auto failed");
  process.exit(1);
}

const roles = [...impacted].sort();
const harnessRoles = roles.filter((item) => item !== "COMMON");
const rolesCsv = harnessRoles.join(",");
const rolesJson = JSON.stringify(harnessRoles);

console.log("[ok] verify-ownership-auto passed");
console.log(`impacted roles: ${roles.join(", ")}`);
console.log(`harness roles: ${rolesCsv}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `roles_csv=${rolesCsv}\nroles_json=${rolesJson}\n`);
}
