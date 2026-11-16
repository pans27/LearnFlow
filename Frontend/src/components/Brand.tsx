import { useId } from "react";
/** Vector mark stays crisp in the sidebar and on the sign-in card. */
export function Brand() {
  const id = useId().replace(/:/g, "");
  return (
    <span className="brand-lockup">
      <svg className="flow-mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <radialGradient id={id + "orb"} cx="30%" cy="20%" r="85%">
            <stop stopColor="#ffc7f0" />
            <stop offset=".36" stopColor="#df55e9" />
            <stop offset=".72" stopColor="#8354ed" />
            <stop offset="1" stopColor="#4f46cf" />
          </radialGradient>
          <linearGradient id={id + "flow"} x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#7860ff" />
            <stop offset=".5" stopColor="#fb70d3" />
            <stop offset="1" stopColor="#58d4ff" />
          </linearGradient>
        </defs>
        <path
          d="M8 39C-1 25 37 9 54 19"
          fill="none"
          stroke={"url(#" + id + "flow)"}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="32" cy="31" r="21" fill={"url(#" + id + "orb)"} />
        <ellipse
          cx="26"
          cy="20"
          rx="10"
          ry="5"
          fill="white"
          opacity=".28"
          transform="rotate(-28 26 20)"
        />
        <path
          d="M7 38C17 52 61 30 57 21"
          fill="none"
          stroke={"url(#" + id + "flow)"}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M14 48C27 54 51 44 57 33"
          fill="none"
          stroke="#aa8aff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="56" cy="20" r="3" fill="#7ddaff" />
      </svg>
      <span>
        Learn<span className="brand-flow">Flow</span>
      </span>
    </span>
  );
}
