import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Build Tracker.app on macOS.");

const repo = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.TRACKER_LAUNCHER_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a valid loopback port.");

const build = join(repo, "build");
const destination = join(build, "Tracker.app");
mkdirSync(build, { recursive: true });
const stage = mkdtempSync(join(build, "tracker-launcher-"));
const bundle = join(stage, "Tracker.app");
const executable = join(bundle, "Contents", "MacOS", "Tracker");
const resources = join(bundle, "Contents", "Resources");
const xml = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

try {
  mkdirSync(dirname(executable), { recursive: true });
  mkdirSync(resources);
  const iconset = join(stage, "Tracker.iconset");
  const drawIcon = join(stage, "tracker-icon");
  mkdirSync(iconset);
  execFileSync("/usr/bin/xcrun", ["swiftc", "-parse-as-library", join(repo, "desktop", "TrackerIcon.swift"), "-o", drawIcon], { stdio: "inherit" });
  execFileSync(drawIcon, [iconset], { stdio: "inherit" });
  execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", join(resources, "Tracker.icns")], { stdio: "inherit" });
  writeFileSync(join(bundle, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>Tracker</string>
  <key>CFBundleIdentifier</key><string>local.tracker.desktop</string>
  <key>CFBundleName</key><string>Tracker</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>Tracker.icns</string>
  <key>CFBundleVersion</key><string>3</string>
  <key>CFBundleShortVersionString</key><string>1.2</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSDesktopFolderUsageDescription</key><string>Tracker uses its project folder on Desktop to start the local server.</string>
  <key>TrackerWorkspace</key><string>${xml(repo)}</string>
  <key>TrackerNode</key><string>${xml(process.execPath)}</string>
  <key>TrackerPort</key><integer>${port}</integer>
</dict></plist>
`);
  execFileSync("/usr/bin/xcrun", [
    "swiftc", "-O", "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`,
    join(repo, "desktop", "TrackerServer.swift"), join(repo, "desktop", "TrackerLauncher.swift"), "-o", executable,
  ], { stdio: "inherit" });
  execFileSync("/usr/bin/plutil", ["-lint", join(bundle, "Contents", "Info.plist")], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", bundle], { stdio: "inherit" });
  const previous = join(stage, "previous.app");
  if (existsSync(destination)) renameSync(destination, previous);
  try {
    renameSync(bundle, destination);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, destination);
    throw error;
  }
  console.log(`Built ${destination}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
