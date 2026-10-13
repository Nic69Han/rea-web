import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  LC,
  buildVersionCommand,
  dylibCommand,
  machoImage,
  rpathCommand,
  FILE_TYPE,
} from "../../src/artifacts/apple/MachoImage.fixture.js";

/** Thin Mach-O executable that loads each install name; none is on disk. */
export const writeMachoExecutable = async (
  directory: string,
  installNames: readonly string[],
): Promise<string> => {
  const path = join(directory, "tool");
  await writeFile(
    path,
    machoImage({
      commands: [
        buildVersionCommand(1),
        ...installNames.map((name) => dylibCommand(LC.LOAD_DYLIB, name)),
      ],
    }),
  );
  return path;
};

/** App bundle whose executable resolves one framework through an rpath. */
export const writeMachoApp = async (directory: string): Promise<string> => {
  const app = join(directory, "Fixture.app");
  await mkdir(join(app, "Contents/MacOS"), { recursive: true });
  await mkdir(join(app, "Contents/Frameworks"), { recursive: true });
  await writeFile(
    join(app, "Contents/Info.plist"),
    "<plist><dict><key>CFBundleExecutable</key><string>App</string></dict></plist>",
  );
  await writeFile(
    join(app, "Contents/MacOS/App"),
    machoImage({
      commands: [
        buildVersionCommand(1),
        rpathCommand("@executable_path/../Frameworks"),
        dylibCommand(LC.LOAD_DYLIB, "@rpath/libcore.dylib"),
        dylibCommand(LC.LOAD_DYLIB, "@rpath/libmissing.dylib"),
      ],
    }),
  );
  await writeFile(
    join(app, "Contents/Frameworks/libcore.dylib"),
    machoImage({
      fileType: FILE_TYPE.dylib,
      commands: [buildVersionCommand(1)],
    }),
  );
  return app;
};

/** Minimal 64-bit little-endian ELF executable header. */
export const writeElfExecutable = async (
  directory: string,
): Promise<string> => {
  const path = join(directory, "elf-tool");
  const header = Buffer.alloc(64);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  header.writeUInt16LE(2, 16);
  header.writeUInt16LE(0x3e, 18);
  header.writeUInt32LE(1, 20);
  header.writeUInt16LE(64, 52);
  await writeFile(path, header);
  return path;
};
