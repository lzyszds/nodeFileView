import type { ImgHTMLAttributes } from "react";

export interface FilePreviewLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
}

export function FilePreviewLogo({
  size = 28,
  className = "",
  alt = "文件预览 Logo",
  style,
  ...props
}: FilePreviewLogoProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <img
      src="/favicon.png"
      alt={alt}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      style={{
        width: dimension,
        height: dimension,
        objectFit: "contain",
        ...style,
      }}
      className={`rounded-lg select-none shrink-0 ${className}`}
      {...props}
    />
  );
}

export default FilePreviewLogo;
