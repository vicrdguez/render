// Literal bytes and digests from docs/verification/durable-workspace-failure-cases.md, computed with
// `shasum -a 256` before implementation.
export const G1 = {
	bytes: Buffer.from("R3JvdW5kOiBrZWVwIGFja25vd2xlZGdlZCB3b3JrIHNhZmUNCu+7v+KYgyDwnYSeIGNhZsOpDQo=", "base64"),
	digest: "sha256:a9f5b6f878692c7bb3c76ed6b6eb4baa791a2e57d1fd15fa7e26b35e338c0c47",
	byteLength: 56,
};
export const A1 = {
	bytes: Buffer.from("U2F2ZWQgYnkgQTogZmlyc3QgZXhhY3QgcmV2aXNpb24K", "base64"),
	digest: "sha256:d3cde75e8b37c8d63e0d03706480dc8a113966019d752963689be108e86f3c0b",
	byteLength: 33,
};
export const B1 = {
	bytes: Buffer.from("U3RhbGUgZWRpdCBmcm9tIEIK", "base64"),
	digest: "sha256:bd9a08c34d91f52c8fe5341e23b2433b78847b64c4147df447133a440a8ce135",
	byteLength: 18,
};
export const B2 = {
	bytes: Buffer.from("QiByZWJhc2VkIGJ5IGhhbmQgb250byBBCg==", "base64"),
	digest: "sha256:c8365e8a2ef1088dcfe404861d81ddca597f4e02077a0a1e41f12f93ee476a71",
	byteLength: 25,
};
export const BOM = {
	bytes: Buffer.from("77u/Qk9NIGZpcnN0AG51bCBrZXB0Cg==", "base64"),
	digest: "sha256:8fbce4ab7c4e6c4da8282095f3d33ea1ff88a655970a425f9226f79746dfcf14",
	byteLength: 22,
};
export const BAD = { bytes: Buffer.from("//4gbm90IHV0Zjg=", "base64"), byteLength: 11 };
