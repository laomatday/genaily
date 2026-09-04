import { useState } from 'react';
import { BRAND_ASSETS, BRAND_LOGO_URL } from '../config/brandAssets';

interface AppLogoProps {
  className?: string;
}

export function AppLogo({ className = 'w-10 h-10' }: AppLogoProps) {
  const [useLocalLogo, setUseLocalLogo] = useState(
    BRAND_LOGO_URL === BRAND_ASSETS.localLogoUrl,
  );
  const logoUrl = useLocalLogo ? BRAND_ASSETS.localLogoUrl : BRAND_LOGO_URL;

  return (
    <div className={`app-logo-frame ${className}`}>
      <img
        src={logoUrl}
        alt="Logo genAi Family"
        className="app-logo-image"
        referrerPolicy="no-referrer"
        onError={useLocalLogo ? undefined : () => setUseLocalLogo(true)}
      />
    </div>
  );
}
