import React from 'react';

/**
 * A simpler, minimalist logo for Stacky.
 * Represents a clean stack of tasks/cards.
 */
export const Logo: React.FC<React.SVGProps<SVGSVGElement>> = ({ className = "w-8 h-8", ...props }) => {
    return (
        <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            {/* Base Layer */}
            <rect x="8" y="20" width="16" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />

            {/* Middle Layer */}
            <rect x="8" y="14" width="16" height="4" rx="1" fill="currentColor" fillOpacity="0.7" />

            {/* Top Layer */}
            <rect x="8" y="8" width="16" height="4" rx="1" fill="currentColor" />
        </svg>
    );
};

/**
 * Alternative "Offset Stack" variant if a bit more motion is desired.
 */
export const LogoOffset: React.FC<React.SVGProps<SVGSVGElement>> = ({ className = "w-8 h-8", ...props }) => {
    return (
        <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            {/* Bottom */}
            <rect x="10" y="21" width="14" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />

            {/* Middle */}
            <rect x="6" y="14" width="16" height="4" rx="1" fill="currentColor" fillOpacity="0.7" />

            {/* Top */}
            <rect x="9" y="7" width="14" height="4" rx="1" fill="currentColor" />
        </svg>
    );
};
