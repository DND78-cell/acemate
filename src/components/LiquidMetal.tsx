import React, { memo, forwardRef, useEffect, useState } from "react";
import { LiquidMetal as LiquidMetalShader } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

// ============================================================================
// LiquidMetal - Base shader wrapper component
// ============================================================================

export interface LiquidMetalProps {
    /** Base background color of the liquid metal */
    colorBack?: string;
    /** Tint/highlight color for the chrome effect */
    colorTint?: string;
    /** Animation speed (0.1 - 2.0 recommended) */
    speed?: number;
    /** Pattern complexity/repetition (1 - 10) */
    repetition?: number;
    /** Wave distortion amount (0 - 1) */
    distortion?: number;
    /** Texture scale */
    scale?: number;
    /** Additional CSS classes */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
}

export const LiquidMetal = memo(function LiquidMetal({
    colorBack = "#aaaaac",
    colorTint = "#ffffff",
    speed = 0.5,
    repetition = 4,
    distortion = 0.1,
    scale = 1,
    className,
    style,
}: LiquidMetalProps) {
    return (
        <div
            className={cn("absolute inset-0 z-0 overflow-hidden", className)}
            style={style}
        >
            <LiquidMetalShader
                colorBack={colorBack}
                colorTint={colorTint}
                speed={speed}
                repetition={repetition}
                distortion={distortion}
                softness={0}
                shiftRed={0.3}
                shiftBlue={-0.3}
                angle={45}
                shape="none"
                scale={scale}
                fit="cover"
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
});

LiquidMetal.displayName = "LiquidMetal";

// ============================================================================
// LiquidMetalButton - Premium button with liquid metal border effect
// ============================================================================

export interface LiquidMetalButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Button content */
    children: React.ReactNode;
    /** Optional icon displayed on the left */
    icon?: React.ReactNode;
    /** Border width in pixels */
    borderWidth?: number;
    /** Configuration for the LiquidMetal shader */
    metalConfig?: Omit<LiquidMetalProps, "className" | "style">;
    /** Size variant */
    size?: "sm" | "md" | "lg";
}

export const LiquidMetalButton = forwardRef<
    HTMLButtonElement,
    LiquidMetalButtonProps
>(
    (
        {
            children,
            icon,
            borderWidth = 4,
            metalConfig,
            size = "md",
            className,
            disabled,
            ...props
        },
        ref
    ) => {
        const sizeStyles = {
            sm: "py-2 pl-2 pr-6 gap-3 text-sm",
            md: "py-3 pl-3 pr-8 gap-4 text-base",
            lg: "py-4 pl-4 pr-10 gap-6 text-lg",
        };

        const iconSizes = {
            sm: "w-8 h-8",
            md: "w-10 h-10",
            lg: "w-12 h-12",
        };

        return (
            <button
                ref={ref}
                disabled={disabled}
                className={cn(
                    "relative group cursor-pointer border-none bg-transparent p-0 outline-none transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
                    className
                )}
                {...props}
            >
                <div
                    className="relative rounded-full overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]"
                    style={{ padding: borderWidth }}
                >
                    {/* Liquid Metal Border Layer */}
                    <LiquidMetal
                        colorBack={metalConfig?.colorBack ?? "#888888"}
                        colorTint={metalConfig?.colorTint ?? "#ffffff"}
                        speed={metalConfig?.speed ?? 0.4}
                        repetition={metalConfig?.repetition ?? 4}
                        distortion={metalConfig?.distortion ?? 0.15}
                        scale={metalConfig?.scale ?? 1}
                        className="absolute inset-0 z-0 rounded-full"
                    />

                    {/* Inner Button Body */}
                    <div
                        className={cn(
                            "relative z-10 rounded-full flex items-center",
                            "bg-[var(--metal-inner)]",
                            "transition-colors duration-200",
                            "group-hover:bg-[var(--metal-inner-hover)]",
                            sizeStyles[size]
                        )}
                    >
                        {icon && (
                            <div
                                className={cn(
                                    "rounded-full flex items-center justify-center",
                                    "bg-[var(--surface-hover)]",
                                    "shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]",
                                    iconSizes[size]
                                )}
                            >
                                <span className="text-[var(--fg-muted)]">
                                    {icon}
                                </span>
                            </div>
                        )}
                        <span className="font-medium tracking-tight text-[var(--metal-icon)]">
                            {children}
                        </span>
                    </div>
                </div>
            </button>
        );
    }
);

