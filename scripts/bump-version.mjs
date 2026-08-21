/**
 * Helper script to synchronously bump extension version in package.json,
 * package-lock.json, and wxt.config.ts.
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major|<specific-version>]
 *   npm run version:bump [patch|minor|major|<specific-version>]
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = resolve(root, "package.json");
const pkgLockPath = resolve(root, "package-lock.json");
const wxtConfigPath = resolve(root, "wxt.config.ts");

function parseSemver(v) {
	const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/);
	if (!match) return null;
	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
		prerelease: match[4] || null,
	};
}

function calculateNextVersion(currentVersion, bumpType) {
	const parsed = parseSemver(currentVersion);
	if (!parsed) {
		throw new Error(`Current version "${currentVersion}" is not valid semver.`);
	}

	if (bumpType === "patch") {
		return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
	}
	if (bumpType === "minor") {
		return `${parsed.major}.${parsed.minor + 1}.0`;
	}
	if (bumpType === "major") {
		return `${parsed.major + 1}.0.0`;
	}

	if (parseSemver(bumpType)) {
		return bumpType;
	}

	throw new Error(
		`Invalid bump type or version target: "${bumpType}". Must be 'patch', 'minor', 'major', or a valid semver string (e.g. '0.4.0').`,
	);
}

async function main() {
	const rawArg = process.argv[2];

	const pkgRaw = await readFile(pkgPath, "utf8");
	const pkg = JSON.parse(pkgRaw);
	const currentVersion = pkg.version;

	if (!rawArg) {
		console.error("Error: Missing bump type or version argument.");
		console.error(`Current version: ${currentVersion}`);
		console.error(
			"Usage: npm run version:bump [patch | minor | major | <x.y.z>]",
		);
		process.exit(1);
	}

	const nextVersion = calculateNextVersion(currentVersion, rawArg);

	// 1. Update package.json
	pkg.version = nextVersion;
	await writeFile(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`, "utf8");
	console.log(`✓ Updated package.json (version: ${nextVersion})`);

	// 2. Update package-lock.json if present
	try {
		const lockRaw = await readFile(pkgLockPath, "utf8");
		const lock = JSON.parse(lockRaw);
		lock.version = nextVersion;
		if (lock.packages?.[""]) {
			lock.packages[""].version = nextVersion;
		}
		await writeFile(
			pkgLockPath,
			`${JSON.stringify(lock, null, "\t")}\n`,
			"utf8",
		);
		console.log(`✓ Updated package-lock.json (version: ${nextVersion})`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.warn("⚠ Failed to update package-lock.json:", err.message);
		}
	}

	// 3. Update wxt.config.ts
	try {
		const wxtRaw = await readFile(wxtConfigPath, "utf8");
		const versionRegex = /(version:\s*["'])([^"']+)(["'])/;
		if (versionRegex.test(wxtRaw)) {
			const updatedWxt = wxtRaw.replace(versionRegex, `$1${nextVersion}$3`);
			await writeFile(wxtConfigPath, updatedWxt, "utf8");
			console.log(`✓ Updated wxt.config.ts (version: ${nextVersion})`);
		} else {
			console.warn(
				"⚠ Could not find manifest version property in wxt.config.ts",
			);
		}
	} catch (err) {
		console.warn("⚠ Failed to update wxt.config.ts:", err.message);
	}

	console.log(
		`\n🎉 Successfully bumped version: ${currentVersion} → ${nextVersion}\n`,
	);
	console.log("Next steps to publish:");
	console.log("  1. Update CHANGELOG.md (if applicable)");
	console.log(
		`  2. git add package.json package-lock.json wxt.config.ts CHANGELOG.md`,
	);
	console.log(`  3. git commit -m "chore(release): v${nextVersion}"`);
	console.log(`  4. git tag v${nextVersion}`);
	console.log(`  5. git push origin main --tags`);
}

main().catch((err) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
