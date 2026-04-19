import styles from "./home-page.module.css";

type BdLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  title?: string;
};

export function BdLogo({ className, size = "md", title = "BD" }: BdLogoProps) {
  const sizeClass =
    size === "sm" ? styles.bdLogoSm : size === "lg" ? styles.bdLogoLg : styles.bdLogoMd;
  return (
    <span
      className={[styles.bdLogo, sizeClass, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={title}
    >
      BD
    </span>
  );
}
