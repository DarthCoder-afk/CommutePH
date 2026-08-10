import { NextResponse } from "next/server";

import {
  createOperationsSessionValue,
  getOperationsAccessToken,
  operationsCookieName,
  operationsSessionMaxAgeSeconds,
  safelyMatches,
} from "@/server/operations/auth";

export const runtime = "nodejs";

function operationsUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.get("logout") === "1") {
    const response = NextResponse.redirect(
      operationsUrl(request, "/operations/login"),
      303,
    );
    response.cookies.set({
      name: operationsCookieName,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/",
    });
    return response;
  }

  const configuredToken = getOperationsAccessToken();

  if (!configuredToken) {
    return NextResponse.redirect(
      operationsUrl(request, "/operations/login?error=not-configured"),
      303,
    );
  }

  const formData = await request.formData();
  const submittedToken = formData.get("accessToken");

  if (
    typeof submittedToken !== "string" ||
    !safelyMatches(submittedToken, configuredToken)
  ) {
    return NextResponse.redirect(
      operationsUrl(request, "/operations/login?error=invalid"),
      303,
    );
  }

  const response = NextResponse.redirect(
    operationsUrl(request, "/operations"),
    303,
  );
  response.cookies.set({
    name: operationsCookieName,
    value: createOperationsSessionValue(configuredToken),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: operationsSessionMaxAgeSeconds,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: operationsCookieName,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  return response;
}
