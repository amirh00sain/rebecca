import {
	Button,
	FormControl,
	FormErrorMessage,
	FormHelperText,
	FormLabel,
	Input,
	Modal,
	ModalCloseButton,
	ModalOverlay,
	VStack,
} from "@chakra-ui/react";
import { type FC, useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
	MultiValueAutocomplete,
	splitMultiValueText,
} from "./common/MultiValueAutocomplete";
import type { SearchableTagSelectOption } from "./common/SearchableTagSelect";
import { SearchableTagSelect } from "./common/SearchableTagSelect";
import { OutboundTestButton } from "./xray/OutboundTestButton";
import {
	XrayDialogSection,
	XrayModalBody,
	XrayModalContent,
	XrayModalFooter,
	XrayModalHeader,
} from "./xray/XrayDialog";

export type BalancerFormValues = {
	tag: string;
	strategy: string;
	selector: string[];
	fallbackTag: string;
};

interface BalancerModalProps {
	isOpen: boolean;
	onClose: () => void;
	mode: "create" | "edit";
	initialBalancer?: BalancerFormValues | null;
	outboundTags: string[];
	outboundOptions?: SearchableTagSelectOption[];
	excludedOutboundTags?: string[];
	existingTags: string[];
	onTestOutbound?: (tag: string) => void;
	outboundTestingByTag?: Record<string, boolean>;
	onSubmit: (values: BalancerFormValues) => void;
}

const DEFAULT_BALANCER: BalancerFormValues = {
	tag: "",
	strategy: "random",
	selector: [],
	fallbackTag: "",
};

const uniq = (values: string[]) => Array.from(new Set(values));
const normalizeBalancerOutboundTag = (tag: string) => tag.trim().toLowerCase();

