import test from "node:test";
import assert from "node:assert/strict";
import { ImageKitUploadError, uploadToImageKit } from "../src/lib/imagekit";

test("ImageKit server upload contract and failure handling", async (t) => {
  const originalKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const originalFolder = process.env.IMAGEKIT_UPLOAD_FOLDER;
  const file = new File(
    [new Uint8Array([137, 80, 78, 71])],
    "private-name.png",
    { type: "image/png" },
  );
  try {
    await t.test(
      "missing credentials never contact the provider",
      async (t) => {
        delete process.env.IMAGEKIT_PRIVATE_KEY;
        const request = t.mock.method(globalThis, "fetch", async () => {
          throw Error("Unexpected network request");
        });
        await assert.rejects(
          uploadToImageKit(file),
          (error: unknown) =>
            error instanceof ImageKitUploadError && error.status === 503,
        );
        assert.equal(request.mock.callCount(), 0);
      },
    );
    process.env.IMAGEKIT_PRIVATE_KEY = "test-private-key";
    process.env.IMAGEKIT_UPLOAD_FOLDER = "/geovit/test";
    await t.test(
      "sends authenticated multipart file and returns only HTTPS URL",
      async (t) => {
        t.mock.method(
          globalThis,
          "fetch",
          async (url: string, init: RequestInit) => {
            assert.equal(url, "https://upload.imagekit.io/api/v1/files/upload");
            assert.equal(init.method, "POST");
            assert.equal(
              new Headers(init.headers).get("Authorization"),
              `Basic ${Buffer.from("test-private-key:").toString("base64")}`,
            );
            assert.equal(new Headers(init.headers).has("Content-Type"), false);
            assert.equal(init.redirect, "error");
            assert.ok(init.signal);
            const form = init.body as FormData;
            assert.equal(form.get("folder"), "/geovit/test");
            assert.equal(form.get("isPrivateFile"), "false");
            assert.match(String(form.get("fileName")), /^[a-f0-9-]+\.png$/);
            assert.ok(form.get("file") instanceof File);
            assert.equal((form.get("file") as File).size, file.size);
            return Response.json({
              url: "https://ik.imagekit.io/test/photo.png",
              fileId: "provider-id",
            });
          },
        );
        assert.deepEqual(await uploadToImageKit(file), {
          url: "https://ik.imagekit.io/test/photo.png",
        });
      },
    );
    await t.test(
      "provider failure does not leak its response body",
      async (t) => {
        t.mock.method(globalThis, "fetch", async () =>
          Response.json(
            { message: "sensitive-provider-detail" },
            { status: 401 },
          ),
        );
        await assert.rejects(
          uploadToImageKit(file),
          (error: unknown) =>
            error instanceof ImageKitUploadError &&
            error.status === 502 &&
            !error.message.includes("sensitive-provider-detail"),
        );
      },
    );
    await t.test("unsafe response URLs are rejected", async (t) => {
      t.mock.method(globalThis, "fetch", async () =>
        Response.json({ url: "javascript:alert(1)" }),
      );
      await assert.rejects(uploadToImageKit(file), ImageKitUploadError);
    });
    await t.test(
      "network timeout returns a safe retryable message",
      async (t) => {
        t.mock.method(globalThis, "fetch", async () => {
          throw new DOMException("Timeout", "TimeoutError");
        });
        await assert.rejects(
          uploadToImageKit(file),
          (error: unknown) =>
            error instanceof ImageKitUploadError && error.status === 502,
        );
      },
    );
  } finally {
    if (originalKey === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
    else process.env.IMAGEKIT_PRIVATE_KEY = originalKey;
    if (originalFolder === undefined) delete process.env.IMAGEKIT_UPLOAD_FOLDER;
    else process.env.IMAGEKIT_UPLOAD_FOLDER = originalFolder;
  }
});
