const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBin =
  process.platform === "win32"
    ? path.join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe")
    : path.join(__dirname, "..", "node_modules", ".bin", "electron");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ["."], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
