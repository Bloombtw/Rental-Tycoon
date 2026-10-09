import type { JSX } from "react";
import { Icon, type IconName } from "./icons.js";

interface PanelHeaderProps {
  readonly icon: IconName;
  readonly tone: "primary" | "money" | "neutral";
  readonly id: string;
  readonly title: string;
}

/** Card header: a coloured rounded square with an icon, then the title. */
export function PanelHeader({ icon, tone, id, title }: PanelHeaderProps): JSX.Element {
  return (
    <header className="panel-head">
      <span className="panel-badge" data-tone={tone}>
        <Icon name={icon} size={20} />
      </span>
      <h2 id={id}>{title}</h2>
    </header>
  );
}
