import { NextResponse } from "next/server";
import { getTweet } from "react-tweet/api";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const tweet = await getTweet(id);

    return NextResponse.json({ data: tweet });
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch tweet",
      },
      { status: 400 }
    );
  }
}
