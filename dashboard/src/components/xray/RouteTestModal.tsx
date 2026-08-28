import {
	Button,
	FormControl,
	FormHelperText,
	FormLabel,
	HStack,
	Input,
	Modal,
	ModalCloseButton,
	ModalOverlay,
	Spinner,
	Tag,
	Text,
	VStack,
	Wrap,
	WrapItem,
} from "@chakra-ui/react";
import { BoltIcon } from "@heroicons/react/24/outline";
import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch as apiFetch } from "service/http";
import type { RoutingRule } from "../RuleModal";
import {
	XrayDialogSection,
	XrayModalBody,
	XrayModalContent,
	XrayModalFooter,
	XrayModalHeader,
} from "./XrayDialog";

type OutboundTraffic = {
	tag: string;
	up: number;
	down: number;
};

type RouteTestResult = {
	success: boolean;
	delay?: number;
	statusCode?: number;
	matched?: boolean;
	outboundTag?: string;
	groupTags?: string[];
	outboundTraffic?: OutboundTraffic[];
	error?: string;
};

type RouteTestModalProps = {
	isOpen: boolean;
	onClose: () => void;
	rule: RoutingRule | null;
	target: string;
	targetName: string;
	isMasterTarget: boolean;
	config: unknown;
};

const firstRuleInbound = (rule: RoutingRule | null) =>
	String(rule?.inboundTag?.[0] || "route-test").trim() || "route-test";

const firstRuleURL = (rule: RoutingRule | null) => {
	const domain = String(rule?.domain?.find((item) => !item.includes(":")) || "").trim();
	if (domain) return `https://${domain}/`;
	const ip = String(rule?.ip?.[0] || "").trim();
	return ip ? `http://${ip}/` : "https://www.google.com/generate_204";
};

const formatBytes = (value: number) => {
	if (!Number.isFinite(value) || value <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

export const RouteTestModal: FC<RouteTestModalProps> = ({
	isOpen,
	onClose,
	rule,
	target,
	targetName,
	isMasterTarget,
	config,
}) => {
	const { t } = useTranslation();
	const [testURL, setTestURL] = useState("");
	const [inboundTag, setInboundTag] = useState("");
	const [isTesting, setIsTesting] = useState(false);
	const [result, setResult] = useState<RouteTestResult | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		setTestURL(firstRuleURL(rule));
		setInboundTag(firstRuleInbound(rule));
		setResult(null);
	}, [isOpen, rule]);

	const runTest = async () => {
		setIsTesting(true);
		setResult(null);
		try {
			const response = await apiFetch<{
				success: boolean;
				obj?: RouteTestResult;
				msg?: string;
			}>("/panel/xray/routeTest", {
				method: "POST",
				body: {
					target_id: target,
					config: JSON.stringify(config || {}),
					test_url: testURL.trim(),
					inbound_tag: inboundTag.trim(),
				},
			});
			if (!response?.success || !response.obj) {
				throw new Error(response?.msg || t("pages.xray.routeTest.failed"));
			}
			setResult(response.obj);
		} catch (error: any) {
			const detail =
				error?.response?._data?.detail ??
				error?.data?.detail ??
				error?.message ??
				t("pages.xray.routeTest.failed");
			setResult({ error: typeof detail === "string" ? detail : String(detail), success: false });
		} finally {
			setIsTesting(false);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
			<ModalOverlay />
			<XrayModalContent>
				<XrayModalHeader>{t("pages.xray.routeTest.title")}</XrayModalHeader>
				<ModalCloseButton />
				<XrayModalBody>
					<VStack align="stretch" spacing={3}>
						<XrayDialogSection>
							<Text fontSize="sm" color="panel.textMuted">
								{isMasterTarget
									? t("pages.xray.routeTester.nodeTargetRequired")
									: t("pages.xray.routeTest.description", { target: targetName })}
							</Text>
						</XrayDialogSection>
						<FormControl isRequired>
							<FormLabel>{t("pages.xray.routeTest.url")}</FormLabel>
							<Input
								value={testURL}
								placeholder="https://example.com/"
								onChange={(event) => setTestURL(event.target.value)}
							/>
							<FormHelperText>{t("pages.xray.routeTest.urlHint")}</FormHelperText>
						</FormControl>
						<FormControl>
							<FormLabel>{t("pages.xray.routeTest.inboundTag")}</FormLabel>
							<Input value={inboundTag} onChange={(event) => setInboundTag(event.target.value)} />
							<FormHelperText>{t("pages.xray.routeTest.inboundHint")}</FormHelperText>
						</FormControl>
						{result && (
							<XrayDialogSection>
								<VStack align="stretch" spacing={2}>
									<Text color={result.success ? "green.300" : "red.300"} fontWeight="semibold" fontSize="sm">
										{result.success
											? t("pages.xray.routeTest.success")
											: result.error || t("pages.xray.routeTest.failed")}
									</Text>
									{result.success && (
										<HStack spacing={2} flexWrap="wrap">
											<Tag size="sm">{result.delay ?? 0} ms</Tag>
											{result.statusCode ? <Tag size="sm">HTTP {result.statusCode}</Tag> : null}
											{result.outboundTag ? <Tag size="sm" colorScheme="blue">{result.outboundTag}</Tag> : null}
											{result.groupTags?.map((tag) => <Tag key={tag} size="sm" colorScheme="orange">{tag}</Tag>)}
										</HStack>
									)}
									{result.outboundTraffic?.length ? (
										<Wrap spacing={2}>
											{result.outboundTraffic.map((traffic) => (
												<WrapItem key={traffic.tag}>
													<Tag size="sm" colorScheme="green">
														{traffic.tag}: {formatBytes(traffic.up + traffic.down)}
													</Tag>
												</WrapItem>
											))}
										</Wrap>
									) : null}
								</VStack>
							</XrayDialogSection>
						)}
					</VStack>
				</XrayModalBody>
				<XrayModalFooter>
					<Button variant="ghost" onClick={onClose}>{t("close")}</Button>
					<Button
						leftIcon={isTesting ? <Spinner size="xs" /> : <BoltIcon />}
						colorScheme="primary"
						onClick={runTest}
						isDisabled={isTesting || isMasterTarget || !testURL.trim()}
					>
						{t("pages.xray.routeTester.test")}
					</Button>
				</XrayModalFooter>
			</XrayModalContent>
		</Modal>
	);
};
