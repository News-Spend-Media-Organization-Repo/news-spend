import { handOffShare } from "../handOffShare";

describe("handOffShare", () => {
  it("counts a share when the target opened, even though the library reports success as false", async () => {
    // What react-native-share hands back on iOS for WhatsApp, Messenger,
    // Twitter and Facebook: the wrapper reads `.success` off an array.
    const onShare = jest.fn();

    await handOffShare(
      () => Promise.resolve({ success: false }),
      "whatsapp",
      onShare
    );

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledWith("whatsapp");
  });

  it("counts a share when the native side answered with an array", async () => {
    const onShare = jest.fn();

    await handOffShare(() => Promise.resolve([true, ""]), "messenger", onShare);

    expect(onShare).toHaveBeenCalledWith("messenger");
  });

  it("does not count a share that threw (target not installed, or dismissed)", async () => {
    const onShare = jest.fn();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      handOffShare(
        () => Promise.reject(new Error("not installed")),
        "twitter",
        onShare
      )
    ).resolves.toBeUndefined();

    expect(onShare).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("is fine without a listener", async () => {
    await expect(
      handOffShare(() => Promise.resolve({ success: true }), "facebook")
    ).resolves.toBeUndefined();
  });
});