export const BalancerModal: FC<BalancerModalProps> = ({
	isOpen,
	onClose,
	mode,
	initialBalancer,
	outboundTags,
	outboundOptions,
	excludedOutboundTags = [],
	existingTags,
	onTestOutbound,
	outboundTestingByTag = {},
	onSubmit,
}) => {
	const { t } = useTranslation();

	const modalForm = useForm<BalancerFormValues>({
		defaultValues: DEFAULT_BALANCER,
	});

	useEffect(() => {
		modalForm.register("selector");
	}, [modalForm]);

	const tagValue = modalForm.watch("tag");
	const rawSelectorValue = modalForm.watch("selector") ?? [];
	const rawFallbackTagValue = modalForm.watch("fallbackTag") ?? "";
	const excludedOutboundTagKeys = useMemo(
		() =>
			new Set(
				excludedOutboundTags.map(normalizeBalancerOutboundTag).filter(Boolean),
			),
		[excludedOutboundTags],
	);
	const isExcludedBalancerOutbound = useCallback(
		(tag: string) => {
			const normalized = normalizeBalancerOutboundTag(tag);
			return (
				normalized === "blocked" || excludedOutboundTagKeys.has(normalized)
			);
		},
		[excludedOutboundTagKeys],
	);
	const selectableOutboundTags = useMemo(
		() => outboundTags.filter((tag) => !isExcludedBalancerOutbound(tag)),
		[outboundTags, isExcludedBalancerOutbound],
	);
	const selectableOutboundOptions = useMemo(
		() =>
			(outboundOptions ?? selectableOutboundTags).filter(
				(option) =>
					!isExcludedBalancerOutbound(
						typeof option === "string" ? option : option.value,
					),
			),
		[outboundOptions, selectableOutboundTags, isExcludedBalancerOutbound],
	);
	const selectorValue = rawSelectorValue.filter(
		(tag) => !isExcludedBalancerOutbound(tag),
	);
	const fallbackTagValue = isExcludedBalancerOutbound(rawFallbackTagValue)
		? ""
		: rawFallbackTagValue;
	const normalizedTag = tagValue.trim();
	const duplicateTag = !normalizedTag || existingTags.includes(normalizedTag);
	const emptySelector = selectorValue.length === 0;

	useEffect(() => {
		if (!isOpen) return;
		modalForm.reset(
			initialBalancer
				? {
						...DEFAULT_BALANCER,
						...initialBalancer,
						tag: initialBalancer.tag ?? "",
						selector: (initialBalancer.selector ?? []).filter(
							(tag) => !isExcludedBalancerOutbound(tag),
						),
						fallbackTag: isExcludedBalancerOutbound(
							initialBalancer.fallbackTag ?? "",
						)
							? ""
							: (initialBalancer.fallbackTag ?? ""),
					}
				: DEFAULT_BALANCER,
		);
	}, [initialBalancer, isOpen, modalForm, isExcludedBalancerOutbound]);

	const onSubmitInternal = modalForm.handleSubmit((data) => {
		if (!isValid) return;
		const payload: BalancerFormValues = {
			tag: data.tag.trim(),
			strategy: data.strategy,
			selector: uniq(
				data.selector
					.map((item) => item.trim())
					.filter((item) => item && !isExcludedBalancerOutbound(item)),
			),
			fallbackTag: isExcludedBalancerOutbound(data.fallbackTag ?? "")
				? ""
				: (data.fallbackTag ?? ""),
		};
		onSubmit(payload);
	});

	const isValid = useMemo(
		() => !duplicateTag && !emptySelector,
		[duplicateTag, emptySelector],
	);

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.400" backdropFilter="blur(8px)" />
			<XrayModalContent mx="3">
				<XrayModalHeader>
					{mode === "edit"
						? t("pages.xray.balancer.editBalancer")
						: t("pages.xray.balancer.addBalancer")}
				</XrayModalHeader>
				<ModalCloseButton />
				<form onSubmit={onSubmitInternal}>
					<XrayModalBody>
						<VStack spacing={3} align="stretch">
							<XrayDialogSection title={t("pages.xray.balancer.addBalancer")}>
								<VStack spacing={4} align="stretch">
									<FormControl isInvalid={duplicateTag}>
										<FormLabel>{t("pages.xray.balancer.tag")}</FormLabel>
										<Input
											{...modalForm.register("tag")}
											size="sm"
											placeholder={t("pages.xray.balancer.tagDesc")}
										/>
										{duplicateTag ? (
											<FormErrorMessage>
												{t("pages.xray.balancer.tagError")}
											</FormErrorMessage>
										) : (
											<FormHelperText>
												{t("pages.xray.balancer.tagDesc")}
											</FormHelperText>
										)}
									</FormControl>
									<FormControl>
										<FormLabel>
											{t("pages.xray.balancer.balancerStrategy")}
										</FormLabel>
										<SearchableTagSelect
											mode="single"
											options={[
												"random",
												"roundRobin",
												"leastLoad",
												"leastPing",
											]}
											value={modalForm.watch("strategy") ?? ""}
											onChange={(value) =>
												modalForm.setValue("strategy", value as string, {
													shouldDirty: true,
												})
											}
											placeholder={t("pages.xray.balancer.balancerStrategy")}
											searchPlaceholder={t("search")}
										/>
									</FormControl>
									<FormControl isInvalid={emptySelector}>
										<FormLabel>
											{t("pages.xray.balancer.balancerSelectors")}
										</FormLabel>
										<MultiValueAutocomplete
											options={selectableOutboundOptions}
											value={selectorValue.join(", ")}
											onChange={(value) =>
												modalForm.setValue(
													"selector",
													uniq(
														splitMultiValueText(value).filter(
															(tag) => !isExcludedBalancerOutbound(tag),
														),
													),
													{ shouldDirty: true },
												)
											}
											placeholder={t("pages.xray.balancer.selectorPlaceholder")}
											emptyText={t("pages.xray.outbound.empty")}
											rightElement={
												selectorValue.length > 0 ? (
													<OutboundTestButton
														label={t("pages.xray.routeTester.test")}
														tag={selectorValue[0]}
														isTesting={selectorValue.some(
															(tag) => outboundTestingByTag[tag],
														)}
														onTest={() => {
															selectorValue.forEach((tag) => {
																onTestOutbound?.(tag);
															});
														}}
													/>
												) : undefined
											}
										/>
										{emptySelector && (
											<FormErrorMessage>
												{t("pages.xray.balancer.selectorError")}
											</FormErrorMessage>
										)}
									</FormControl>
									<FormControl>
										<FormLabel>
											{t("pages.xray.balancer.fallbackTag")}
										</FormLabel>
										<SearchableTagSelect
											mode="single"
											options={selectableOutboundOptions}
											value={fallbackTagValue}
											onChange={(value) =>
												modalForm.setValue("fallbackTag", value as string, {
													shouldDirty: true,
												})
											}
											placeholder={t("userDialog.flow.none")}
											searchPlaceholder={t("search")}
											emptyText={t("pages.xray.outbound.empty")}
											rightElement={
												<OutboundTestButton
													label={t("pages.xray.routeTester.test")}
													tag={fallbackTagValue}
													isTesting={outboundTestingByTag[fallbackTagValue]}
													onTest={onTestOutbound}
												/>
											}
										/>
									</FormControl>
								</VStack>
							</XrayDialogSection>
						</VStack>
					</XrayModalBody>
					<XrayModalFooter justifyContent="flex-end">
						<Button variant="outline" onClick={onClose}>
							{t("cancel")}
						</Button>
						<Button
							type="submit"
							colorScheme="primary"
							size="sm"
							isDisabled={!isValid}
						>
							{mode === "edit"
								? t("pages.xray.balancer.editBalancer")
								: t("pages.xray.balancer.addBalancer")}
						</Button>
					</XrayModalFooter>
				</form>
			</XrayModalContent>
		</Modal>
	);
};
