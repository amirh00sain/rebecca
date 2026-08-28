import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("service/http", () => ({ fetch: vi.fn() }));
vi.mock("components/Statistics", () => ({ StatisticsQueryKey: "statistics" }));
vi.mock("utils/userPreferenceStorage", () => ({
	getUsersPerPageLimitSize: () => 10,
}));

import { fetch as apiFetch } from "service/http";

import { useDashboard } from "./DashboardContext";

type PendingRequest = { resolve: (value: unknown) => void };

describe("onEditingUser", () => {
	afterEach(() => {
		vi.clearAllMocks();
		useDashboard.setState({ editingUser: null, editingUserInitialTab: null });
	});

	it("keeps the newest user detail when requests finish out of order", async () => {
		const pending: PendingRequest[] = [];
		vi.mocked(apiFetch).mockImplementation(
			() =>
				new Promise((resolve) => {
					pending.push({ resolve });
				}),
		);

		useDashboard.getState().onEditingUser({ username: "old" } as never);
		useDashboard.getState().onEditingUser({ username: "new" } as never);

		pending[1].resolve({ username: "new" });
		await Promise.resolve();
		pending[0].resolve({ username: "old" });
		await Promise.resolve();

		expect(useDashboard.getState().editingUser).toMatchObject({
			username: "new",
		});
	});
});
