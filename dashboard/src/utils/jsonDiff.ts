export type JsonDiffLine = {
	type: "context" | "remove" | "add";
	text: string;
	beforeLine?: number;
	afterLine?: number;
	highlightStart?: number;
	highlightEnd?: number;
};

const jsonLines = (value: unknown) => {
	if (value === undefined) return [];
	const text = JSON.stringify(value, null, 2);
	return text ? text.split("\n") : [];
};

const appendLine = (
	output: JsonDiffLine[],
	type: JsonDiffLine["type"],
	text: string,
	beforeLine: number | undefined,
	afterLine: number | undefined,
) => output.push({ type, text, beforeLine, afterLine });

const inlineHighlight = (text: string, other: string) => {
	let start = 0;
	while (
		start < text.length &&
		start < other.length &&
		text[start] === other[start]
	) {
		start++;
	}
	let suffix = 0;
	while (
		suffix < text.length - start &&
		suffix < other.length - start &&
		text[text.length - suffix - 1] === other[other.length - suffix - 1]
	) {
		suffix++;
	}
	const end = text.length - suffix;
	if (end > start) return { start, end };

	const boundary = /[\s,:[\]{}]/;
	let tokenStart = Math.min(start, Math.max(0, text.length - 1));
	let tokenEnd = tokenStart;
	while (tokenStart > 0 && !boundary.test(text[tokenStart - 1])) tokenStart--;
	while (tokenEnd < text.length && !boundary.test(text[tokenEnd])) tokenEnd++;
	return tokenEnd > tokenStart
		? { start: tokenStart, end: tokenEnd }
		: undefined;
};

const addInlineHighlights = (lines: JsonDiffLine[]) => {
	for (let index = 0; index < lines.length; ) {
		if (lines[index]?.type !== "remove") {
			index++;
			continue;
		}
		const removesStart = index;
		while (lines[index]?.type === "remove") index++;
		const addsStart = index;
		while (lines[index]?.type === "add") index++;
		const pairs = Math.min(index - addsStart, addsStart - removesStart);
		for (let offset = 0; offset < pairs; offset++) {
			const removed = lines[removesStart + offset];
			const added = lines[addsStart + offset];
			const removedRange = inlineHighlight(removed.text, added.text);
			const addedRange = inlineHighlight(added.text, removed.text);
			if (removedRange)
				Object.assign(removed, {
					highlightStart: removedRange.start,
					highlightEnd: removedRange.end,
				});
			if (addedRange)
				Object.assign(added, {
					highlightStart: addedRange.start,
					highlightEnd: addedRange.end,
				});
		}
	}
};

const appendChangedLines = (
	output: JsonDiffLine[],
	left: string[],
	right: string[],
	leftOffset: number,
	rightOffset: number,
) => {
	if (left.length * right.length > 60_000) {
		left.forEach((text, index) => {
			appendLine(output, "remove", text, leftOffset + index + 1, undefined);
		});
		right.forEach((text, index) => {
			appendLine(output, "add", text, undefined, rightOffset + index + 1);
		});
		return;
	}
	const table = Array.from(
		{ length: left.length + 1 },
		() => new Uint16Array(right.length + 1),
	);
	for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex--) {
		for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) {
			table[leftIndex][rightIndex] =
				left[leftIndex] === right[rightIndex]
					? table[leftIndex + 1][rightIndex + 1] + 1
					: Math.max(
							table[leftIndex + 1][rightIndex],
							table[leftIndex][rightIndex + 1],
						);
		}
	}
	let leftIndex = 0;
	let rightIndex = 0;
	while (leftIndex < left.length || rightIndex < right.length) {
		if (left[leftIndex] === right[rightIndex]) {
			appendLine(
				output,
				"context",
				left[leftIndex],
				leftOffset + leftIndex + 1,
				rightOffset + rightIndex + 1,
			);
			leftIndex++;
			rightIndex++;
		} else if (
			rightIndex === right.length ||
			(leftIndex < left.length &&
				table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1])
		) {
			appendLine(
				output,
				"remove",
				left[leftIndex],
				leftOffset + leftIndex + 1,
				undefined,
			);
			leftIndex++;
		} else {
			appendLine(
				output,
				"add",
				right[rightIndex],
				undefined,
				rightOffset + rightIndex + 1,
			);
			rightIndex++;
		}
	}
};

export const buildJsonDiff = (
	before: unknown,
	after: unknown,
): JsonDiffLine[] => {
	const left = jsonLines(before);
	const right = jsonLines(after);
	let prefix = 0;
	while (
		prefix < left.length &&
		prefix < right.length &&
		left[prefix] === right[prefix]
	) {
		prefix++;
	}
	let suffix = 0;
	while (
		suffix < left.length - prefix &&
		suffix < right.length - prefix &&
		left[left.length - suffix - 1] === right[right.length - suffix - 1]
	) {
		suffix++;
	}

	const output: JsonDiffLine[] = [];
	for (let index = 0; index < prefix; index++) {
		appendLine(output, "context", left[index], index + 1, index + 1);
	}
	appendChangedLines(
		output,
		left.slice(prefix, left.length - suffix),
		right.slice(prefix, right.length - suffix),
		prefix,
		prefix,
	);
	for (let index = suffix; index > 0; index--) {
		const leftIndex = left.length - index;
		const rightIndex = right.length - index;
		appendLine(
			output,
			"context",
			left[leftIndex],
			leftIndex + 1,
			rightIndex + 1,
		);
	}
	addInlineHighlights(output);
	return output;
};
