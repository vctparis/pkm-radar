export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.CARDTRADER_API_TOKEN;
  if (!token) {
    return Response.json(
      { connected: false, reason: "missing_secret" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.cardtrader.com/api/v2/info", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    return Response.json(
      {
        connected: response.ok,
        reason: response.ok ? null : "upstream_rejected",
      },
      {
        status: response.ok ? 200 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { connected: false, reason: "upstream_unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
