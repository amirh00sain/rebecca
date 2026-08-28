import { describe, expect, it } from "vitest";

import { parseCoreConfig } from "./coreConfig";

describe("parseCoreConfig", () => {
	it("preserves arbitrary valid Xray configuration sections", () => {
		const config = {
			inbounds: [{ protocol: "vless", port: 443 }],
			custom_extension: { enabled: true },
		};

		expect(parseCoreConfig(config)).toEqual(config);
	});

	it("rejects non-object API responses", () => {
		expect(() => parseCoreConfig(null)).toThrow();
		expect(() => parseCoreConfig([])).toThrow();
	});
});
