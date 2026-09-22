import { ImageKitUploadError, uploadToImageKit } from "@/lib/imagekit";
import { currentUser } from "@/auth";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return Response.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  const user = await currentUser();
  if (!user || !["admin", "editor"].includes(user.role))
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 6 * 1024 * 1024)
    return Response.json(
      { error: "Ukuran file terlalu besar." },
      { status: 413 },
    );
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      return Response.json(
        { error: "Gunakan JPG, PNG atau WebP maksimal 5 MB." },
        { status: 400 },
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const valid =
      (file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) ||
      (file.type === "image/png" &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.type === "image/webp" &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP");
    if (!valid)
      return Response.json(
        { error: "Isi file gambar tidak valid." },
        { status: 400 },
      );
    return Response.json(await uploadToImageKit(file));
  } catch (error) {
    if (error instanceof ImageKitUploadError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Unggah gagal. Periksa file dan coba lagi." },
      { status: 400 },
    );
  }
}
