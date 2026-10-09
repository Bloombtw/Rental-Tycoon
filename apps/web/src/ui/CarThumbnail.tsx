import { useState, type JSX } from "react";
import { CarIllustration } from "./icons.js";
import { useCarThumbnail } from "./thumbnailStore.js";

interface CarThumbnailProps {
  /** A car model id; anything unknown shows the neutral illustration. */
  readonly model: unknown;
  readonly size: "sm" | "md";
  /** Accessible description of the picture. */
  readonly alt: string;
}

/**
 * The 3D thumbnail of a car model. The drawn illustration is always underneath: it shows while the
 * scene loads, without WebGL, when rendering fails or when the image cannot be decoded, and it
 * cross-fades to the 3D picture when that arrives. Never a broken image, never an empty frame.
 */
export function CarThumbnail({ model, size, alt }: CarThumbnailProps): JSX.Element {
  const { src, key } = useCarThumbnail(model);
  // A source that fails to decode is remembered, so a retry cannot flash a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src !== null && failed !== src;
  return (
    <span
      className="car-thumb"
      data-size={size}
      data-state={showImage ? "image" : "illustration"}
      role="img"
      aria-label={alt}
    >
      <CarIllustration tint={key} className="car-thumb-illu" />
      {showImage && (
        <img
          className="car-thumb-img"
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            setFailed(src);
          }}
        />
      )}
    </span>
  );
}
