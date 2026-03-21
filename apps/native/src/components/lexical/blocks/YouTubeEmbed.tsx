import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";

function extractVideoId(input: string): string | undefined {
  if (!input) {
    return;
  }

  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);

    if (
      url.hostname.includes("youtube.com") ||
      url.hostname.includes("youtu.be")
    ) {
      if (url.hostname.includes("youtu.be")) {
        return url.pathname.slice(1);
      }

      return url.searchParams.get("v") || url.searchParams.get("video_id");
    }
  } catch {
    // Invalid URL
  }

  return;
}

export function YouTubeEmbed({
  videoUrl,
  caption,
}: {
  videoUrl: string;
  caption?: string;
}) {
  const [webViewHeight, setWebViewHeight] = useState(200);

  const videoId = extractVideoId(videoUrl);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { background-color: transparent; }
          .video-container {
            position: relative;
            width: 100%;
            padding-bottom: 56.25%;
          }
          .video-container iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <div class="video-container">
          <iframe
            src="https://www.youtube.com/embed/${videoId}?rel=0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
        <script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              var height = document.body.scrollHeight;
              window.ReactNativeWebView.postMessage(height.toString());
            }, 500);
          });
        </script>
      </body>
    </html>
  `;

  if (!videoId) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.webviewContainer,
          { height: (webViewHeight ?? 200) + 25 },
        ]}
      >
        <WebView
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={(event) => {
            const height = Number.parseInt(event.nativeEvent.data, 10);
            if (height > 0) {
              setWebViewHeight(height);
            }
          }}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="small" />
            </View>
          )}
          scrollEnabled={false}
          source={{ html: htmlContent }}
          startInLoadingState={true}
          style={styles.webview}
        />
      </View>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginVertical: 12,
  },
  webviewContainer: {
    width: "100%",
  },
  webview: {
    backgroundColor: "transparent",
  },
  loading: {
    height: 200,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
