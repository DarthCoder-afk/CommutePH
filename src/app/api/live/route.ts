import { jsonNoStore } from "@/server/http/json-no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return jsonNoStore(
    {
      status: "ok",
    },
    {
      status: 200,
    },
  );
}