LiquidMetalButton.displayName = "LiquidMetalButton";

export default LiquidMetalButton;

// ============================================================================
// Interactive metal: the flow speeds up and brightens under the pointer and
// surges while pressed.
// ============================================================================

export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() => {
        try {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch {
            return false;
        }
    });
    useEffect(() => {
        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);
    return reduced;
}

type Energy = { rest: number; hover: number; press: number };

/**
 * Pointer state → shader speed and brightness. Spread `handlers` on the
 * element that should react.
 */
export function useMetalEnergy(
    energy: Energy,
    { disabled = false, boosted = false }: { disabled?: boolean; boosted?: boolean } = {}
) {
    const reduced = usePrefersReducedMotion();
    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);

    useEffect(() => {
        if (disabled) {
            setHover(false);
            setPressed(false);
        }
    }, [disabled]);

    const level = pressed ? "press" : hover || boosted ? "hover" : "rest";
    const speed = disabled || reduced ? 0 : energy[level];
    const colorBack = level === "press" ? "#b4b4b6" : level === "hover" ? "#9e9ea0" : "#888888";

    const handlers = {
        onPointerEnter: () => setHover(true),
        onPointerLeave: () => {
            setHover(false);
            setPressed(false);
        },
        onPointerDown: () => setPressed(true),
        onPointerUp: () => setPressed(false),
        onPointerCancel: () => setPressed(false),
        onFocus: () => setHover(true),
        onBlur: () => setHover(false),
    };

    return { speed, colorBack, level, handlers };
}

// ============================================================================
// LiquidMetalIconButton - round icon-only variant (the composer's Send/Stop)
// ============================================================================

export interface LiquidMetalIconButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** The icon inside the metal ring */
    children: React.ReactNode;
    /** Outer diameter in pixels */
    diameter?: number;
    /** Metal ring width in pixels */
    borderWidth?: number;
    /** Keep the metal flowing fast, e.g. while an answer is being written */
    boosted?: boolean;
    /** Configuration for the LiquidMetal shader */
    metalConfig?: Omit<LiquidMetalProps, "className" | "style">;
}

export const LiquidMetalIconButton = forwardRef<
    HTMLButtonElement,
    LiquidMetalIconButtonProps
>(
    (
        {
            children,
            diameter = 36,
            borderWidth = 4,
            boosted = false,
            metalConfig,
            className,
            disabled,
            ...props
        },
        ref
    ) => {
        const metal = useMetalEnergy(
            { rest: metalConfig?.speed ?? 0.4, hover: 1, press: 2.2 },
            { disabled, boosted }
        );

        return (
            <button
                ref={ref}
                disabled={disabled}
                className={cn(
                    "relative group shrink-0 cursor-pointer rounded-full border-none bg-transparent p-0 transition-[transform,opacity] duration-200 hover:scale-[1.06] active:scale-[0.92] aria-disabled:opacity-60 aria-disabled:hover:opacity-90 aria-disabled:cursor-default disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none",
                    className
                )}
                style={{ width: diameter, height: diameter }}
                {...metal.handlers}
                {...props}
            >
                <span
                    className={cn(
                        "relative block h-full w-full overflow-hidden rounded-full transition-shadow duration-300",
                        metal.level === "rest"
                            ? "shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)]"
                            : "shadow-[0_0_14px_-2px_rgba(255,255,255,0.35),0_6px_18px_-6px_rgba(0,0,0,0.5)]"
                    )}
                    style={{ padding: borderWidth }}
                >
                    <LiquidMetal
                        colorBack={metalConfig?.colorBack ?? metal.colorBack}
                        colorTint={metalConfig?.colorTint ?? "#ffffff"}
                        speed={metal.speed}
                        repetition={metalConfig?.repetition ?? 4}
                        distortion={metalConfig?.distortion ?? 0.15}
                        scale={metalConfig?.scale ?? 1}
                        className="absolute inset-0 z-0 rounded-full"
                    />
                    <span
                        className={cn(
                            "relative z-10 flex h-full w-full items-center justify-center rounded-full",
                            "bg-[var(--metal-inner)] text-[var(--metal-icon)]",
                            "transition-colors duration-200 group-hover:bg-[var(--metal-inner-hover)]"
                        )}
                    >
                        {children}
                    </span>
                </span>
            </button>
        );
    }
);

LiquidMetalIconButton.displayName = "LiquidMetalIconButton";
