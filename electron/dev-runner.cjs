const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const electronBin =
  process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", ".bin", "electron");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const compiled = spawnSync(process.execPath, [tscBin, "-p", path.join(__dirname, "tsconfig.json")], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: false
});

if (compiled.status !== 0) {
  process.exit(compiled.status ?? 1);
}

const child = spawn(electronBin, ["."], {
  cwd: root,
  env,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
