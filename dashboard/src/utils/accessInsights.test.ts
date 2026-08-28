import { describe, expect, it } from "vitest";

import { filterAccessInsightItems } from "./accessInsights";

const items = [
	{
		user_key: "alice",
		user_label: "Alice",
		last_seen: "2026-07-25T10:00:00Z",
		route: "",
		connections: 1,
		nodes: ["tehran-1"],
		platforms: [{ platform: "OpenVPN", connections: 1, destinations: [] }],
	},
	{
		user_key: "bob",
		user_label: "Bob",
		last_seen: "2026-07-25T10:00:00Z",
		route: "",
		connections: 1,
		nodes: ["frankfurt-1"],
		platforms: [{ platform: "Xray", connections: 1, destinations: [] }],
	},
];

describe("filterAccessInsightItems", () => {
	it("keeps only entries that match every selected filter", () => {
		expect(
			filterAccessInsightItems(items, {
				node: "tehran-1",
				protocol: "OpenVPN",
			}).map((item) => item.user_key),
		).toEqual(["alice"]);
	});
});
