import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function Button({
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`nf-button${className ? ` ${className}` : ""}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
