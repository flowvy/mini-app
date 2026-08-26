import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const visualEvidencePattern = "capture deterministic visual evidence for key screens";
const toneOfVoiceEvidencePattern =
	"focused Tone of Voice editor remains usable in every required viewport and theme";
const isolatedEvidencePattern = `${visualEvidencePattern}|${toneOfVoiceEvidencePattern}`;

function runPlaywright(args, artifactName) {
	const result = spawnSync(process.execPath, [playwrightCli, "test", ...args], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PLAYWRIGHT_ARTIFACT_DIR: join(tmpdir(), "flowvy-playwright", artifactName),
		},
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

for (let shard = 1; shard <= 12; shard += 1) {
	runPlaywright(
		[
			"--project=ios-webkit",
			"--workers=1",
			"--grep-invert",
			isolatedEvidencePattern,
			`--shard=${shard}/12`,
		],
		`webkit-core-${String(shard).padStart(2, "0")}`,
	);
}

runPlaywright(
	[
		"tests/e2e/operator-content.spec.ts",
		"--project=ios-webkit",
		"--workers=1",
		"--grep",
		toneOfVoiceEvidencePattern,
	],
	"webkit-tone-of-voice",
);

for (let shard = 1; shard <= 8; shard += 1) {
	runPlaywright(
		[
			"tests/e2e/visual-evidence.spec.ts",
			"--project=ios-webkit",
			"--workers=1",
			"--grep",
			visualEvidencePattern,
			`--shard=${shard}/8`,
		],
		`webkit-visual-${String(shard).padStart(2, "0")}`,
	);
}
