import { useEffect, useState } from 'react';

interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

export interface BatteryStatus {
  supported: boolean;
  level: number | null;
  charging: boolean;
}

export function useBatteryStatus(): BatteryStatus {
  const [status, setStatus] = useState<BatteryStatus>({
    supported: false,
    level: null,
    charging: false,
  });

  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBattery) : null;
    if (!nav || typeof nav.getBattery !== 'function') {
      return;
    }

    let cancelled = false;
    let batteryRef: BatteryManager | null = null;

    const sync = (battery: BatteryManager) => {
      if (cancelled) return;
      const pct = Math.max(0, Math.min(100, Math.round(battery.level * 100)));
      setStatus({
        supported: true,
        level: pct,
        charging: battery.charging,
      });
    };

    const handleChange = () => {
      if (batteryRef) sync(batteryRef);
    };

    nav
      .getBattery()
      .then((battery) => {
        if (cancelled) return;
        batteryRef = battery;
        sync(battery);
        battery.addEventListener('levelchange', handleChange);
        battery.addEventListener('chargingchange', handleChange);
      })
      .catch(() => {
        // Gracefully remain unsupported if blocked by browser policy
      });

    return () => {
      cancelled = true;
      if (batteryRef) {
        batteryRef.removeEventListener('levelchange', handleChange);
        batteryRef.removeEventListener('chargingchange', handleChange);
      }
    };
  }, []);

  return status;
}
