import { fitWithin } from "./fields";

/** Shrink a phone photo (often 5-10MB) to a ~1600px JPEG before upload. Falls back to the original if it can't. */
export async function shrinkPhoto(file: File, max = 1600): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = fitWithin(bmp.width, bmp.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Clipboard with a fallback for browsers/contexts where the async API isn't available. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Hand photos to the phone's share sheet so the seller can "Save to Photos" (browser camera shots may not
 * land in the camera roll). Falls back to plain downloads where sharing files isn't supported.
 */
export async function savePhotos(files: File[]): Promise<"shared" | "downloaded" | "cancelled"> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return "downloaded";
}
