import type { ExportMp4FrameRate, ExportQuality } from "@/lib/exporter";
import { type AspectRatio, getAspectRatioValue } from "@/utils/aspectRatioUtils";

export type Mp4SupportProbeSnapshot = {
	sourceWidth: number;
	sourceHeight: number;
	targetWidth: number;
	targetHeight: number;
	aspectRatio: AspectRatio;
	frameRate: ExportMp4FrameRate;
};

export function shouldDebounceMp4SupportProbe(
	previous: Mp4SupportProbeSnapshot | null,
	current: Mp4SupportProbeSnapshot,
): boolean {
	if (
		!previous ||
		current.aspectRatio !== "native" ||
		previous.aspectRatio !== current.aspectRatio ||
		previous.frameRate !== current.frameRate ||
		previous.sourceWidth !== current.sourceWidth ||
		previous.sourceHeight !== current.sourceHeight
	) {
		return false;
	}

	return (
		previous.targetWidth !== current.targetWidth ||
		previous.targetHeight !== current.targetHeight
	);
}

function normalizeEvenDimension(value: number): number {
	return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * Ceiling for the export canvas that the quality tiers scale from.
 *
 * "Original" follows the source, and a full-screen capture of a 5K panel at backing
 * scale 2 is 5120 x 2880. For a 9:16 export that produced a 2880 x 5120 canvas:
 * 14.7 megapixels read back per frame and taller than H.264 hardware encoders accept,
 * so the export stalled or failed. Capping the canvas at 4K UHD (3840 on the long side,
 * 2160 on the short side) keeps the largest tier encodable and every lower tier scales
 * from the capped canvas. Sources at or below 4K are unaffected.
 */
export const MAX_EXPORT_LONG_SIDE = 3840;
export const MAX_EXPORT_SHORT_SIDE = 2160;

export function capExportCanvasDimensions(
	width: number,
	height: number,
	maxLongSide: number = MAX_EXPORT_LONG_SIDE,
	maxShortSide: number = MAX_EXPORT_SHORT_SIDE,
): { width: number; height: number } {
	const longSide = Math.max(width, height);
	const shortSide = Math.min(width, height);
	const scale = Math.min(1, maxLongSide / longSide, maxShortSide / shortSide);

	if (!Number.isFinite(scale) || scale >= 1) {
		return { width: normalizeEvenDimension(width), height: normalizeEvenDimension(height) };
	}

	return {
		width: normalizeEvenDimension(width * scale),
		height: normalizeEvenDimension(height * scale),
	};
}

function fitAspectRatioWithinBounds(
	maxWidth: number,
	maxHeight: number,
	aspectRatioValue: number,
): { width: number; height: number } {
	const safeMaxWidth = normalizeEvenDimension(maxWidth);
	const safeMaxHeight = normalizeEvenDimension(maxHeight);
	const safeAspectRatio =
		Number.isFinite(aspectRatioValue) && aspectRatioValue > 0 ? aspectRatioValue : 16 / 9;

	if (safeMaxWidth / safeMaxHeight > safeAspectRatio) {
		const height = safeMaxHeight;
		const width = normalizeEvenDimension(height * safeAspectRatio);
		return { width: Math.min(width, safeMaxWidth), height };
	}

	const width = safeMaxWidth;
	const height = normalizeEvenDimension(width / safeAspectRatio);
	return { width, height: Math.min(height, safeMaxHeight) };
}

export function calculateMp4SourceDimensions(
	sourceWidth: number,
	sourceHeight: number,
	aspectRatio: AspectRatio,
	cropRegion?: { width: number; height: number },
): { width: number; height: number } {
	const useCroppedBounds = aspectRatio === "native";
	const safeSourceWidth = normalizeEvenDimension(
		sourceWidth * (useCroppedBounds ? (cropRegion?.width ?? 1) : 1),
	);
	const safeSourceHeight = normalizeEvenDimension(
		sourceHeight * (useCroppedBounds ? (cropRegion?.height ?? 1) : 1),
	);
	const sourceAspectRatio = safeSourceHeight > 0 ? safeSourceWidth / safeSourceHeight : 16 / 9;
	const aspectRatioValue = getAspectRatioValue(aspectRatio, sourceAspectRatio);

	if (aspectRatio === "native") {
		return capExportCanvasDimensions(safeSourceWidth, safeSourceHeight);
	}

	const longSide = Math.max(safeSourceWidth, safeSourceHeight);
	const shortSide = Math.min(safeSourceWidth, safeSourceHeight);
	const maxWidth = aspectRatioValue >= 1 ? longSide : shortSide;
	const maxHeight = aspectRatioValue >= 1 ? shortSide : longSide;

	const fitted = fitAspectRatioWithinBounds(maxWidth, maxHeight, aspectRatioValue);
	return capExportCanvasDimensions(fitted.width, fitted.height);
}

export function calculateMp4ExportDimensions(
	baseWidth: number,
	baseHeight: number,
	quality: ExportQuality,
): { width: number; height: number } {
	if (quality === "source") {
		return {
			width: normalizeEvenDimension(baseWidth),
			height: normalizeEvenDimension(baseHeight),
		};
	}

	const qualityScale = quality === "medium" ? 0.6 : quality === "good" ? 0.75 : 0.9;
	return {
		width: normalizeEvenDimension(baseWidth * qualityScale),
		height: normalizeEvenDimension(baseHeight * qualityScale),
	};
}
