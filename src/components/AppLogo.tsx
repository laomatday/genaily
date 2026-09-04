interface AppLogoProps {
  className?: string;
  size?: string;
}

export function AppLogo({ className = "w-10 h-10", size = "w-2/3 h-2/3" }: AppLogoProps) {
  return (
    <div className={`relative flex items-center justify-center rounded-2xl app-primary-bg shadow-sm overflow-hidden ${className}`}>
      <img
        src="/app-logo.svg"
        alt="genAi Family Logo"
        className={`${size} object-contain transition-transform duration-300 hover:scale-105`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
