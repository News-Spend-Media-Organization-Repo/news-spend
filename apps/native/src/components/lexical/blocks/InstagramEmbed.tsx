import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";

function extractPostId(input: string): string | undefined {
  if (!input) {
    return;
  }

  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("instagram.com")) {
      const pathParts = url.pathname.split("/").filter(Boolean);

      const postIndex = pathParts.indexOf("p");
      if (postIndex !== -1 && pathParts[postIndex + 1]) {
        return `p/${pathParts[postIndex + 1]}`;
      }

      const reelIndex = pathParts.indexOf("reel");
      if (reelIndex !== -1 && pathParts[reelIndex + 1]) {
        return `reel/${pathParts[reelIndex + 1]}`;
      }

      const tvIndex = pathParts.indexOf("tv");
      if (tvIndex !== -1 && pathParts[tvIndex + 1]) {
        return `tv/${pathParts[tvIndex + 1]}`;
      }
    }
  } catch {
    // Invalid URL
  }

  return;
}

export function InstagramEmbed({
  postUrl,
  caption,
}: {
  postUrl: string;
  caption?: string;
}) {
  const [webViewHeight, setWebViewHeight] = useState(480);

  const postId = extractPostId(postUrl);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { background-color: transparent; }
          .instagram-container {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          iframe {
            border: none;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="instagram-container">
          <iframe
            src="https://www.instagram.com/${postId}/embed"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
        <script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              var height = document.body.scrollHeight || 480;
              window.ReactNativeWebView.postMessage(height.toString());
            }, 1000);
          });
        </script>
      </body>
    </html>
  `;

  if (!postId) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.webviewContainer,
          { height: (webViewHeight ?? 480) + 25 },
        ]}
      >
        <WebView
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
    height: 480,
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
