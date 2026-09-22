const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export class ImageKitUploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ImageKitUploadError";
  }
}

/** Server-side only: never expose IMAGEKIT_PRIVATE_KEY to a client component. */
export async function uploadToImageKit(file: File): Promise<{ url: string }> {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new ImageKitUploadError(
      "Penyimpanan ImageKit belum dikonfigurasi. Isi IMAGEKIT_PRIVATE_KEY di server.",
      503,
    );
  }
  const filename = `${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const form = new FormData();
  form.set("file", file, filename);
  form.set("fileName", filename);
  form.set(
    "folder",
    process.env.IMAGEKIT_UPLOAD_FOLDER?.trim() || "/geovit/locations",
  );
  form.set("useUniqueFileName", "true");
  form.set("isPrivateFile", "false");

  try {
    const response = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`,
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!response.ok) {
      // Never return provider bodies: they may contain account or request details.
      throw new ImageKitUploadError(
        response.status === 401 || response.status === 403
          ? "ImageKit menolak akses. Periksa private key dan izin upload di server."
          : "Foto gagal diunggah ke ImageKit. Silakan coba lagi.",
        502,
      );
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("url" in data) ||
      typeof data.url !== "string" ||
      new URL(data.url).protocol !== "https:"
    ) {
      throw new ImageKitUploadError(
        "Respons penyimpanan ImageKit tidak valid.",
        502,
      );
    }
    return { url: data.url };
  } catch (error) {
    if (error instanceof ImageKitUploadError) throw error;
    throw new ImageKitUploadError(
      "ImageKit tidak dapat dihubungi. Silakan coba lagi.",
      502,
    );
  }
}
