import { type CSSProperties, type ReactNode } from "react";

type ProductStageProps = {
  /** The illustration's width in app pixels; it scales to fit its container. */
  readonly width: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
};

/**
 * Holds a product illustration at a fixed design width and scales it with
 * the container, like an image: proportions never reflow, text stays crisp.
 */
export function ProductStage({ width, className, style, children }: ProductStageProps) {
  return (
    <div className={["product-stage", className].filter(Boolean).join(" ")} style={style}>
      <div
        className="product-stage__inner app-ui"
        style={{ "--stage-width": width } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
