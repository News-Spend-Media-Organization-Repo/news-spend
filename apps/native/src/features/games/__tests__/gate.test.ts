import { ageOn, gateFor } from "../gate";

const NOW = new Date(2026, 9, 3, 12); // 3 October 2026, local noon
const ns = "prism-match-3d";
const signedIn = { isSignedIn: true, isGuest: false };

describe("ageOn", () => {
  it("counts whole years, and the birthday itself", () => {
    expect(ageOn("2010-10-03T00:00:00.000Z", NOW)).toBe(16);
    expect(ageOn("2010-10-04T00:00:00.000Z", NOW)).toBe(15);
    expect(ageOn("2000-01-01T00:00:00.000Z", NOW)).toBe(26);
  });

  it("returns null for something that is not a date", () => {
    expect(ageOn("not a date", NOW)).toBeNull();
  });
});

describe("gateFor", () => {
  it("refuses a game that is not on the list", () => {
    expect(
      gateFor({
        namespace: "nope",
        ...signedIn,
        me: { dateOfBirth: "1990-01-01" },
        now: NOW,
      })
    ).toBe("unknown-game");
    expect(
      gateFor({ namespace: undefined, ...signedIn, me: undefined, now: NOW })
    ).toBe("unknown-game");
  });

  it("asks guests and signed-out visitors to sign in", () => {
    expect(
      gateFor({
        namespace: ns,
        isSignedIn: false,
        isGuest: false,
        me: undefined,
        now: NOW,
      })
    ).toBe("sign-in");
    expect(
      gateFor({
        namespace: ns,
        isSignedIn: true,
        isGuest: true,
        me: undefined,
        now: NOW,
      })
    ).toBe("sign-in");
  });

  it("waits while the account loads", () => {
    expect(
      gateFor({ namespace: ns, ...signedIn, me: undefined, now: NOW })
    ).toBe("loading");
  });

  it("asks for a date of birth when there is none", () => {
    expect(gateFor({ namespace: ns, ...signedIn, me: {}, now: NOW })).toBe(
      "need-birth-date"
    );
    expect(
      gateFor({
        namespace: ns,
        ...signedIn,
        me: { dateOfBirth: null },
        now: NOW,
      })
    ).toBe("need-birth-date");
    expect(gateFor({ namespace: ns, ...signedIn, me: null, now: NOW })).toBe(
      "need-birth-date"
    );
  });

  it("blocks under 16 and allows 16 and over", () => {
    expect(
      gateFor({
        namespace: ns,
        ...signedIn,
        me: { dateOfBirth: "2010-10-04T00:00:00.000Z" },
        now: NOW,
      })
    ).toBe("too-young");
    expect(
      gateFor({
        namespace: ns,
        ...signedIn,
        me: { dateOfBirth: "2010-10-03T00:00:00.000Z" },
        now: NOW,
      })
    ).toBe("ok");
  });
});
