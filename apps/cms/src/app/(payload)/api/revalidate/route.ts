import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Compare the caller's secret without leaking, through response timing, how
 * many leading characters matched. Hashing first gives both sides the same
 * length, which `timingSafeEqual` requires.
 */
function secretMatches(given: string | null): boolean {
  const expected = process.env.NEXT_PRIVATE_REVALIDATION_KEY;
  if (!(given && expected)) {
    return false;
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const collection = request.nextUrl.searchParams.get("collection");
  const slug = request.nextUrl.searchParams.get("slug");
  const secret = request.nextUrl.searchParams.get("secret");

  if (
    !secretMatches(secret) ||
    typeof collection !== "string" ||
    typeof slug !== "string"
  ) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  if (typeof collection === "string" && typeof slug === "string") {
    revalidateTag(`${collection}_${slug}`);

    return NextResponse.json({ now: Date.now(), revalidated: true });
  }

  return NextResponse.json({ now: Date.now(), revalidated: false });
}
