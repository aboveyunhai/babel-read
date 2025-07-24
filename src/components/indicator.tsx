import { twMerge } from "tailwind-merge";

// fwiw missing forward ref it's not true ButtonProps
type ButtonProps = React.DetailedHTMLProps<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
>;

export const Button = ({ className, ...restProps }: ButtonProps) => {
  return (
    <button
      className={twMerge(
        "px-2 py-1 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent border rounded flex justify-center items-center text-sm disabled:cursor-not-allowed",
        className
      )}
      {...restProps}
    />
  );
};

type IndicatorProps = ButtonProps & {
  status: "on" | "off";
};

export const Indicator = ({
  onClick,
  status,
  children,
  ...restProps
}: IndicatorProps) => {
  return (
    <Button onClick={onClick} {...restProps}>
      {children}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className={twMerge(
          "inline-block ml-1",
          status === "on" ? "text-green-400" : "text-red-400"
        )}
      >
        <circle cx="8" cy="8" r="4" fill="currentColor" />
      </svg>
    </Button>
  );
};
