import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const rootDir = process.cwd();
const skipDirs = new Set([".git", ".next", "node_modules"]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".md",
  ".txt",
  ".svg",
  ".xml",
  ".yml",
  ".yaml"
]);
const vendorBundleDir = path.join(rootDir, "public", "dist", "assets");
const replacementChar = String.fromCharCode(0xfffd);

/** @typedef {{ file: string; reason: string }} Finding */
/** @type {Finding[]} */
const findings = [];

function addFinding(filePath, reason) {
  findings.push({
    file: path.relative(rootDir, filePath),
    reason
  });
}

function shouldSkipDirectory(dirName) {
  return skipDirs.has(dirName);
}

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function inspectTextFile(filePath) {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length >= 2) {
    const bom = `${buffer[0].toString(16).padStart(2, "0")}${buffer[1]
      .toString(16)
      .padStart(2, "0")}`.toLowerCase();
    if (bom === "fffe" || bom === "feff") {
      addFinding(filePath, `unexpected UTF-16 BOM (${bom})`);
      return;
    }
  }

  if (buffer.includes(0)) {
    addFinding(filePath, "contains NUL bytes");
    return;
  }

  const text = buffer.toString("utf8");
  const isVendorBundle = filePath.startsWith(vendorBundleDir);
  if (!isVendorBundle && text.includes(replacementChar)) {
    addFinding(filePath, "contains replacement character U+FFFD");
  }
}

function inspectVendorBundle(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  try {
    new vm.SourceTextModule(code, { identifier: filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addFinding(filePath, `bundle parse failed: ${message}`);
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        walk(path.join(directory, entry.name));
      }
      continue;
    }

    const filePath = path.join(directory, entry.name);
    if (!isTextFile(filePath)) {
      continue;
    }

    inspectTextFile(filePath);

    if (
      filePath.startsWith(vendorBundleDir) &&
      path.extname(filePath).toLowerCase() === ".js"
    ) {
      inspectVendorBundle(filePath);
    }
  }
}

walk(rootDir);

if (findings.length > 0) {
  console.error("Encoding / bundle integrity check failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reason}`);
  }
  process.exitCode = 1;
} else {
  console.log("Encoding / bundle integrity check passed.");
}
