import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  decimalSeparator?: "," | ".";
  duration?: number;
  compact?: "none" | "thousand" | "million" | "billion";
};

export function AnimatedNumber({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  decimalSeparator = ",",
  duration = 1000,
  compact = "none",
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const animated = useRef(false);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let animationFrame = 0;
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (startTime === null) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(target * eased);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const start = () => {
      if (animated.current) return;
      animated.current = true;
      animationFrame = window.requestAnimationFrame(animate);
    };

    if (!("IntersectionObserver" in window)) {
      start();
      return () => window.cancelAnimationFrame(animationFrame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [duration, target]);

  return <span ref={ref}>{formatValue(value, { prefix, suffix, decimals, decimalSeparator, compact })}</span>;
}

function formatValue(
  value: number,
  {
    prefix,
    suffix,
    decimals,
    decimalSeparator,
    compact,
  }: Required<Pick<AnimatedNumberProps, "prefix" | "suffix" | "decimals" | "decimalSeparator" | "compact">>,
) {
  if (compact === "billion") {
    return `${prefix}${(value / 1_000_000_000).toFixed(decimals).replace(".", decimalSeparator)}B${suffix}`;
  }

  if (compact === "million") {
    return `${prefix}${(value / 1_000_000).toFixed(decimals).replace(".", decimalSeparator)}M${suffix}`;
  }

  if (compact === "thousand") {
    return `${prefix}${Math.round(value / 1000)}k${suffix}`;
  }

  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(value)
    .replace(",", decimalSeparator);

  return `${prefix}${formatted}${suffix}`;
}
