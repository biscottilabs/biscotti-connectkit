import React from 'react';

/**
 * Circle's mark, drawn as concentric arcs so it inherits `currentColor` and
 * works on both light and dark modal themes without a second asset.
 */
export const CircleLogo = ({ ...props }) => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="14" cy="14" r="14" fill="#0E9DE5" />
    <path
      d="M14 5.5a8.5 8.5 0 1 0 0 17"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <path
      d="M14 9.5a4.5 4.5 0 1 1 0 9"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);

export const GoogleLogo = ({ ...props }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M19.6 10.23c0-.68-.06-1.36-.18-2.02H10v3.82h5.4a4.62 4.62 0 0 1-2 3.04v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.34Z"
      fill="#4285F4"
    />
    <path
      d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.06.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H1.06v2.58A10 10 0 0 0 10 20Z"
      fill="#34A853"
    />
    <path
      d="M4.4 11.9a6 6 0 0 1 0-3.83V5.5H1.06a10 10 0 0 0 0 8.98L4.4 11.9Z"
      fill="#FBBC05"
    />
    <path
      d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.06 5.5L4.4 8.08C5.19 5.72 7.4 3.96 10 3.96Z"
      fill="#EA4335"
    />
  </svg>
);

export const MailIcon = ({ ...props }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="2"
      y="4"
      width="16"
      height="12"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="m2.8 5.5 6.3 4.7a1.5 1.5 0 0 0 1.8 0l6.3-4.7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const PinIcon = ({ ...props }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3"
      y="8.5"
      width="14"
      height="9"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M6.5 8.5V6a3.5 3.5 0 1 1 7 0v2.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export default CircleLogo;
