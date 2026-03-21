import { Check, X } from "@tamagui/lucide-icons";
import { Directory, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  Button,
  H4,
  Label,
  ListItem,
  Separator,
  SizableText,
  Stack,
  XStack,
  YGroup,
  YStack,
} from "tamagui";

import { Screen } from "#/components/Screen";
import { Switch } from "#/components/ui/Switch";
import { storage } from "#/utils/storage";

const SETTINGS_KEY = "video_settings";
const LAST_CACHE_CLEAR_KEY = "last_cache_clear";

type Settings = {
  wifiOnlyVideo: boolean;
  autoClearCache: boolean;
  dataSaver: boolean;
  autoClearDays: number; // Clear cache every N days
  autoClearThresholdMB: number; // Clear if cache exceeds this size
};

const SettingsManager = {
  getSettings(): Settings {
    try {
      const value = storage.getString(SETTINGS_KEY);
      return value
        ? JSON.parse(value)
        : {
            wifiOnlyVideo: false,
            autoClearCache: false,
            dataSaver: false,
            autoClearDays: 7,
            autoClearThresholdMB: 100,
          };
    } catch (e) {
      console.error("Error reading settings:", e);
      return {
        wifiOnlyVideo: false,
        autoClearCache: false,
        dataSaver: false,
        autoClearDays: 7,
        autoClearThresholdMB: 100,
      };
    }
  },

  updateSetting(key: keyof Settings, value: boolean | number): void {
    try {
      const current = this.getSettings();
      const updated = { ...current, [key]: value };
      storage.set(SETTINGS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving settings:", e);
    }
  },

  getLastCacheClear(): number {
    try {
      const value = storage.getNumber(LAST_CACHE_CLEAR_KEY);
      return value ?? 0;
    } catch (e) {
      return 0;
    }
  },

  setLastCacheClear(): void {
    try {
      storage.set(LAST_CACHE_CLEAR_KEY, Date.now());
    } catch (e) {
      console.error("Error saving last cache clear:", e);
    }
  },
};

// Cache Manager with new expo-file-system API
const CacheManager = {
  getCacheSize() {
    try {
      const cacheDir = new Directory(Paths.cache);

      // Check if directory exists
      if (!cacheDir.exists) {
        return 0;
      }

      const files = cacheDir.list();
      let totalSize = 0;

      for (const item of files) {
        if (item.exists && item instanceof File) {
          totalSize += item.size ?? 0;
        }
      }

      return totalSize;
    } catch (e) {
      console.error("Error getting cache size:", e);
      return 0;
    }
  },

  clearCache() {
    try {
      const cacheDir = new Directory(Paths.cache);

      if (!cacheDir.exists) {
        return true;
      }

      const files = cacheDir.list();

      // Delete all files in cache
      for (const item of files) {
        if (item.exists) {
          item.delete();
        }
      }

      // Update last clear timestamp
      SettingsManager.setLastCacheClear();

      return true;
    } catch (e) {
      console.error("Error clearing cache:", e);
      return false;
    }
  },

  shouldAutoClearCache() {
    const settings = SettingsManager.getSettings();

    if (!settings.autoClearCache) {
      return false;
    }

    const lastClear = SettingsManager.getLastCacheClear();
    const daysSinceLastClear = (Date.now() - lastClear) / (1000 * 60 * 60 * 24);

    // Check if enough days have passed
    if (daysSinceLastClear >= settings.autoClearDays) {
      return true;
    }

    // Check if cache size exceeds threshold
    const cacheSize = this.getCacheSize();
    const cacheSizeMB = cacheSize / (1024 * 1024);

    if (cacheSizeMB >= settings.autoClearThresholdMB) {
      return true;
    }

    return false;
  },

  performAutoClear() {
    const shouldClear = this.shouldAutoClearCache();

    if (shouldClear) {
      console.log("Auto-clearing cache...");
      this.clearCache();
    }
  },
};

const settingKeyMap = {
  "Video play on WiFi only": "wifiOnlyVideo",
  "Auto clear cache": "autoClearCache",
  "Mobile data internet saving": "dataSaver",
} as const;

const Item = ({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
}) => (
  <YGroup.Item>
    <ListItem>
      <XStack ai="center" gap="$2" w="100%">
        <Stack flex={1}>
          <Label fos="$5" htmlFor={title} lh="$3">
            {title}
          </Label>
          <SizableText color="$gray11" size="$3">
            {description}
          </SizableText>
        </Stack>
        <Switch checked={checked} id={title} onCheckedChange={onToggle}>
          <Switch.Icon placement="left">
            <X color="#fff" />
          </Switch.Icon>
          <Switch.Icon placement="right">
            <Check color="#fff" />
          </Switch.Icon>
          <Switch.Thumb animation="quick" />
        </Switch>
      </XStack>
    </ListItem>
    <Separator />
  </YGroup.Item>
);

export default function DataManager() {
  const [settings, setSettings] = useState<Settings>({
    wifiOnlyVideo: false,
    autoClearCache: false,
    dataSaver: false,
    autoClearDays: 7,
    autoClearThresholdMB: 100,
  });
  const [cacheSize, setCacheSize] = useState(0);
  const [isClearing, setIsClearing] = useState(false);
  const [lastClearDate, setLastClearDate] = useState<Date | null>(null);

  useEffect(() => {
    loadSettings();
    loadCacheInfo();
    checkAutoClear();
  }, []);

  const loadSettings = () => {
    const savedSettings = SettingsManager.getSettings();
    setSettings(savedSettings);
  };

  const loadCacheInfo = () => {
    const size = CacheManager.getCacheSize();
    setCacheSize(size);

    const lastClear = SettingsManager.getLastCacheClear();
    if (lastClear > 0) {
      setLastClearDate(new Date(lastClear));
    }
  };

  const checkAutoClear = () => {
    // Perform auto-clear check when screen loads
    CacheManager.performAutoClear();
    // Reload cache info to reflect any changes
    loadCacheInfo();
  };

  const handleToggle = (title: string, value: boolean) => {
    const settingKey = settingKeyMap[title as keyof typeof settingKeyMap];

    setSettings((prev) => ({ ...prev, [settingKey]: value }));
    SettingsManager.updateSetting(settingKey, value);

    // Show info for specific settings
    if (title === "Video play on WiFi only" && value) {
      Alert.alert(
        "WiFi Only Mode",
        "Videos will only play when connected to WiFi"
      );
    }

    if (title === "Auto clear cache" && value) {
      Alert.alert(
        "Auto Clear Cache",
        `Cache will be automatically cleared every ${settings.autoClearDays} days or when it exceeds ${settings.autoClearThresholdMB}MB`
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      `This will clear ${formatBytes(cacheSize)} of cached data. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setIsClearing(true);
            const success = CacheManager.clearCache();
            setIsClearing(false);

            if (success) {
              loadCacheInfo();
              Alert.alert("Success", "Cache cleared successfully");
            } else {
              Alert.alert("Error", "Failed to clear cache");
            }
          },
        },
      ]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (date: Date | null): string => {
    if (!date) {
      return "Never";
    }
    return date.toLocaleDateString();
  };

  const notificationOptions = [
    {
      title: "Video play on WiFi only",
      description: "Only play videos when connected to WiFi",
      checked: settings.wifiOnlyVideo,
    },
    {
      title: "Auto clear cache",
      description: `Clear cache every ${settings.autoClearDays} days or when > ${settings.autoClearThresholdMB}MB`,
      checked: settings.autoClearCache,
    },
    {
      title: "Mobile data internet saving",
      description: "Reduce data usage on mobile networks",
      checked: settings.dataSaver,
    },
  ];

  return (
    <Screen>
      <YStack gap="$4">
        <YGroup alignSelf="center" size="$4" w="100%">
          {notificationOptions.map((option) => (
            <Item
              checked={option.checked}
              description={option.description}
              key={option.title}
              onToggle={(value) => handleToggle(option.title, value)}
              title={option.title}
            />
          ))}
        </YGroup>

        <YStack
          bg="$background"
          borderColor="$borderColor"
          borderWidth={1}
          br="$4"
          gap="$3"
          mx="$4"
          p="$4"
        >
          <H4>Storage</H4>

          <XStack ai="center" jc="space-between">
            <SizableText color="$gray11" size="$4">
              Cache Size
            </SizableText>
            <SizableText fontWeight="600" size="$4">
              {formatBytes(cacheSize)}
            </SizableText>
          </XStack>

          <XStack ai="center" jc="space-between">
            <SizableText color="$gray11" size="$4">
              Last Cleared
            </SizableText>
            <SizableText fontWeight="600" size="$4">
              {formatDate(lastClearDate)}
            </SizableText>
          </XStack>

          <Button
            disabled={isClearing || cacheSize === 0}
            onPress={handleClearCache}
            opacity={cacheSize === 0 ? 0.5 : 1}
          >
            {isClearing ? "Clearing..." : "Clear Cache Now"}
          </Button>
        </YStack>
      </YStack>
    </Screen>
  );
}
