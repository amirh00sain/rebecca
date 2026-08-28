import type { AccessInsightClient } from "types/AccessInsights";

export const filterAccessInsightItems = (
	items: AccessInsightClient[],
	filters: { node: string; protocol: string },
) =>
	items.filter(
		(item) =>
			(!filters.protocol ||
				item.platforms.some(
					(platform) => platform.platform === filters.protocol,
				)) &&
			(!filters.node || item.nodes?.includes(filters.node)),
	);
