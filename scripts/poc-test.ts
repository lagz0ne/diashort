// POC test: Verify chrome-headless-shell + browser-farm works in Docker
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "../src/atoms/browser-farm";

const CHROME_PATH = process.env.CHROME_PATH || "/opt/chrome/chrome-headless-shell";

console.log("=== Chrome Headless Shell POC Test ===");
console.log(`Chrome path: ${CHROME_PATH}`);

// Check if chrome exists
const chromeFile = Bun.file(CHROME_PATH);
if (!(await chromeFile.exists())) {
  console.error(`ERROR: Chrome not found at ${CHROME_PATH}`);
  process.exit(1);
}
console.log("✓ Chrome binary found");

// Test Chrome version
console.log("\nTest 0: Chrome version...");
const proc = Bun.spawn([CHROME_PATH, "--version"], { stdout: "pipe" });
const version = await new Response(proc.stdout).text();
console.log(`Chrome version: ${version.trim()}`);

// Create in-memory DB for testing
const db = new Database(":memory:");

const farm = createBrowserFarm({
  executablePath: CHROME_PATH,
  db,
  poolSize: 1,
  timeout: 30_000,
  noSandbox: true, // Required in Docker
});

try {
  console.log("\nStarting browser farm...");
  await farm.start();
  console.log("✓ Browser farm started");

  // Test 1: Simple diagram
  console.log("\nTest 1: Simple flowchart...");
  const svg1 = await farm.render("graph TD; A-->B");
  if (svg1.includes("<svg") && svg1.includes("</svg>")) {
    console.log("✓ Simple flowchart rendered successfully");
    console.log(`  SVG size: ${svg1.length} bytes`);
  } else {
    throw new Error("Invalid SVG output");
  }

  // Test 2: More complex diagram
  console.log("\nTest 2: Sequence diagram...");
  const svg2 = await farm.render(`
    sequenceDiagram
      Alice->>Bob: Hello Bob!
      Bob-->>Alice: Hi Alice!
  `);
  if (svg2.includes("<svg") && svg2.includes("</svg>")) {
    console.log("✓ Sequence diagram rendered successfully");
    console.log(`  SVG size: ${svg2.length} bytes`);
  } else {
    throw new Error("Invalid SVG output");
  }

  // Test 3: Verify security - should reject dangerous input
  console.log("\nTest 3: Security check (javascript:)...");
  try {
    await farm.render('click A "javascript:alert(1)"');
    console.error("✗ Security check FAILED - dangerous input was accepted");
    process.exit(1);
  } catch (e) {
    if ((e as Error).message.includes("forbidden")) {
      console.log("✓ javascript: protocol rejected");
    } else {
      throw e;
    }
  }

  // Test 4: Valid text with "data:" in label (should pass)
  console.log("\nTest 4: Valid 'data:' in label...");
  const svg4 = await farm.render("graph TD\n    A[Show data: step 1] --> B[Process]");
  if (svg4.includes("<svg")) {
    console.log("✓ Valid 'data:' label accepted");
  } else {
    throw new Error("Valid input rejected");
  }

  // Test 5: Dangerous data URI (should reject)
  console.log("\nTest 5: Dangerous data URI...");
  try {
    await farm.render('click A "data:text/html,<script>alert(1)</script>"');
    console.error("✗ Security check FAILED - data URI was accepted");
    process.exit(1);
  } catch (e) {
    if ((e as Error).message.includes("forbidden")) {
      console.log("✓ Dangerous data URI rejected");
    } else {
      throw e;
    }
  }

  // Test 6: Concurrent rendering
  console.log("\nTest 6: Concurrent rendering...");
  const concurrent = await Promise.all([
    farm.render("graph LR; A-->B"),
    farm.render("graph LR; C-->D"),
    farm.render("graph LR; E-->F"),
  ]);
  if (concurrent.every(svg => svg.includes("<svg"))) {
    console.log("✓ Concurrent rendering works");
  } else {
    throw new Error("Concurrent rendering failed");
  }

  console.log("\n=== All POC tests passed! ===");
} catch (err) {
  console.error("\n✗ POC test failed:", err);
  process.exit(1);
} finally {
  await farm.stop();
  db.close();
}
