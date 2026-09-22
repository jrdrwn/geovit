import test from "node:test";
import assert from "node:assert/strict";
import { locationInput, slsInput } from "../src/lib/validation";
const valid = {
  sls_id: "sls-001",
  title: "Rumah uji",
  latitude: -6.2,
  longitude: 106.8,
};
test("coordinates reject empty, non-finite and out-of-range values", () => {
  for (const value of ["", " ", "abc", 91, -91, Infinity])
    assert.equal(
      locationInput.safeParse({ ...valid, latitude: value }).success,
      false,
    );
  for (const value of [181, -181, ""])
    assert.equal(
      locationInput.safeParse({ ...valid, longitude: value }).success,
      false,
    );
  assert.equal(
    locationInput.safeParse({ ...valid, latitude: "0", longitude: "0" })
      .success,
    true,
  );
});
test("image and marker inputs cannot contain executable content", () => {
  assert.equal(
    locationInput.safeParse({ ...valid, image_url: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    locationInput.safeParse({ ...valid, image_url: "/uploads/../test.svg" })
      .success,
    false,
  );
  assert.equal(
    slsInput.safeParse({
      code: "SLS-001",
      name: "Test",
      marker_color: "red; background:url(x)",
    }).success,
    false,
  );
});
