const { describe, it } = require("node:test");
const { spawnSync } = require("child_process");
const { tmpdir } = require("os");
const { join, resolve } = require("path");
const glob = require("fast-glob");
const fse = require("fs-extra");
const shell = require("shelljs");
const { readConfig } = require("@remix-run/dev/dist/config.js");
const { run } = require("@remix-run/dev/dist/cli/run.js");
const assert = require("assert");

const FIXTURE = join(
  process.cwd(),
  "packages",
  "remix-dev",
  "__tests__",
  "migrations",
  "fixtures",
  "indie-stack"
);

console.log(`Running tests in ${FIXTURE}`);

const TEMP_DIR = join(
  fse.realpathSync(tmpdir()),
  `remix-tests-${Math.random().toString(32).slice(2)}`
);

const makeApp = () => {
  let projectDir = join(TEMP_DIR, "convert-to-javascript");
  fse.copySync(FIXTURE, projectDir);
  return projectDir;
};

const deleteApp = () => {
  fse.removeSync(TEMP_DIR);
};

const getRunArgs = (projectDir) => [
  "migrate",
  "--migration",
  "convert-to-javascript",
  projectDir,
  "--force",
];

function runConvertToJavaScriptMigrationProgrammatically(projectDir) {
  return run([...getRunArgs(projectDir)]);
}

function runConvertToJavaScriptMigrationViaCLI(projectDir) {
  return spawnSync(
    "node",
    [
      "--require",
      require.resolve("esbuild-register"),
      resolve(process.cwd(), "packages", "remix-dev", "cli.ts"),
      ...getRunArgs(projectDir),
      "--interactive",
    ],
    { cwd: projectDir, stdio: "inherit" }
  ).stdout?.toString("utf-8");
}

async function checkMigrationRanSuccessfully(projectDir) {
  let config = await readConfig(projectDir);

  let jsConfigJson = fse.readJSONSync(join(projectDir, "jsconfig.json"));
  let jsConfigIncludes = [...jsConfigJson.include];
  assert(!jsConfigIncludes.includes("remix.env.d.ts"));
  assert(!jsConfigIncludes.includes("**/*.ts"));
  assert(jsConfigIncludes.includes("**/*.js"));
  assert(!jsConfigIncludes.includes("**/*.tsx"));
  assert(jsConfigIncludes.includes("**/*.jsx"));

  let packageJson = fse.readJSONSync(join(projectDir, "package.json"));
  let devDeps = Object.keys(packageJson.devDependencies);
  let scripts = Object.keys(packageJson.scripts);
  assert(!devDeps.includes("@types/react"));
  assert(!devDeps.includes("@types/react-dom"));
  assert(!devDeps.includes("typescript"));
  assert(!scripts.includes("typecheck"));

  let TSFiles = glob.sync("**/*.@(ts|tsx)", {
    cwd: config.rootDirectory,
    ignore: [`./${config.appDirectory}/**/*`],
  });
  assert.equal(TSFiles.length, 0);
  let JSFiles = glob.sync("**/*.@(js|jsx)", {
    absolute: true,
    cwd: config.rootDirectory,
    ignore: [`./${config.appDirectory}/**/*`],
  });
  let result = shell.grep("-l", 'from "', JSFiles);
  assert.equal(result.stdout.trim(), "");
  assert.equal(result.stderr, null);
  assert.equal(result.code, 0);
}

describe("`convert-to-javascript` migration", (t) => {
  it("runs successfully when ran via CLI", async () => {
    let projectDir = makeApp();

    runConvertToJavaScriptMigrationViaCLI(projectDir);

    await checkMigrationRanSuccessfully(projectDir);
    deleteApp();
  });

  it("runs successfully when ran programmatically", async () => {
    let projectDir = makeApp();

    await runConvertToJavaScriptMigrationProgrammatically(projectDir);

    await checkMigrationRanSuccessfully(projectDir);
    deleteApp();
  });
});
