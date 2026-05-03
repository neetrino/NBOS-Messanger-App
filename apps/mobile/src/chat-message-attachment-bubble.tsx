import type { MessageAttachmentDto } from "@app-messenger/shared";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { formatFileSize } from "./chat-attachment-mobile";
import { ChatImagePreviewModal } from "./chat-image-preview-modal";

type Props = {
  attachment: MessageAttachmentDto;
  apiBase: string;
  token: string;
  mine: boolean;
};

export function ChatMessageAttachmentBubble(props: Props): ReactElement {
  const { attachment: att, apiBase, token, mine } = props;
  const { width: winW, height: winH } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);

  const imageSource = useMemo(() => {
    if (att.kind !== "image") {
      return undefined;
    }
    return {
      uri: `${apiBase}/files/${encodeURIComponent(att.fileId)}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }, [apiBase, att.fileId, att.kind, token]);

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      const safeName = att.originalName.replace(/[/\\]/g, "_").slice(0, 120);
      const base = FileSystem.cacheDirectory ?? "";
      const dest = `${base}dl-${att.fileId}-${safeName}`;
      const dr = FileSystem.createDownloadResumable(
        `${apiBase}/files/${encodeURIComponent(att.fileId)}`,
        dest,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const r = await dr.downloadAsync();
      if (!r?.uri) {
        throw new Error("no file");
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(r.uri);
      } else {
        Alert.alert("Download", "Saved to app cache. Sharing is not available on this device.");
      }
    } catch {
      Alert.alert("Download", "Could not download the file.");
    } finally {
      setBusy(false);
    }
  }, [apiBase, att.fileId, att.originalName, token]);

  if (att.kind === "image" && imageSource) {
    return (
      <>
        <View style={{ marginTop: 4, alignSelf: "flex-start", maxWidth: "100%" }}>
          <Pressable
            onPress={() => setImageLightboxOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View full size"
          >
            <Image
              source={imageSource}
              style={{
                width: 260,
                maxWidth: "100%",
                height: 170,
                borderRadius: 8,
              }}
              resizeMode="cover"
            />
          </Pressable>
        </View>
        <ChatImagePreviewModal
          visible={imageLightboxOpen}
          onRequestClose={() => setImageLightboxOpen(false)}
          imageSource={imageSource}
          winW={winW}
          winH={winH}
        />
      </>
    );
  }

  return (
    <View
      style={{
        marginTop: 6,
        maxWidth: 240,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: mine ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.22)",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: mine ? "#fff" : "#e4ecf5",
        }}
        numberOfLines={2}
      >
        {att.originalName}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 11,
          color: mine ? "rgba(255,255,255,0.75)" : "#8eb4e0",
        }}
      >
        {formatFileSize(att.size)}
        {att.kind === "video" ? " · Video" : ""}
      </Text>
      <Pressable
        onPress={() => void onDownload()}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: 8,
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: pressed ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.1)",
          opacity: busy ? 0.5 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color={mine ? "#fff" : "#e4ecf5"} size="small" />
        ) : (
          <Text style={{ fontSize: 12, color: mine ? "#fff" : "#e4ecf5" }}>Download</Text>
        )}
      </Pressable>
    </View>
  );
}
