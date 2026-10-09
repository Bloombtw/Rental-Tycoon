import {
  forwardRef,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon, type IconName, type IconSize } from "./icons.js";

export type ButtonVariant = "primary" | "money" | "danger" | "danger-quiet" | "secondary" | "glass";
export type ButtonSize = "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Defaults to "primary". */
  readonly variant?: ButtonVariant;
  /** Defaults to "md". "icon" is round and needs an aria-label. */
  readonly size?: ButtonSize;
  /** Icon shown before the text. */
  readonly icon?: IconName;
}

const ICON_SIZE: Readonly<Record<ButtonSize, IconSize>> = { md: 20, lg: 24, icon: 24 };

function setPressed(el: HTMLButtonElement, pressed: boolean): void {
  if (pressed && !el.disabled) el.dataset["pressed"] = "true";
  else delete el.dataset["pressed"];
}

/**
 * The game's button: relief, press-down and spring-back. `data-pressed` is set on pointerdown
 * because iOS Safari does not apply :active without a touch listener. `.btn` stays on the element.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    className,
    type = "button",
    children,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onBlur,
    ...rest
  },
  ref,
) {
  const classes = ["btn", `btn-${variant}`, `btn-${size}`];
  if (className) classes.push(className);
  const hasText = children !== undefined && children !== null && children !== false;
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes.join(" ")}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPressed(e.currentTarget, true);
        onPointerDown?.(e);
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPressed(e.currentTarget, false);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPressed(e.currentTarget, false);
        onPointerLeave?.(e);
      }}
      onPointerCancel={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPressed(e.currentTarget, false);
        onPointerCancel?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLButtonElement>) => {
        setPressed(e.currentTarget, false);
        onBlur?.(e);
      }}
    >
      {icon !== undefined && <Icon name={icon} size={ICON_SIZE[size]} className="btn-glyph" />}
      {hasText && <span className="btn-label">{children}</span>}
    </button>
  );
});
