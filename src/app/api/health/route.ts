import { GET as getReadiness } from "@/app/api/ready/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getReadiness();
}
