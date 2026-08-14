import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectDirectory = process.cwd();
const standaloneDirectory = path.join(projectDirectory, ".next", "standalone");

async function copyIfPresent(source: string, destination: string) {
  await cp(source, destination, {
    force: true,
    recursive: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

async function main() {
  await mkdir(path.join(standaloneDirectory, ".next"), {
    recursive: true,
  });

  await copyIfPresent(
    path.join(projectDirectory, ".next", "static"),
    path.join(standaloneDirectory, ".next", "static"),
  );
  await copyIfPresent(
    path.join(projectDirectory, "public"),
    path.join(standaloneDirectory, "public"),
  );

  console.log("Standalone deployment artifact prepared.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
