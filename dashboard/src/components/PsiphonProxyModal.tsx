import {
	Alert,
	AlertIcon,
	Badge,
	Box,
	Button,
	FormControl,
	FormErrorMessage,
	FormHelperText,
	FormLabel,
	HStack,
	Input,
	Modal,
	ModalCloseButton,
	ModalOverlay,
	Text,
	Textarea,
	useColorModeValue,
	VStack,
} from "@chakra-ui/react";
import { type FC, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { fetch as apiFetch } from "service/http";
import { countrySelectOptions } from "../utils/countries";
import {
	MultiValueAutocomplete,
	splitMultiValueText,
} from "./common/MultiValueAutocomplete";
import {
	XrayDialogSection,
	XrayFieldGrid,
	XrayModalBody,
	XrayModalContent,
	XrayModalFooter,
	XrayModalHeader,
} from "./xray/XrayDialog";

export type PsiphonProxyFormValues = {
	config: string;
	locations: string;
	port: number;
	tag: string;
};

type Props = {
	isOpen: boolean;
	isLoading: boolean;
	isMasterTarget: boolean;
	targetID: string;
	existingTags: string[];
	onClose: () => void;
	onSubmit: (values: PsiphonProxyFormValues) => Promise<void>;
};

const defaults: PsiphonProxyFormValues = {
	config: "",
	locations: "",
	port: 20888,
	tag: "psiphon",
};

export const PsiphonProxyModal: FC<Props> = ({
	isOpen,
	isLoading,
	isMasterTarget,
	targetID,
	existingTags,
	onClose,
	onSubmit,
}) => {
	const { t, i18n } = useTranslation();
	const form = useForm<PsiphonProxyFormValues>({ defaultValues: defaults });
	const borderColor = useColorModeValue("gray.200", "whiteAlpha.200");
	const [isLoadingLocations, setIsLoadingLocations] = useState(false);
	const [availableLocations, setAvailableLocations] = useState<string[]>([]);
	const [loadedConfig, setLoadedConfig] = useState("");
	const [loadError, setLoadError] = useState("");
	const locationOptions = useMemo(
		() => countrySelectOptions(i18n.language, availableLocations),
		[availableLocations, i18n.language],
	);
	const config = form.watch("config").trim();
	const locationsReady =
		availableLocations.length > 0 && loadedConfig === config;
	const locations = splitMultiValueText(form.watch("locations")).map((value) =>
		value.toLowerCase(),
	);
	const tag = form.watch("tag").trim();
	const startPort = Number(form.watch("port"));
	const preview = locations.map((location, index) => ({
		location,
		port: startPort + index,
		tag: `${tag}-${location}`,
	}));
	const duplicateTag = preview.find((item) => existingTags.includes(item.tag))?.tag;

	useEffect(() => {
		if (!isOpen) return;
		form.reset(defaults);
		setAvailableLocations([]);
		setLoadedConfig("");
		setLoadError("");
	}, [form, isOpen]);

	const loadLocations = async () => {
		if (!(await form.trigger("config"))) return;
		setIsLoadingLocations(true);
		setLoadError("");
		const configValue = form.getValues("config").trim();
		try {
			const response = await apiFetch<{
				success: boolean;
				obj?: { locations?: string[] };
				msg?: string;
			}>("/panel/xray/psiphon/locations", {
				method: "POST",
				body: { target_id: targetID, config: configValue },
			});
			if (!response?.success) {
				throw new Error(response?.msg || t("pages.xray.psiphon.locationsFailed"));
			}
			const locations = (response.obj?.locations ?? []).filter((value) =>
				/^[a-z]{2}$/i.test(value),
			);
			if (locations.length === 0) {
				throw new Error(t("pages.xray.psiphon.noLocations"));
			}
			setAvailableLocations(locations.map((value) => value.toLowerCase()));
			setLoadedConfig(configValue);
			form.setValue("locations", "", { shouldValidate: true });
		} catch (error: any) {
			setAvailableLocations([]);
			setLoadedConfig("");
			const detail =
				error?.response?._data?.detail ??
				error?.data?.detail ??
				error?.message ??
				t("pages.xray.psiphon.locationsFailed");
			setLoadError(typeof detail === "string" ? detail : JSON.stringify(detail));
		} finally {
			setIsLoadingLocations(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			size="xl"
			isCentered
			closeOnEsc={!isLoading && !isLoadingLocations}
			closeOnOverlayClick={!isLoading && !isLoadingLocations}
		>
			<ModalOverlay />
			<XrayModalContent>
				<Box
					as="form"
					display="flex"
					flex="1"
					flexDirection="column"
					minH={0}
					overflow="hidden"
					onSubmit={form.handleSubmit(onSubmit)}
				>
					<XrayModalHeader subtitle={t("pages.xray.psiphon.description")}>
						{t("pages.xray.psiphon.title")}
					</XrayModalHeader>
					<ModalCloseButton isDisabled={isLoading || isLoadingLocations} />
					<XrayModalBody flex="1" minH={0} overflowY="auto">
						<VStack spacing={3} align="stretch">
							{isMasterTarget && (
								<Alert status="warning" borderRadius="sm" fontSize="sm">
									<AlertIcon />
									{t("pages.xray.psiphon.nodeRequired")}
								</Alert>
							)}
							<XrayDialogSection title={t("pages.xray.psiphon.config")}>
								<FormControl isInvalid={Boolean(form.formState.errors.config)}>
									<FormLabel>{t("pages.xray.psiphon.config")}</FormLabel>
									<Textarea
										fontFamily="mono"
										minH="160px"
										spellCheck={false}
										{...form.register("config", {
											required: t("pages.xray.psiphon.configRequired"),
											maxLength: {
												value: 1 << 20,
												message: t("pages.xray.psiphon.configInvalid"),
											},
											validate: (value) => {
												try {
													const parsed = JSON.parse(value);
													return (
														(parsed && typeof parsed === "object" && !Array.isArray(parsed)) ||
														t("pages.xray.psiphon.configInvalid")
													);
												} catch {
													return t("pages.xray.psiphon.configInvalid");
												}
											},
										})}
									/>
									<FormHelperText>
										{t("pages.xray.psiphon.configHint")}
									</FormHelperText>
									<FormErrorMessage>
										{form.formState.errors.config?.message}
									</FormErrorMessage>
									<Button
										mt={3}
										size="sm"
										type="button"
										variant="outline"
										isLoading={isLoadingLocations}
										isDisabled={isMasterTarget || isLoading}
										onClick={loadLocations}
									>
										{t("pages.xray.psiphon.loadLocations")}
									</Button>
									{loadError && (
										<Alert mt={3} status="error" borderRadius="sm" fontSize="sm">
											<AlertIcon />
											{loadError}
										</Alert>
									)}
								</FormControl>
							</XrayDialogSection>
							<XrayDialogSection title={t("pages.xray.psiphon.proxy")}>
								<FormControl isInvalid={Boolean(form.formState.errors.locations)}>
									<FormLabel>{t("pages.xray.psiphon.locations")}</FormLabel>
									<Controller
										name="locations"
										control={form.control}
										rules={{
										validate: (value) => {
											if (!locationsReady) {
												return t("pages.xray.psiphon.locationsRequired");
											}
											const selected = splitMultiValueText(value);
												if (selected.length === 0) {
													return t("pages.xray.psiphon.locationsRequired");
												}
											if (selected.length > 20) {
													return t("pages.xray.psiphon.locationsLimit");
											}
											if (
												selected.some(
													(item) => !availableLocations.includes(item.toLowerCase()),
												)
											) {
												return t("pages.xray.psiphon.locationsRequired");
											}
												return (
													new Set(selected.map((item) => item.toLowerCase())).size ===
														selected.length || t("pages.xray.psiphon.locationsDuplicate")
												);
											},
										}}
										render={({ field }) => (
											<MultiValueAutocomplete
												allowCustom={false}
												isDisabled={!locationsReady || isLoadingLocations}
												options={locationOptions}
												placeholder={t("pages.xray.psiphon.selectLocations")}
												value={field.value}
												onChange={field.onChange}
											/>
										)}
									/>
									<FormHelperText>
										{t("pages.xray.psiphon.locationsHint")}
									</FormHelperText>
									<FormErrorMessage>
										{form.formState.errors.locations?.message}
									</FormErrorMessage>
								</FormControl>
								<XrayFieldGrid mt={3}>
									<FormControl isInvalid={Boolean(form.formState.errors.port)}>
										<FormLabel>{t("pages.xray.psiphon.port")}</FormLabel>
										<Input
											type="number"
											inputMode="numeric"
											{...form.register("port", {
												valueAsNumber: true,
												validate: (value) =>
													(value >= 1024 && value + Math.max(0, locations.length - 1) <= 65535) ||
													t("pages.xray.psiphon.portInvalid"),
											})}
										/>
										<FormErrorMessage>
											{form.formState.errors.port?.message}
										</FormErrorMessage>
									</FormControl>
									<FormControl isInvalid={Boolean(form.formState.errors.tag || duplicateTag)}>
										<FormLabel>{t("pages.xray.psiphon.tagPrefix")}</FormLabel>
										<Input
											{...form.register("tag", {
												required: t("pages.xray.psiphon.tagRequired"),
												pattern: {
													value: /^[a-zA-Z0-9_.-]+$/,
													message: t("pages.xray.psiphon.tagInvalid"),
												},
											})}
										/>
										<FormErrorMessage>
											{form.formState.errors.tag?.message ||
												(duplicateTag
													? t("pages.xray.outbound.tagExistsNamed", {
															tag: duplicateTag,
														})
													: undefined)}
										</FormErrorMessage>
									</FormControl>
								</XrayFieldGrid>
								<Box mt={4} pt={3} borderTopWidth="1px" borderColor={borderColor}>
									<HStack justify="space-between" mb={2}>
										<Text fontSize="xs" fontWeight="semibold">
											{t("pages.xray.psiphon.preview")}
										</Text>
										<Badge variant="subtle">{preview.length}</Badge>
									</HStack>
									<VStack align="stretch" spacing={0} maxH="152px" overflowY="auto">
										{preview.map((item, index) => (
											<HStack
												key={`${item.location}-${index}`}
												justify="space-between"
												minH="34px"
												borderBottomWidth="1px"
												borderColor={borderColor}
												fontSize="xs"
											>
												<Text fontWeight="medium">{item.tag}</Text>
												<Text color="panel.textMuted" fontFamily="mono">
													127.0.0.1:{item.port}
												</Text>
											</HStack>
										))}
									</VStack>
								</Box>
							</XrayDialogSection>
						</VStack>
					</XrayModalBody>
					<XrayModalFooter justifyContent="flex-end">
						<Button
							variant="outline"
							onClick={onClose}
							isDisabled={isLoading || isLoadingLocations}
						>
							{t("cancel")}
						</Button>
						<Button
							type="submit"
							colorScheme="primary"
							isLoading={isLoading}
							isDisabled={
								isMasterTarget ||
								!locationsReady ||
								isLoadingLocations ||
								Boolean(duplicateTag)
							}
						>
							{t("pages.xray.psiphon.start")}
						</Button>
					</XrayModalFooter>
				</Box>
			</XrayModalContent>
		</Modal>
	);
};
