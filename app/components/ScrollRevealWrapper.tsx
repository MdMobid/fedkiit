"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollRevealWrapperProps {
  children: React.ReactNode;
  instant?: boolean;
}

export default function ScrollRevealWrapper({ children, instant = false }: ScrollRevealWrapperProps) {
  const domRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(instant);

  useEffect(() => {
    if (instant) return;

    const current = domRef.current;
    if (!current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.02,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    observer.observe(current);

    return () => {
      observer.disconnect();
    };
  }, [instant]);

  return (
    <div
      ref={domRef}
      className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-8 scale-[0.98]"
      }`}
    >
      {children}
    </div>
  );
}
