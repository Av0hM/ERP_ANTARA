import { handlers } from "@/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handlers.GET(request as never);
}

export async function POST(request: Request) {
  return handlers.POST(request as never);
}
