import { unzipSync } from "fflate";

import { LIMITS } from "../config";
import { ImportError } from "../files";

/**
 * Read the files out of a zip. The size and count limits are checked against
 * the sizes the archive declares, before anything is decompressed, so a small
 * archive that expands to gigabytes is refused up front.
 */
export function filesFromZip(zip: Uint8Array): Array<[string, Uint8Array]> {
  if (zip.byteLength > LIMITS.maxBytes) {
    throw new ImportError("too_large", "The zip file is larger than 200 MB.");
  }
  let declared = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter(file) {
        if (file.name.endsWith("/")) return false;
        count += 1;
        declared += file.originalSize;
        if (count > LIMITS.maxFiles) {
          throw new ImportError("too_many_files", "The game has more than 2,000 files.");
        }
        if (declared > LIMITS.maxBytes) {
          throw new ImportError("too_large", "The game is larger than 200 MB once unpacked.");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("bad_zip", "That file is not a readable zip archive.");
  }
  return Object.entries(entries);
}
